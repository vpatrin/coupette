from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import status
from sqlalchemy.exc import IntegrityError

from backend.app import app
from backend.auth import get_current_active_user, verify_auth
from backend.config import MAX_CELLAR_QUANTITY, MAX_SKU_LENGTH
from backend.db import get_db
from core.db.models import User

from .conftest import BOT_SECRET, make_test_client

NOW = datetime(2025, 1, 1, tzinfo=UTC)
LATER = datetime(2025, 3, 1, tzinfo=UTC)

ENTRY_KEYS = {"sku", "quantity", "added_at", "product"}

# ── Helpers ───────────────────────────────────────────────────


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
        online_availability=True,
        rating=None,
        review_count=None,
        region="Bordeaux",
        appellation=None,
        designation=None,
        classification=None,
        grape="Merlot",
        alcohol="13.5%",
        sugar=None,
        producer=None,
        created_at=NOW,
        updated_at=NOW,
        delisted_at=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _login_as(user_id: int) -> None:
    user = MagicMock(spec=User)
    user.id = user_id
    user.is_active = True
    app.dependency_overrides[get_current_active_user] = lambda: user


def _repo(name: str, **kwargs):
    return patch(f"backend.services.cellar.repo.{name}", new_callable=AsyncMock, **kwargs)


@pytest.fixture()
def session() -> AsyncMock:
    return AsyncMock()


@pytest.fixture()
async def client(session):
    """Client authenticated as user id=1."""
    app.dependency_overrides[get_db] = lambda: session
    _login_as(1)
    async with make_test_client() as c:
        yield c


@pytest.fixture()
async def anon_client(session):
    """Client with no bearer token — get_current_active_user runs for real."""
    app.dependency_overrides[get_db] = lambda: session
    async with make_test_client() as c:
        yield c


# ── POST /cellar ──────────────────────────────────────────────


async def test_post_creates_entry_and_returns_201_with_nested_product(client):
    entry = _fake_entry(sku="SKU001", quantity=1)
    with _repo("upsert", return_value=(entry, _fake_product())):
        resp = await client.post("/api/cellar", json={"sku": "SKU001"})

    assert resp.status_code == status.HTTP_201_CREATED
    data = resp.json()
    assert data["sku"] == "SKU001"
    assert data["quantity"] == 1
    assert data["added_at"] == "2025-01-01T00:00:00Z"
    assert data["product"]["sku"] == "SKU001"
    assert data["product"]["name"] == "Château Test"


async def test_post_response_exposes_only_entry_fields_without_user_id(client):
    entry = _fake_entry(user_id=1)
    with _repo("upsert", return_value=(entry, _fake_product())):
        resp = await client.post("/api/cellar", json={"sku": "SKU001"})

    data = resp.json()
    assert set(data) == ENTRY_KEYS
    assert "user_id" not in data["product"]


async def test_post_defaults_quantity_to_one_when_omitted(client, session):
    with _repo("upsert", return_value=(_fake_entry(), _fake_product())) as upsert:
        await client.post("/api/cellar", json={"sku": "SKU001"})

    upsert.assert_awaited_once_with(session, 1, "SKU001", 1)


async def test_post_returns_201_with_repo_total_when_sku_already_owned(client, session):
    # The atomic increment lives in the SQL (see test_cellar_repository); here the route
    # must hand the requested delta to the repo and report the total the repo returns.
    owned_then_added = _fake_entry(quantity=5)
    with _repo("upsert", return_value=(owned_then_added, _fake_product())) as upsert:
        resp = await client.post("/api/cellar", json={"sku": "SKU001", "quantity": 3})

    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.json()["quantity"] == 5
    upsert.assert_awaited_once_with(session, 1, "SKU001", 3)


