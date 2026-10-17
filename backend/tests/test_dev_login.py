from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import jwt as pyjwt
import pytest
from fastapi import FastAPI, status

from backend.app import app, lifespan
from backend.auth import verify_auth
from backend.config import ROLE_USER, BackendSettings, backend_settings
from backend.db import get_db
from backend.errors import register_exception_handlers
from backend.rate_limit import limiter
from core.config.settings import settings
from core.db.models import User

from .conftest import BASE_URL, JWT_SECRET, make_test_client

SEEDED_EMAIL = "seeded@example.com"


def _seeded_user(**overrides: object) -> User:
    fields: dict[str, object] = {
        "id": 7,
        "email": SEEDED_EMAIL,
        "display_name": "Seeded User",
        "locale": "en",
        "role": ROLE_USER,
        "is_active": True,
        "last_login_at": None,
    }
    fields.update(overrides)
    return User(**fields)


def _session_returning(user: User | None) -> AsyncMock:
    # Every SELECT through the session resolves to `user` (or no row)
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    session = AsyncMock()
    session.execute = AsyncMock(return_value=result)
    session.add = MagicMock()
    return session


@contextmanager
def _gate(*, environment: str, enabled: bool | None) -> Iterator[None]:
    # enabled=None leaves the flag at its BackendSettings default
    app_settings = (
        BackendSettings(_env_file=None)
        if enabled is None
        else backend_settings.model_copy(update={"DEV_LOGIN_ENABLED": enabled})
    )
    with (
        patch("backend.app.settings", settings.model_copy(update={"ENVIRONMENT": environment})),
        patch("backend.app.backend_settings", app_settings),
    ):
        yield


def _dev_app(*, environment: str, enabled: bool | None, session: AsyncMock) -> FastAPI:
    # New in VPA-52 — imported here so the lifespan tests still collect before it exists
    from backend.app import include_dev_login

    dev_app = FastAPI()
    dev_app.state.limiter = limiter
    register_exception_handlers(dev_app)
    with _gate(environment=environment, enabled=enabled):
        include_dev_login(dev_app)
    dev_app.dependency_overrides[get_db] = lambda: session
    return dev_app


def _client(target: FastAPI) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=target), base_url=BASE_URL)


# ── Mounted route (AC1) ──────────────────────────────────────


async def test_dev_login_returns_token_accepted_by_protected_route_for_seeded_user():
    seeded = _seeded_user()
    session = _session_returning(seeded)
    dev_app = _dev_app(environment="development", enabled=True, session=session)
    app.dependency_overrides.pop(verify_auth, None)
    app.dependency_overrides[get_db] = lambda: session

    with (
        patch.object(backend_settings, "JWT_SECRET_KEY", JWT_SECRET),
        patch("backend.auth.backend_settings") as auth_settings,
    ):
        auth_settings.BOT_SECRET = ""
        auth_settings.JWT_SECRET_KEY = JWT_SECRET
        async with _client(dev_app) as dev_client:
            login = await dev_client.post("/api/auth/dev-login", json={"email": SEEDED_EMAIL})
        token = login.json().get("access_token")
        async with make_test_client() as client:
            me = await client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})

    assert login.status_code == status.HTTP_200_OK
    assert login.json()["token_type"] == "bearer"
    assert pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])["sub"] == str(seeded.id)
    assert me.status_code == status.HTTP_200_OK
    assert me.json()["id"] == seeded.id
    assert me.json()["email"] == SEEDED_EMAIL


@pytest.mark.parametrize("environment", ["production", "staging"])
async def test_dev_login_returns_404_when_flag_is_on_outside_development(environment):
    session = _session_returning(_seeded_user())
    dev_app = _dev_app(environment=environment, enabled=True, session=session)

    async with _client(dev_app) as client:
        resp = await client.post("/api/auth/dev-login", json={"email": SEEDED_EMAIL})

    assert resp.status_code == status.HTTP_404_NOT_FOUND


async def test_dev_login_returns_404_in_development_when_flag_is_unset(monkeypatch):
    monkeypatch.delenv("DEV_LOGIN_ENABLED", raising=False)
    session = _session_returning(_seeded_user())
    dev_app = _dev_app(environment="development", enabled=None, session=session)

    async with _client(dev_app) as client:
        resp = await client.post("/api/auth/dev-login", json={"email": SEEDED_EMAIL})

    assert resp.status_code == status.HTTP_404_NOT_FOUND


async def test_dev_login_returns_401_and_creates_no_user_for_unknown_email():
    session = _session_returning(None)
    dev_app = _dev_app(environment="development", enabled=True, session=session)

    with patch.object(backend_settings, "JWT_SECRET_KEY", JWT_SECRET):
        async with _client(dev_app) as client:
            resp = await client.post("/api/auth/dev-login", json={"email": "nobody@example.com"})

    assert resp.status_code == status.HTTP_401_UNAUTHORIZED
    session.add.assert_not_called()


async def test_dev_login_returns_403_for_inactive_user():
    session = _session_returning(_seeded_user(is_active=False))
    dev_app = _dev_app(environment="development", enabled=True, session=session)

    with patch.object(backend_settings, "JWT_SECRET_KEY", JWT_SECRET):
        async with _client(dev_app) as client:
            resp = await client.post("/api/auth/dev-login", json={"email": SEEDED_EMAIL})

    assert resp.status_code == status.HTTP_403_FORBIDDEN


# ── Boot refusal (AC2, AC3) ──────────────────────────────────


@pytest.mark.parametrize("environment", ["production", "staging"])
async def test_lifespan_refuses_to_start_when_dev_login_enabled_outside_development(environment):
    # No secrets and no admin configured: the refusal must fire before those checks and the DB
    flagged = backend_settings.model_copy(
        update={"DEV_LOGIN_ENABLED": True, "BOT_SECRET": "", "ADMIN_EMAIL": ""}
    )
    db_check = AsyncMock()

    with (
        patch("backend.app.settings", settings.model_copy(update={"ENVIRONMENT": environment})),
        patch("backend.app.backend_settings", flagged),
        patch("backend.app.verify_db_connection", db_check),
        pytest.raises(RuntimeError, match="DEV_LOGIN_ENABLED"),
    ):
        async with lifespan(FastAPI()):
            pass

    db_check.assert_not_awaited()
