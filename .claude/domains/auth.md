# Auth

> Business context for authentication, authorization, and the waitlist gate. Read before touching `backend/auth.py`, OAuth services, or any route with `Depends(verify_auth)`.

## Mechanisms

- **JWT** — HS256, issued by `backend/services/auth.py`. Decoded + user lookup + active check in `backend/auth.py` (`verify_auth`, `verify_admin`, `get_caller_user_id`). Bearer scheme via FastAPI `HTTPBearer`.
- **OAuth (Google)** — `backend/services/google_oauth.py`. Lifespan startup validates client ID + secret in production.
- **OAuth (GitHub)** — `backend/services/github_oauth.py`. Same lifespan validation.
- **Bot secret** — `require_bot_secret()` checks `X-Bot-Secret` header. Used for backend ↔ Telegram bot RPC. Never exposed to end users.
- **Waitlist gate** — `backend/api/waitlist.py` + `backend/repositories/waitlist.py`. Email-first signup; users without invite cannot reach the chat surface.

## ADRs

- `docs/decisions/0004-*` — Telegram-first auth strategy
- `docs/decisions/0008-*` — OAuth2 integration

## Threat model

See `docs/SECURITY.md` for the full threat model. Top concerns: token leakage in logs, OAuth callback origin validation, bot secret rotation.

## Rules

- Never log JWTs, OAuth tokens, or bot secrets
- All auth state changes (login, logout, OAuth callback) must be tested with a real DB session (no mocks — see testing patterns)
- Adding a new protected route: use existing `Depends(verify_auth)` or `Depends(verify_admin)` — don't write a parallel check