@pytest.mark.parametrize("quantity", [1, MAX_CELLAR_QUANTITY])
async def test_post_accepts_quantity_at_the_boundaries(client, session, quantity):
    entry = _fake_entry(quantity=quantity)
    with _repo("upsert", return_value=(entry, _fake_product())) as upsert:
        resp = await client.post("/api/cellar", json={"sku": "SKU001", "quantity": quantity})

    assert resp.status_code == status.HTTP_201_CREATED
    upsert.assert_awaited_once_with(session, 1, "SKU001", quantity)


@pytest.mark.parametrize("quantity", ["2", 2.0])
async def test_post_coerces_whole_number_quantity_to_int(client, session, quantity):
    with _repo("upsert", return_value=(_fake_entry(quantity=2), _fake_product())) as upsert:
        resp = await client.post("/api/cellar", json={"sku": "SKU001", "quantity": quantity})

    assert resp.status_code == status.HTTP_201_CREATED
    upsert.assert_awaited_once_with(session, 1, "SKU001", 2)


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"sku": "SKU001", "quantity": 0}, id="quantity-zero"),
        pytest.param({"sku": "SKU001", "quantity": -1}, id="quantity-negative"),
        pytest.param(
            {"sku": "SKU001", "quantity": MAX_CELLAR_QUANTITY + 1}, id="quantity-over-cap"
        ),
        pytest.param({"sku": "SKU001", "quantity": 2.5}, id="quantity-fractional"),
        pytest.param({"sku": "SKU001", "quantity": "a"}, id="quantity-non-numeric"),
        pytest.param({"sku": "SKU001", "quantity": None}, id="quantity-null"),
        pytest.param({"sku": ""}, id="sku-empty"),
        pytest.param({"quantity": 1}, id="sku-missing"),
        pytest.param({"sku": "S" * (MAX_SKU_LENGTH + 1)}, id="sku-too-long"),
        pytest.param(None, id="body-missing"),
    ],
)
async def test_post_rejects_invalid_body_with_422_before_touching_the_repo(client, body):
    with _repo("upsert") as upsert:
        resp = await client.post("/api/cellar", json=body)

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    upsert.assert_not_awaited()


async def test_post_returns_404_naming_the_sku_when_sku_is_unknown(client, session):
    fk_violation = IntegrityError("INSERT", {}, Exception("foreign key constraint"))
    with _repo("upsert", side_effect=fk_violation):
        resp = await client.post("/api/cellar", json={"sku": "NOPE"})

    assert resp.status_code == status.HTTP_404_NOT_FOUND
    assert resp.json()["detail"] == "Product 'NOPE' not found"
    session.rollback.assert_awaited_once()


async def test_post_returns_201_with_product_populated_for_delisted_sku(client):
    delisted = _fake_product(delisted_at=NOW)
    with _repo("upsert", return_value=(_fake_entry(), delisted)):
        resp = await client.post("/api/cellar", json={"sku": "SKU001"})

    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.json()["product"]["name"] == "Château Test"


async def test_post_ignores_body_user_id_and_uses_the_jwt_user(client, session):
    with _repo("upsert", return_value=(_fake_entry(), _fake_product())) as upsert:
        resp = await client.post("/api/cellar", json={"sku": "SKU001", "user_id": 99})

    assert resp.status_code == status.HTTP_201_CREATED
    upsert.assert_awaited_once_with(session, 1, "SKU001", 1)


async def test_post_adds_to_the_second_users_cellar_when_authenticated_as_user_2(client, session):
    _login_as(2)
    with _repo("upsert", return_value=(_fake_entry(user_id=2), _fake_product())) as upsert:
        await client.post("/api/cellar", json={"sku": "SKU001"})

    upsert.assert_awaited_once_with(session, 2, "SKU001", 1)


# ── GET /cellar ───────────────────────────────────────────────


