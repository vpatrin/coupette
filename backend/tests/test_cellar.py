from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import ANY, AsyncMock, patch

import httpx
import pytest
from fastapi import status
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError

from backend.app import app
from backend.auth import get_current_active_user, verify_auth
from backend.db import get_db
from backend.repositories.cellar import add_bottle_stmt
from backend.tests.conftest import BOT_SECRET, _mock_authenticated_user

NOW = datetime(2026, 1, 1, tzinfo=UTC)
REPO = "backend.services.cellar.repo"


@pytest.fixture()
async def client():
    app.dependency_overrides[get_current_active_user] = _mock_authenticated_user
    app.dependency_overrides[get_db] = lambda: AsyncMock()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


def _fake_entry(**overrides):
    defaults = dict(id=1, user_id=1, sku="SKU001", quantity=1, added_at=NOW)
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _fake_product(**overrides):
    defaults = dict(
        sku="SKU001",
        name="Château Test",
        category="Vin rouge",
        country="France",
        size="750 ml",
        price=None,
        url=None,
        online_availability=True,
        store_availability=None,
        rating=None,
        review_count=None,
        region="Bordeaux",
        appellation=None,
        designation=None,
        classification=None,
        grape=None,
        grape_blend=None,
        alcohol=None,
        sugar=None,
        producer=None,
        vintage="2021",
        taste_tag=None,
        created_at=NOW,
        updated_at=NOW,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _fk_error() -> IntegrityError:
    return IntegrityError(
        "INSERT", {}, Exception('violates foreign key constraint "cellar_entries_sku_fkey"')
    )


# ── Upsert SQL ────────────────────────────────────────────────


class TestAddBottleStmt:
    def test_increments_existing_row_on_user_sku_conflict(self):
        sql = str(add_bottle_stmt(1, "SKU001").compile(dialect=postgresql.dialect()))
        assert "ON CONFLICT ON CONSTRAINT uq_cellar_entries_user_sku DO UPDATE" in sql
        assert "SET quantity = least(cellar_entries.quantity + " in sql

    def test_caps_increment_at_999_bottles(self):
        params = add_bottle_stmt(1, "SKU001").compile(dialect=postgresql.dialect()).params
        assert params["least_1"] == 999


# ── POST /cellar ──────────────────────────────────────────────


class TestAddToCellar:
    async def test_returns_201_with_entry_and_product(self, client):
        with (
            patch(f"{REPO}.add_bottle", new_callable=AsyncMock),
            patch(
                f"{REPO}.find_one",
                new_callable=AsyncMock,
                return_value=(_fake_entry(), _fake_product()),
            ),
        ):
            resp = await client.post("/api/cellar", json={"sku": "SKU001"})
        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()
        assert data["sku"] == "SKU001"
        assert data["quantity"] == 1
        assert data["product"]["name"] == "Château Test"

    async def test_duplicate_add_returns_incremented_quantity(self, client):
        with (
            patch(f"{REPO}.add_bottle", new_callable=AsyncMock),
            patch(
                f"{REPO}.find_one",
                new_callable=AsyncMock,
                return_value=(_fake_entry(quantity=2), _fake_product()),
            ),
        ):
            resp = await client.post("/api/cellar", json={"sku": "SKU001"})
        assert resp.status_code == status.HTTP_201_CREATED
        assert resp.json()["quantity"] == 2

    async def test_unknown_sku_returns_404(self, client):
        with patch(f"{REPO}.add_bottle", new_callable=AsyncMock, side_effect=_fk_error()):
            resp = await client.post("/api/cellar", json={"sku": "NOPE"})
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert "Product" in resp.json()["detail"]

    async def test_non_sku_integrity_error_returns_500(self, client):
        exc = IntegrityError("INSERT", {}, Exception('constraint "cellar_entries_user_id_fkey"'))
        with patch(f"{REPO}.add_bottle", new_callable=AsyncMock, side_effect=exc):
            resp = await client.post("/api/cellar", json={"sku": "SKU001"})
        assert resp.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    async def test_empty_sku_returns_422(self, client):
        resp = await client.post("/api/cellar", json={"sku": ""})
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


# ── GET /cellar ───────────────────────────────────────────────


class TestListCellar:
    async def test_returns_entries_with_nested_product(self, client):
        rows = [
            (_fake_entry(sku="SKU001", quantity=3), _fake_product()),
            (_fake_entry(id=2, sku="SKU002"), None),
        ]
        with patch(f"{REPO}.find_by_user", new_callable=AsyncMock, return_value=rows):
            resp = await client.get("/api/cellar")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        assert [(e["sku"], e["quantity"]) for e in data] == [("SKU001", 3), ("SKU002", 1)]
        assert data[0]["product"]["name"] == "Château Test"
        assert data[1]["product"] is None

    async def test_scopes_query_to_jwt_user_id(self, client):
        with patch(f"{REPO}.find_by_user", new_callable=AsyncMock, return_value=[]) as mock_find:
            resp = await client.get("/api/cellar")
        assert resp.json() == []
        mock_find.assert_awaited_once_with(ANY, 1)


# ── PATCH /cellar/{sku} ───────────────────────────────────────


class TestSetQuantity:
    async def test_returns_200_with_new_quantity(self, client):
        entry = _fake_entry(quantity=2)
        with (
            patch(
                f"{REPO}.find_one", new_callable=AsyncMock, return_value=(entry, _fake_product())
            ),
            patch(
                f"{REPO}.set_quantity",
                new_callable=AsyncMock,
                return_value=_fake_entry(quantity=5),
            ),
        ):
            resp = await client.patch("/api/cellar/SKU001", json={"quantity": 5})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["quantity"] == 5

    async def test_zero_quantity_deletes_entry_and_returns_204(self, client):
        entry = _fake_entry()
        with (
            patch(f"{REPO}.find_one", new_callable=AsyncMock, return_value=(entry, None)),
            patch(f"{REPO}.delete", new_callable=AsyncMock) as mock_delete,
        ):
            resp = await client.patch("/api/cellar/SKU001", json={"quantity": 0})
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert resp.content == b""
        mock_delete.assert_awaited_once_with(ANY, entry)

    async def test_quantity_above_999_returns_422(self, client):
        resp = await client.patch("/api/cellar/SKU001", json={"quantity": 1000})
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    async def test_negative_quantity_returns_422(self, client):
        resp = await client.patch("/api/cellar/SKU001", json={"quantity": -1})
        assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    async def test_missing_entry_returns_404(self, client):
        with patch(f"{REPO}.find_one", new_callable=AsyncMock, return_value=None):
            resp = await client.patch("/api/cellar/SKU001", json={"quantity": 2})
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ── DELETE /cellar/{sku} ──────────────────────────────────────


class TestRemoveFromCellar:
    async def test_returns_204_and_deletes_entry(self, client):
        entry = _fake_entry(quantity=4)
        with (
            patch(f"{REPO}.find_one", new_callable=AsyncMock, return_value=(entry, None)),
            patch(f"{REPO}.delete", new_callable=AsyncMock) as mock_delete,
        ):
            resp = await client.delete("/api/cellar/SKU001")
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        mock_delete.assert_awaited_once_with(ANY, entry)

    async def test_missing_entry_returns_404(self, client):
        with patch(f"{REPO}.find_one", new_callable=AsyncMock, return_value=None):
            resp = await client.delete("/api/cellar/SKU001")
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ── Auth ──────────────────────────────────────────────────────


class TestCellarAuth:
    @pytest.fixture()
    async def raw_client(self):
        # Real verify_auth + get_current_active_user — only the DB is stubbed
        app.dependency_overrides.pop(verify_auth, None)
        app.dependency_overrides[get_db] = lambda: AsyncMock()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c

    async def test_rejects_unauthenticated_request_with_401(self, raw_client):
        resp = await raw_client.get("/api/cellar")
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_rejects_bot_secret_caller_with_401(self, raw_client):
        with patch("backend.auth.backend_settings") as mock_settings:
            mock_settings.BOT_SECRET = BOT_SECRET
            resp = await raw_client.post(
                "/api/cellar", json={"sku": "SKU001"}, headers={"X-Bot-Secret": BOT_SECRET}
            )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED
