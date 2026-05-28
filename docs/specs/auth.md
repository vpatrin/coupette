# Auth

> OAuth 2.0 (Google + GitHub) + JWT sessions + waitlist gate + Telegram-linked notifications. Email is the identity anchor; Telegram is for alerts only.

## Contract

What auth exposes to callers:

**Web flow (JWT):**

| Endpoint | Purpose |
|---|---|
| `GET /api/auth/{github,google}/login` | Start OAuth flow — sets state in Redis, redirects to provider |
| `GET /api/auth/{github,google}/callback` | Provider callback — exchanges code, upserts user, mints JWT, returns redirect with exchange code |
| `GET /api/auth/exchange?code=...` | Frontend swaps the exchange code for the actual JWT (kept out of URLs) |

**Telegram linking (for notifications + bot access, NOT login):**

| Endpoint | Purpose |
|---|---|
| `GET /users/me/telegram` | Check if Telegram is linked |
| `POST /users/me/telegram` | Link Telegram account (HMAC-verified widget payload) |
| `DELETE /users/me/telegram` | Unlink Telegram account |
| `GET /api/auth/telegram/check` | Bot checks if a Telegram user is registered |

**Auth headers (every protected route):**

| Header | Returns | Used by |
|---|---|---|
| `Authorization: Bearer <jwt>` | `User` object | React frontend |
| `X-Bot-Secret: <secret>` | `None` (no user context) | Telegram bot |

Bot secret is checked first; if valid, JWT is skipped. Bot callers must pass `user_id` explicitly on endpoints that need it.

## How it works

**OAuth flow:**

```
User → "Sign in with Google/GitHub" → OAuth redirect → Provider authorizes
Provider → callback with code + state → Backend exchanges code → fetch user info
Backend → upsert user, mint JWT, store as exchange code → redirect to frontend
Frontend → GET /api/auth/exchange?code=... → receives JWT → stores in localStorage
```

Provider-specific:

| Provider | Scopes | User info |
|---|---|---|
| GitHub | `user:email` | `/user` + `/user/emails` (parallel) |
| Google | `openid email profile` | `/oauth2/v3/userinfo` (single call) |

**Security mechanisms** (see [ADR 0008](../adrs/0008-oauth2-security-design.md) for full layered design):

- **CSRF protection** — random state token in Redis (`oauth:state:<token>`, 10 min TTL), consumed atomically on callback
- **Exchange code pattern** — JWT stored in Redis under a single-use code (60s TTL); frontend swaps via `GET /api/auth/exchange`. Avoids JWT in URLs / Referer headers / logs
- **PKCE (S256)** + AES-256-GCM encrypted state + HMAC-SHA256 signed state + Redis-backed single-use nonce — full RFC 9700 compliance

**Waitlist gate:** new users (no existing account or email match) must have an approved waitlist entry. Unapproved → redirect with `?error=not_approved`.

**Account linking:** if a user logs in with a new provider but their email matches an existing account, the new provider is linked automatically.

**JWT:** HS256, 7-day expiry, `JWT_SECRET_KEY` env var. Claims: `sub` (user ID), `role`, `display_name`, `exp`, `iat`. Frontend decodes the payload (base64, no verification) to extract user info; checks `exp` on load to clear expired tokens.

## Files

| Concern | Where |
|---|---|
| JWT decode + verify_auth / verify_admin / require_bot_secret | `backend/auth.py` |
| OAuth session creation, Telegram HMAC verify | `backend/services/auth.py` |
| GitHub OAuth | `backend/services/github_oauth.py` |
| Google OAuth | `backend/services/google_oauth.py` |
| OAuth routes | `backend/api/auth.py` |
| Telegram link/unlink routes | `backend/api/users.py` |
| Waitlist routes | `backend/api/waitlist.py` |
| Waitlist repo | `backend/repositories/waitlist.py` |
| User model | `core/db/models/user.py` |
| OAuthAccount model | `core/db/models/oauth_account.py` |
| Admin role enforcement | `backend/auth.py` + `backend/app.py:135` (router-level `verify_admin`) |
| Tests | `backend/tests/test_auth_*.py`, `test_oauth_*.py`, `test_waitlist_*.py` |

## Dependencies