async def test_get_returns_entries_in_repo_order_with_nested_products(client):
    newer = (
        _fake_entry(sku="SKU002", quantity=4, added_at=LATER),
        _fake_product(sku="SKU002", name="Second Wine"),
    )
    older = (_fake_entry(sku="SKU001", quantity=2), _fake_product(sku="SKU001"))
    with _repo("find_by_user", return_value=[newer, older]):
        resp = await client.get("/api/cellar")

    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert [e["sku"] for e in data] == ["SKU002", "SKU001"]
    assert [e["quantity"] for e in data] == [4, 2]
    assert data[0]["product"]["name"] == "Second Wine"
    assert data[1]["product"]["name"] == "Château Test"
    assert all(set(e) == ENTRY_KEYS for e in data)


async def test_get_returns_200_with_empty_list_when_cellar_is_empty(client):
    with _repo("find_by_user", return_value=[]):
        resp = await client.get("/api/cellar")

    assert resp.status_code == status.HTTP_200_OK
    assert resp.json() == []


@pytest.mark.parametrize("user_id", [pytest.param(1, id="user-1"), pytest.param(2, id="user-2")])
async def test_get_ignores_user_id_query_param_and_uses_the_jwt_user(client, session, user_id):
    _login_as(user_id)
    with _repo("find_by_user", return_value=[]) as find_by_user:
        await client.get("/api/cellar?user_id=99")

    find_by_user.assert_awaited_once_with(session, user_id)


# ── PATCH /cellar/{sku} ───────────────────────────────────────


async def test_patch_sets_quantity_and_returns_200_with_updated_entry(client, session):
    entry = _fake_entry(quantity=2)
    with _repo("find_one", return_value=(entry, _fake_product())):
        resp = await client.patch("/api/cellar/SKU001", json={"quantity": 5})

    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert set(data) == ENTRY_KEYS
    assert data["sku"] == "SKU001"
    assert data["quantity"] == 5
    assert data["product"]["name"] == "Château Test"
    session.flush.assert_awaited_once()


async def test_patch_accepts_the_max_quantity(client):
    entry = _fake_entry(quantity=2)
    with _repo("find_one", return_value=(entry, _fake_product())):
        resp = await client.patch("/api/cellar/SKU001", json={"quantity": MAX_CELLAR_QUANTITY})

    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["quantity"] == MAX_CELLAR_QUANTITY


async def test_patch_to_zero_deletes_entry_and_returns_204_without_body(client, session):
    entry = _fake_entry(quantity=3)
    with _repo("find_one", return_value=(entry, _fake_product())):
        resp = await client.patch("/api/cellar/SKU001", json={"quantity": 0})

    assert resp.status_code == status.HTTP_204_NO_CONTENT
    assert resp.content == b""
    session.delete.assert_awaited_once_with(entry)
    assert entry.quantity == 3


@pytest.mark.parametrize("user_id", [pytest.param(1, id="user-1"), pytest.param(2, id="user-2")])
async def test_patch_looks_up_entry_under_callers_id_and_returns_404_when_missing(
    client, session, user_id
):
    _login_as(user_id)
    with _repo("find_one", return_value=None) as find_one:
        resp = await client.patch("/api/cellar/SKU001", json={"quantity": 5})

    assert resp.status_code == status.HTTP_404_NOT_FOUND
    assert resp.json()["detail"] == "CellarEntry 'SKU001' not found"
    find_one.assert_awaited_once_with(session, user_id, "SKU001")
    session.flush.assert_not_awaited()


async def test_patch_to_zero_returns_404_when_entry_is_missing(client, session):
    with _repo("find_one", return_value=None):
        resp = await client.patch("/api/cellar/SKU001", json={"quantity": 0})

    assert resp.status_code == status.HTTP_404_NOT_FOUND
    session.delete.assert_not_awaited()


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"quantity": -1}, id="quantity-negative"),
        pytest.param({"quantity": MAX_CELLAR_QUANTITY + 1}, id="quantity-over-cap"),
        pytest.param({"quantity": 2.5}, id="quantity-fractional"),
        pytest.param({"quantity": "x"}, id="quantity-non-numeric"),
        pytest.param({"quantity": None}, id="quantity-null"),
        pytest.param({}, id="quantity-missing"),
        pytest.param(None, id="body-missing"),
    ],
)
async def test_patch_rejects_invalid_body_with_422_before_touching_the_repo(client, body):
    with _repo("find_one") as find_one:
        resp = await client.patch("/api/cellar/SKU001", json=body)

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    find_one.assert_not_awaited()


