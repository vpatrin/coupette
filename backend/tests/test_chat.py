import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import status

from backend.app import app
from backend.auth import get_current_active_user
from backend.db import get_db
from backend.exceptions import ForbiddenError, NotFoundError
from backend.schemas.chat import ChatMessageOut, ChatSessionDetailOut
from backend.schemas.recommendation import IntentResult, RecommendationOut
from backend.services.chat import _extract_multi_turn_context
from backend.tests.conftest import _mock_authenticated_user

NOW = datetime(2026, 3, 12, 12, 0, 0, tzinfo=UTC)
BASE = "http://test"


def _fake_session(**overrides: object) -> SimpleNamespace:
    defaults = dict(id=1, user_id=1, title="recommend a bold red", created_at=NOW, updated_at=NOW)
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _fake_recommendation() -> RecommendationOut:
    return RecommendationOut(
        products=[],
        intent=IntentResult(is_wine=True, semantic_query="bold red"),
        summary="Here are some bold reds.",
    )


def _setup() -> httpx.AsyncClient:
    app.dependency_overrides[get_current_active_user] = _mock_authenticated_user
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url=BASE)


# --- POST /api/chat/sessions (create session) ---


@pytest.mark.asyncio
async def test_create_session_success():
    """201 — session created, titled from message."""
    session = _fake_session()

    with patch("backend.api.chat.create_session", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = session
        async with _setup() as client:
            resp = await client.post("/api/chat/sessions", json={"message": "recommend a bold red"})

    assert resp.status_code == status.HTTP_201_CREATED
    data = resp.json()
    assert data["id"] == 1
    assert data["title"] == "recommend a bold red"
    mock_create.assert_called_once()
    assert mock_create.call_args[0][1] == 1  # user.id


@pytest.mark.asyncio
async def test_create_session_empty_message_rejected():
    """422 — empty message fails validation."""
    async with _setup() as client:
        resp = await client.post("/api/chat/sessions", json={"message": ""})
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# --- POST /api/chat/sessions/{id}/messages (send message) ---


@pytest.mark.asyncio
async def test_send_message_success():
    """201 — message sent, assistant response returned."""
    result = ChatMessageOut(
        message_id=2,
        session_id=1,
        role="assistant",
        content=_fake_recommendation(),
        created_at=NOW,
    )

    with patch("backend.api.chat.send_message", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = result
        async with _setup() as client:
            resp = await client.post(
                "/api/chat/sessions/1/messages", json={"message": "bold red under 30"}
            )

    assert resp.status_code == status.HTTP_201_CREATED
    data = resp.json()
    assert data["role"] == "assistant"
    assert data["session_id"] == 1
    assert "summary" in data["content"]
    mock_send.assert_called_once()
    assert mock_send.call_args[0][1] == 1  # user.id
    assert mock_send.call_args[0][2] == 1  # session_id


@pytest.mark.asyncio
async def test_send_message_session_not_found():
    """404 — session doesn't exist."""
    with patch("backend.api.chat.send_message", new_callable=AsyncMock) as mock_send:
        mock_send.side_effect = NotFoundError("ChatSession", "999")
        async with _setup() as client:
            resp = await client.post("/api/chat/sessions/999/messages", json={"message": "hello"})

    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_send_message_not_owner():
    """403 — session belongs to another user."""
    with patch("backend.api.chat.send_message", new_callable=AsyncMock) as mock_send:
        mock_send.side_effect = ForbiddenError("Chat session access denied")
        async with _setup() as client:
            resp = await client.post("/api/chat/sessions/1/messages", json={"message": "hello"})

    assert resp.status_code == status.HTTP_403_FORBIDDEN


# --- GET /api/chat/sessions (list) ---


@pytest.mark.asyncio
async def test_list_sessions_success():
    """200 — returns user's sessions."""
    sessions = [_fake_session(id=1), _fake_session(id=2, title="Italian wines")]

    with patch("backend.api.chat.list_sessions", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = sessions
        async with _setup() as client:
            resp = await client.get("/api/chat/sessions")

    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert len(data) == 2
    mock_list.assert_called_once()
    assert mock_list.call_args[0][1] == 1  # user.id


@pytest.mark.asyncio
async def test_list_sessions_with_pagination():
    """200 — respects limit and offset params."""
    with patch("backend.api.chat.list_sessions", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = []
        async with _setup() as client:
            resp = await client.get("/api/chat/sessions?limit=5&offset=10")

    assert resp.status_code == status.HTTP_200_OK
    args = mock_list.call_args
    assert args[0][2] == 5  # limit
    assert args[0][3] == 10  # offset


# --- GET /api/chat/sessions/{id} (detail) ---


@pytest.mark.asyncio
async def test_get_session_detail_success():
    """200 — returns session with messages."""
    detail = ChatSessionDetailOut(
        id=1,
        title="bold red",
        created_at=NOW,
        updated_at=NOW,
        messages=[
            ChatMessageOut(
                message_id=1, session_id=1, role="user", content="bold red", created_at=NOW
            ),
            ChatMessageOut(
                message_id=2,
                session_id=1,
                role="assistant",
                content=_fake_recommendation(),
                created_at=NOW,
            ),
        ],
    )

    with patch("backend.api.chat.get_session", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = detail
        async with _setup() as client:
            resp = await client.get("/api/chat/sessions/1")

    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert len(data["messages"]) == 2
    assert data["messages"][0]["role"] == "user"
    assert data["messages"][1]["role"] == "assistant"


@pytest.mark.asyncio
async def test_get_session_not_found():
    """404 — session doesn't exist."""
    with patch("backend.api.chat.get_session", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = NotFoundError("ChatSession", "999")
        async with _setup() as client:
            resp = await client.get("/api/chat/sessions/999")

    assert resp.status_code == status.HTTP_404_NOT_FOUND


# --- PATCH /api/chat/sessions/{id} (update title) ---


@pytest.mark.asyncio
async def test_update_session_title():
    """200 — session title updated."""
    updated = _fake_session(title="New title")

    with patch("backend.api.chat.update_session", new_callable=AsyncMock) as mock_update:
        mock_update.return_value = updated
        async with _setup() as client:
            resp = await client.patch("/api/chat/sessions/1", json={"title": "New title"})

    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["title"] == "New title"
    mock_update.assert_called_once()
    assert mock_update.call_args[0][1] == 1  # user.id


# --- DELETE /api/chat/sessions/{id} ---


@pytest.mark.asyncio
async def test_delete_session_success():
    """204 — session deleted."""
    with patch("backend.api.chat.delete_session", new_callable=AsyncMock) as mock_del:
        mock_del.return_value = None
        async with _setup() as client:
            resp = await client.delete("/api/chat/sessions/1")

    assert resp.status_code == status.HTTP_204_NO_CONTENT
    mock_del.assert_called_once()
    assert mock_del.call_args[0][1] == 1  # user.id
    assert mock_del.call_args[0][2] == 1  # session_id


@pytest.mark.asyncio
async def test_delete_session_not_found():
    """404 — session doesn't exist."""
    with patch("backend.api.chat.delete_session", new_callable=AsyncMock) as mock_del:
        mock_del.side_effect = NotFoundError("ChatSession", "999")
        async with _setup() as client:
            resp = await client.delete("/api/chat/sessions/999")

    assert resp.status_code == status.HTTP_404_NOT_FOUND


# --- Multi-turn context helpers ---


def _fake_msg(role: str, content: str) -> SimpleNamespace:
    return SimpleNamespace(role=role, content=content)


def _recommendation_json(skus: list[str], summary: str = "Summary") -> str:
    products = [
        {
            "product": {
                "sku": sku,
                "name": f"Wine {sku}",
                "category": "Vin rouge",
                "country": "France",
                "size": "750 ml",
                "price": 25.00,
                "online_availability": True,
                "rating": None,
                "review_count": None,
                "region": None,
                "appellation": None,
                "designation": None,
                "classification": None,
                "grape": None,
                "grape_blend": None,
                "alcohol": None,
                "sugar": None,
                "producer": None,
                "url": f"https://saq.com/{sku}",
                "store_availability": [],
                "vintage": None,
                "taste_tag": None,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            },
            "reason": "Good wine",
        }
        for sku in skus
    ]
    rec = {"products": products, "intent": {"semantic_query": "test"}, "summary": summary}
    return json.dumps(rec)


class TestExtractMultiTurnContext:
    def test_extracts_skus_from_assistant_messages(self) -> None:
        messages = [
            _fake_msg("user", "bold red"),
            _fake_msg("assistant", _recommendation_json(["111", "222"])),
            _fake_msg("user", "something else"),
            _fake_msg("assistant", _recommendation_json(["333"])),
        ]
        skus, _ = _extract_multi_turn_context(messages)
        assert skus == ["111", "222", "333"]

    def test_ignores_user_messages(self) -> None:
        messages = [_fake_msg("user", "hello")]
        skus, _ = _extract_multi_turn_context(messages)
        assert skus == []

    def test_ignores_malformed_assistant(self) -> None:
        messages = [_fake_msg("assistant", "not valid json")]
        skus, _ = _extract_multi_turn_context(messages)
        assert skus == []

    def test_empty_messages(self) -> None:
        skus, history = _extract_multi_turn_context([])
        assert skus == []
        assert history == ""

    def test_history_condensed_output(self) -> None:
        messages = [
            _fake_msg("user", "bold red for steak"),
            _fake_msg("assistant", _recommendation_json(["111"], summary="Great reds.")),
        ]
        _, history = _extract_multi_turn_context(messages)
        assert "User: bold red for steak" in history
        assert "Assistant: Great reds." in history

    def test_history_malformed_assistant_falls_back(self) -> None:
        messages = [
            _fake_msg("user", "hello"),
            _fake_msg("assistant", "plain text response"),
        ]
        _, history = _extract_multi_turn_context(messages)
        assert "Assistant: plain text response" in history

    @patch("backend.services.chat.CONTEXT_WINDOW_TURNS", 1)
    def test_history_respects_window_limit(self) -> None:
        messages = [
            _fake_msg("user", "first query"),
            _fake_msg("assistant", _recommendation_json(["111"], summary="First.")),
            _fake_msg("user", "second query"),
            _fake_msg("assistant", _recommendation_json(["222"], summary="Second.")),
        ]
        skus, history = _extract_multi_turn_context(messages)
        # SKUs come from ALL messages
        assert skus == ["111", "222"]
        # History only from last 1 turn (2 messages)
        assert "first query" not in history
        assert "second query" in history
