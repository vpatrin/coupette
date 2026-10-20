# Auth

> OAuth 2.0 (Google + GitHub) + JWT sessions + waitlist gate. Email is the identity anchor; a linked Telegram account drives bot access and alerts, never web login.

## Contract

What auth exposes to callers:

**Web flow (JWT):**

| Endpoint | Purpose |
|---|---|
| `GET /api/auth/{github,google}/login` | Start OAuth flow — stores a state token in Redis, redirects to provider |
| `GET /api/auth/{github,google}/callback` | Provider callback — consumes the state, exchanges the code, upserts the user, mints a JWT, redirects to the frontend with an exchange code |
| `GET /api/auth/exchange?code=...` | Frontend swaps the exchange code for the actual JWT (kept out of URLs) |

**Dev-only login (local agents and QA, never deployed):**

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/dev-login` | Body `{email}` → `TokenOut` for an existing active user. Mounted only when `DEV_LOGIN_ENABLED=true` AND `ENVIRONMENT=development`; hidden from OpenAPI; rate limited. Never creates a user (no waitlist bypass). Unknown email → 401, deactivated → 403 |

**Telegram linking (for notifications + bot access, NOT login):**

| Endpoint | Purpose |
|---|---|
| `GET /api/users/me/telegram` | Check if Telegram is linked |
| `POST /api/users/me/telegram` | Link Telegram account (HMAC-verified widget payload) |
| `DELETE /api/users/me/telegram` | Unlink Telegram account |
| `GET /api/auth/telegram/check` | Bot checks that a Telegram user is registered and active (204 / 404 / 403) |

**Auth headers (every protected route):**

| Header | Returns | Used by |
|---|---|---|
| `Authorization: Bearer <jwt>` | `User` object | React frontend |
| `X-Bot-Secret: <secret>` | `None` (no user context) | Telegram bot |

`verify_auth` checks the bot secret first when `BOT_SECRET` is configured: a matching header returns `None` and skips JWT, a wrong one returns 403. Bot callers must pass `user_id` explicitly on endpoints that need it. Routes that need a user (chat, users) depend on `get_current_active_user` directly, so they are JWT-only.

## How it works

**OAuth flow:**

```
User → "Sign in with Google/GitHub" → OAuth redirect → Provider authorizes
Provider → callback with code + state → Backend consumes state, exchanges code → fetch user info
Backend → upsert user, mint JWT, store as exchange code → redirect to frontend
Frontend → GET /api/auth/exchange?code=... → receives JWT → stores in localStorage
```

Provider-specific:

| Provider | Scopes | User info |
|---|---|---|
| GitHub | `user:email` | `/user` + `/user/emails` (parallel) |
| Google | `openid email profile` | `/oauth2/v3/userinfo` (single call) |

**Security mechanisms** (`backend/redis_client.py`):

- **State token** — `secrets.token_urlsafe(32)` stored in Redis as `oauth:state:<token>` (10 min TTL), consumed with a single `DELETE` on callback; a missing or reused state redirects with `?error=invalid_state`
- **Exchange code pattern** — the JWT is stored in Redis as `oauth:exchange:<code>` (60s TTL) and read with `GETDEL`, so a code works once. Avoids JWTs in URLs, Referer headers, and logs

[ADR 0008](../adrs/0008-oauth2-security-design.md) records a fuller layered design (PKCE, encrypted and signed state). The code implements the simpler opaque Redis token above; the ADR's Redis key names and its POST exchange endpoint also differ from the code.

**Waitlist gate:** new users (no existing account or email match) must have an approved waitlist entry. Unapproved → redirect with `?error=not_approved`. A deactivated user who logs in through OAuth gets the same redirect.

**Account linking:** if a user logs in with a new provider but their email matches an existing account, the new provider is linked automatically.

**JWT:** PyJWT, HS256, 7-day expiry, `JWT_SECRET_KEY` env var. Claims: `sub` (user ID), `role`, `display_name`, `exp`, `iat`. Frontend decodes the payload (base64, no verification) to extract user info; checks `exp` on load to clear expired tokens.

## Files

| Concern | Where |
|---|---|
| JWT decode + `verify_auth` / `verify_admin` / `require_bot_secret` | `backend/auth.py` |
| OAuth session creation, dev session, Telegram HMAC verify | `backend/services/auth.py` |
| State token + exchange code (Redis) | `backend/redis_client.py` |
| OAuth routes, `/exchange`, `/telegram/check`, dev-only `dev_router` | `backend/api/auth.py` |
| Telegram link/unlink routes | `backend/api/users.py` |
| Startup guards (`lifespan`), dev-login mount (`include_dev_login`), admin router mount (router-level `verify_admin`) | `backend/app.py` |
| `User`, `OAuthAccount`, `WaitlistRequest` models | `core/db/models.py` |

## Dependencies

- **Redis** — OAuth state tokens, exchange codes, SlowAPI rate-limit counters (all TTL'd)
- **PostgreSQL** — `users`, `oauth_accounts`, `waitlist_requests` tables
- **GitHub OAuth app** (`GITHUB_CLIENT_ID` + secret)
- **Google OAuth app** (`GOOGLE_CLIENT_ID` + secret)
- **Telegram bot token** — verifies Telegram Login Widget HMAC for the link flow (not login)

## Cross-cutting concerns

- **Auth:** the subsystem IS the cross-cutting concern. Every `/api/*` router except auth and waitlist is mounted with `dependencies=[Depends(verify_auth)]` in `backend/app.py`; the admin router gets `Depends(verify_admin)` at its mount, so every `/api/admin/*` route inherits it
- **Logging:** `create_oauth_session` logs a successful login (provider, user id, email). The callback failure paths (invalid state, not approved, provider errors) are not logged — see the "Known gaps" list in [`.claude/agents/reviewer.md`](../../.claude/agents/reviewer.md). Application code never logs tokens or secrets
- **Errors:** domain exceptions mapped to status codes in `backend/errors.py`
- **Observability:** no auth-specific metrics; the generic Prometheus HTTP metrics cover these routes
- **Rate limiting:** SlowAPI `RATE_LIMIT_AUTH` (10/min per IP) on the login routes and dev-login; the global 100/min per IP elsewhere

### Error cases

| Scenario | Status |
|---|---|
| OAuth state invalid/expired | redirect with `?error=invalid_state` |
| New user, email not on waitlist | redirect with `?error=not_approved` |
| Deactivated user, OAuth login | redirect with `?error=not_approved` |
| Deactivated user, JWT request / dev-login / `/telegram/check` | 403 |
| Exchange code unknown, used, or expired | 404 |
| JWT missing/expired/malformed | 401 |
| User not found (JWT sub) | 401 |
| Wrong `X-Bot-Secret` | 403 |
| Telegram HMAC invalid | 401 |
| Telegram payload > 24h old | 401 |
| Consent denied at the provider (no `code`) | 422 JSON, no redirect (known gap) |

### Models

**User:**

| Field | Type | Notes |
|---|---|---|
| `id` | Integer (PK) | Auto-increment |
| `email` | String(254) | Unique, not null — primary identity |
| `display_name` | String, null | User-set display name |
| `telegram_id` | BigInteger, null | Unique, optional — bot access + notification channel |
| `role` | String(20) | `"user"` (default) or `"admin"` |
| `is_active` | Boolean | Admin kill-switch — blocks all access when false |
| `locale` | String(5), null | `'fr'` or `'en'` (check constraint) |
| `created_at` | DateTime | When user first registered |
| `last_login_at` | DateTime, null | Updated on each OAuth login and dev-login |

**OAuthAccount:**

| Field | Type | Notes |
|---|---|---|
| `id` | Integer (PK) | Auto-increment |
| `user_id` | Integer (FK) | References `users.id` (CASCADE delete) |
| `provider` | String(20) | `'github'` or `'google'` (check constraint) |
| `provider_user_id` | String | Provider's stable user identifier |
| `email` | String(254) | Email from provider at time of linking |
| `created_at` | DateTime | When account was linked |

Unique constraint on `(provider, provider_user_id)`.

## Operational notes

**Env vars:**

| Variable | Purpose | Startup check |
|---|---|---|
| `JWT_SECRET_KEY` | Signs/verifies JWTs | Required in production |
| `TELEGRAM_BOT_TOKEN` | Verifies Telegram Login Widget HMAC | Required in production |
| `BOT_SECRET` | Shared secret for bot → backend calls | Required in production |
| `GITHUB_CLIENT_ID` / `_SECRET` | GitHub OAuth app | Required in production |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google OAuth app | Required in production |
| `FRONTEND_URL` | OAuth redirect target | Required in production |
| `BACKEND_URL` | OAuth callback base URL | Required in production |
| `ADMIN_EMAIL` | Bootstrap admin user | Required in every environment, with an active admin row |
| `REDIS_URL` | State, exchange codes, rate-limit counters | Has a default; not checked |
| `DEV_LOGIN_ENABLED` | Default `false`. Mounts the dev-only login in development | The backend refuses to boot when it is `true` outside development (checked first) |

"Required in production" means `lifespan()` in `backend/app.py` refuses to boot when `ENVIRONMENT=production` and the value is empty.

**Admin bootstrap:** locally, `make create-admin` creates or promotes the admin from `ADMIN_EMAIL` (idempotent). The deploy script (`deploy/deploy_backend.sh`) upserts the same row with `psql`. Backend startup refuses to boot without an active admin.

**Deactivation:** admin PATCHes `/api/admin/users/{user_id}` with `is_active=false`. Admin accounts cannot be deactivated (409).

**Known gaps** (see the "Known gaps" list in [`.claude/agents/reviewer.md`](../../.claude/agents/reviewer.md)): no audit log on admin actions, OAuth callback failures unlogged, no log redaction filter, no per-account login-failure limit.

## Related

- **ADRs:** [`0004-telegram-first-auth.md`](../adrs/0004-telegram-first-auth.md) (original auth strategy, replaced by OAuth), [`0008-oauth2-security-design.md`](../adrs/0008-oauth2-security-design.md) (OAuth2 design — see the note under Security mechanisms)
- **Agent rules (imperative form):** [`.claude/rules/auth.md`](../../.claude/rules/auth.md) — security-sensitive imperatives, required test scenarios, the security review an auth PR needs (`/security-review`)
- **Threat model:** [`../SECURITY.md`](../SECURITY.md)