- **Redis** — state token, PKCE verifier, exchange code, nonces (all TTL'd, single-use)
- **PostgreSQL** — `users`, `oauth_accounts`, `waitlist_requests` tables
- **GitHub OAuth app** (`GITHUB_CLIENT_ID` + secret)
- **Google OAuth app** (`GOOGLE_CLIENT_ID` + secret)
- **Telegram bot token** — verifies Telegram Login Widget HMAC for the link flow (not login)
- **`cryptography` library** — AES-256-GCM for state encryption

## Cross-cutting concerns

- **Auth:** the subsystem IS the cross-cutting concern. Other subsystems use `Depends(verify_auth)` / `Depends(verify_admin)`; admin router has `dependencies=[Depends(verify_admin)]` at the mount site (`backend/app.py:135`) so every `/admin/*` route inherits it
- **Logging:** OAuth login success structured-logged (`backend/services/auth.py:92`); OAuth callbacks currently silent — gap flagged in [`.claude/agents/reviewer.md`](../../.claude/agents/reviewer.md) audited-gaps section. Tokens/secrets NEVER logged
- **Errors:** mapped to status codes in `backend/errors.py`
- **Observability:** Prometheus metrics on the auth endpoints (rate of logins, failures)
- **Rate limiting:** SlowAPI at the endpoint level — login routes are rate-limited per IP

### Error cases

| Scenario | Status |
|---|---|
| OAuth state invalid/expired | redirect with `?error=invalid_state` |
| New user, email not on waitlist | redirect with `?error=not_approved` |
| User deactivated | 403 |
| JWT missing/expired/malformed | 401 |
| User not found (JWT sub) | 401 |
| Telegram HMAC invalid | 401 |
| Telegram payload > 24h old | 401 |

### Models

**User:**

| Field | Type | Notes |
|---|---|---|
| `id` | Integer (PK) | Auto-increment |
| `email` | String(254) | Unique, not null — primary identity |
| `display_name` | String, null | User-set display name |
| `telegram_id` | BigInteger, null | Unique, optional — notification channel |
| `role` | String(20) | `"user"` (default) or `"admin"` |
| `is_active` | Boolean | Admin kill-switch — blocks all access when false |
| `created_at` | DateTime | When user first registered |
| `last_login_at` | DateTime, null | Updated on each auth |

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

**Env vars (all validated at startup — backend refuses to boot if missing):**

| Variable | Purpose |
|---|---|
| `JWT_SECRET_KEY` | Signs/verifies JWTs |
| `STATE_ENCRYPTION_KEY` | AES-256-GCM key for OAuth state encryption |
| `TELEGRAM_BOT_TOKEN` | Verifies Telegram Login Widget HMAC |
| `BOT_SECRET` | Shared secret for bot → backend calls |
| `ADMIN_EMAIL` | Bootstrap admin user (verified at startup) |
| `GITHUB_CLIENT_ID` / `_SECRET` | GitHub OAuth app |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google OAuth app |
| `FRONTEND_URL` | OAuth redirect target |
| `BACKEND_URL` | OAuth callback base URL |
| `REDIS_URL` | State + nonce + exchange-code storage |

**Admin bootstrap:** `make create-admin` is idempotent — creates or promotes the admin user from `ADMIN_EMAIL`. Backend startup verifies an active admin exists or refuses to boot.

**Deactivation:** admin PATCHes `/api/admin/users/{id}` with `is_active=false`. Cannot deactivate other admins.

**Known gaps** (see [`.claude/agents/reviewer.md`](../../.claude/agents/reviewer.md) audited-gaps): no audit log on admin actions, OAuth callback flow silent (state validation / code exchange / user upsert all unlogged), no sensitive-data redaction filter, no per-account login failure rate limiting.

## Related

- **ADRs:** [`0004-telegram-first-auth.md`](../adrs/0004-telegram-first-auth.md) (original auth strategy, now superseded by 0008), [`0008-oauth2-security-design.md`](../adrs/0008-oauth2-security-design.md) (current — full layered OAuth2 design)
- **Agent rules (imperative form):** [`.claude/rules/auth.md`](../../.claude/rules/auth.md) — security-sensitive imperatives, required test scenarios, mandatory `/security` after non-trivial auth diffs
- **Threat model:** [`../SECURITY.md`](../SECURITY.md)
- **Recent session logs:** look up via [`../session-logs/INDEX.md`](../session-logs/INDEX.md)
