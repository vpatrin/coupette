---
paths:
  - "backend/auth.py"
  - "backend/services/auth.py"
  - "backend/services/google_oauth.py"
  - "backend/services/github_oauth.py"
  - "backend/api/auth.py"
  - "backend/api/waitlist.py"
  - "backend/repositories/waitlist.py"
---

# Auth — SECURITY-SENSITIVE

> Single source of truth for JWT, OAuth, waitlist, bot-secret. Read whenever touching `backend/auth.py`, OAuth services, or any route with `Depends(verify_auth)`.

## Mechanisms

- **JWT** — HS256, issued by `backend/services/auth.py`. Decoded + user lookup + active check in `backend/auth.py` (`verify_auth`, `verify_admin`, `get_caller_user_id`). Bearer scheme via FastAPI `HTTPBearer`.
- **OAuth (Google)** — `backend/services/google_oauth.py`. Lifespan startup validates client ID + secret in production.
- **OAuth (GitHub)** — `backend/services/github_oauth.py`. Same lifespan validation.
- **Bot secret** — `require_bot_secret()` checks `X-Bot-Secret` header. Used for backend ↔ Telegram bot RPC. Never exposed to end users.
- **Waitlist gate** — `backend/api/waitlist.py` + `backend/repositories/waitlist.py`. Email-first signup; users without invite cannot reach the chat surface.

## Hard rules

1. **Never log JWTs, OAuth tokens, the bot secret, or session tokens.** Audit every `logger.*` / `print()` near token-holding variables. No raw values in formatted strings either.
2. **Reuse existing auth dependencies.** New protected routes: `Depends(verify_auth)` or `Depends(verify_admin)`. Never write a parallel auth check.
3. **Real DB sessions in auth tests.** No mocking `AsyncSession`, `get_db`, or the user repository. Use the test DB fixture.
4. **New secret?** Add to the production lifespan validation in `backend/main.py` so missing config fails fast at boot.
5. **OAuth callbacks:** validate origin / state parameter. Never trust the callback blindly.
6. **Admin route check:** verify both per-route `Depends(...)` AND the `app.include_router(..., dependencies=[Depends(verify_admin)])` mount site. Protection may be applied at the router level (e.g. `backend/app.py:135` for the admin router) — a route without a per-route dep is NOT necessarily unprotected.

## Required test scenarios for auth changes

happy path · token expiry · invalid/tampered token · unauthenticated request · authorized user (positive) · waitlist gate (if relevant)

## ADRs + threat model

- `docs/decisions/0004-*` — Telegram-first auth strategy
- `docs/decisions/0008-*` — OAuth2 integration
- `docs/SECURITY.md` — full threat model (token leakage, OAuth callback origin, bot-secret rotation)

## Recommended after any non-trivial auth diff

Run `/security` for a second-pass appsec review.