async def test_patch_rejects_overlong_sku_path_with_422(client):
    with _repo("find_one") as find_one:
        resp = await client.patch(f"/api/cellar/{'S' * (MAX_SKU_LENGTH + 1)}", json={"quantity": 2})

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    find_one.assert_not_awaited()


# ── DELETE /cellar/{sku} ──────────────────────────────────────


async def test_delete_removes_entry_whatever_its_quantity_and_returns_204(client, session):
    entry = _fake_entry(quantity=12)
    with _repo("find_one", return_value=(entry, _fake_product())) as find_one:
        resp = await client.delete("/api/cellar/SKU001")

    assert resp.status_code == status.HTTP_204_NO_CONTENT
    assert resp.content == b""
    find_one.assert_awaited_once_with(session, 1, "SKU001")
    session.delete.assert_awaited_once_with(entry)


@pytest.mark.parametrize("user_id", [pytest.param(1, id="user-1"), pytest.param(2, id="user-2")])
async def test_delete_looks_up_entry_under_callers_id_and_returns_404_when_missing(
    client, session, user_id
):
    _login_as(user_id)
    with _repo("find_one", return_value=None) as find_one:
        resp = await client.delete("/api/cellar/SKU001")

    assert resp.status_code == status.HTTP_404_NOT_FOUND
    assert resp.json()["detail"] == "CellarEntry 'SKU001' not found"
    find_one.assert_awaited_once_with(session, user_id, "SKU001")
    session.delete.assert_not_awaited()


async def test_delete_rejects_overlong_sku_path_with_422(client):
    with _repo("find_one") as find_one:
        resp = await client.delete(f"/api/cellar/{'S' * (MAX_SKU_LENGTH + 1)}")

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    find_one.assert_not_awaited()


# ── Authentication ────────────────────────────────────────────


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        pytest.param("POST", "/api/cellar", {"sku": "SKU001"}, id="post"),
        pytest.param("GET", "/api/cellar", None, id="get"),
        pytest.param("PATCH", "/api/cellar/SKU001", {"quantity": 2}, id="patch"),
        pytest.param("DELETE", "/api/cellar/SKU001", None, id="delete"),
    ],
)
async def test_route_returns_401_without_bearer_token(anon_client, method, path, body):
    with patch("backend.services.cellar.repo") as repo:
        resp = await anon_client.request(method, path, json=body)

    assert resp.status_code == status.HTTP_401_UNAUTHORIZED
    assert repo.mock_calls == []


async def test_get_returns_401_for_bot_secret_caller_without_bearer_token(anon_client):
    app.dependency_overrides.pop(verify_auth, None)
    with (
        patch("backend.auth.backend_settings") as settings,
        patch("backend.services.cellar.repo") as repo,
    ):
        settings.BOT_SECRET = BOT_SECRET
        resp = await anon_client.get("/api/cellar", headers={"X-Bot-Secret": BOT_SECRET})

    assert resp.status_code == status.HTTP_401_UNAUTHORIZED
    assert repo.mock_calls == []


async def test_route_returns_403_for_wrong_bot_secret_proving_router_mounts_global_auth(
    anon_client,
):
    app.dependency_overrides.pop(verify_auth, None)
    with (
        patch("backend.auth.backend_settings") as settings,
        patch("backend.services.cellar.repo") as repo,
    ):
        settings.BOT_SECRET = BOT_SECRET
        resp = await anon_client.get("/api/cellar", headers={"X-Bot-Secret": "wrong-value"})

    assert resp.status_code == status.HTTP_403_FORBIDDEN
    assert repo.mock_calls == []
