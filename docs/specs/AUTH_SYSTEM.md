# Auth System

OAuth 2.0 (Google + GitHub) + JWT sessions + waitlist gate. ADRs: [0004-telegram-first-auth](../decisions/0004-telegram-first-auth.md) (original), [0008-oauth2-security-design](../decisions/0008-oauth2-security-design.md) (current).

---

## Flow

```text
User → "Sign in with Google/GitHub" → OAuth redirect → Provider authorizes
Provider → callback with code + state → Backend exchanges code → fetch user info
Backend → upsert user, mint JWT, store as exchange code → redirect to frontend
Frontend → GET /api/auth/exchange?code=... → receives JWT → stores in localStorage
```

## OAuth Providers

| Provider | Scopes                   | User info                                |
|----------|--------------------------|------------------------------------------|
| GitHub   | `user:email`             | `/user` + `/user/emails` (parallel)      |
| Google   | `openid email profile`   | `/oauth2/v3/userinfo` (single call)      |

**CSRF protection:** Random state token stored in Redis (`oauth:state:<token>`, 10 min TTL), consumed atomically on callback.

**Exchange code pattern:** After OAuth, the JWT is stored in Redis under a single-use code (60s TTL). The frontend swaps it via `GET /api/auth/exchange`. This avoids putting JWTs in URLs.

**Waitlist gate:** New users (no existing account or email match) must have an approved waitlist entry. Unapproved users are redirected with `?error=not_approved`.

**Account linking:** If a user logs in with a new provider but their email matches an existing account, the new provider is linked automatically.

**Code:** `backend/api/auth.py`, `backend/services/auth.py` → `create_oauth_session()`, `backend/services/github_oauth.py`, `backend/services/google_oauth.py`

## JWT Token

**Algorithm:** HS256 · **Expiry:** 7 days · **Secret:** `JWT_SECRET_KEY` env var

Claims:

| Claim          | Type     | Example           |
|----------------|----------|-------------------|
| `sub`          | str      | `"1"` (user ID)   |
| `role`         | str      | `"user"`, `"admin"` |
| `display_name` | str/null | `"Victor"`        |
| `exp`          | datetime | now + 7 days      |
| `iat`          | datetime | now               |

Frontend decodes the payload (base64, no verification) to extract user info. Checks `exp` on load to clear expired tokens.

## Dual Auth Paths

| Path | Header | Returns | Used by |
|------|--------|---------|---------|
| Web (JWT) | `Authorization: Bearer <token>` | `User` object | React frontend |
| Bot (shared secret) | `X-Bot-Secret: <secret>` | `None` (no user context) | Telegram bot |

Bot secret checked first. If present and valid, JWT is skipped. Bot callers must pass `user_id` explicitly on endpoints that need it.

## Telegram (Notifications + Bot Access)

Telegram is **not a login provider** — it's linked in Settings for two purposes:

1. **Notifications** — watch alerts, availability updates via `@CoupetteBot`
2. **Bot access** — the bot's `access_gate()` middleware checks the user exists and is active by `telegram_id`

| Endpoint | Purpose |
|----------|---------|
| `GET /users/me/telegram` | Check if Telegram is linked |
| `POST /users/me/telegram` | Link Telegram account (HMAC-verified widget payload) |
| `DELETE /users/me/telegram` | Unlink Telegram account |
| `GET /api/auth/telegram/check` | Bot checks if a Telegram user is registered |

Linking uses the Telegram Login Widget with HMAC-SHA-256 verification (same as the original login flow). The `telegram_id` is stored on the `users` table, not in `oauth_accounts`.

**Code:** `backend/api/users.py` (link/unlink), `backend/services/auth.py` → `verify_telegram_data()`

## User Model

| Field          | Type           | Notes                                          |
|----------------|----------------|-------------------------------------------------|
| `id`           | Integer (PK)   | Auto-increment                                  |
| `email`        | String(254)    | Unique, not null — primary identity              |
| `display_name` | String, null   | User-set display name                            |
| `telegram_id`  | BigInteger, null | Unique, optional — notification channel          |
| `role`         | String(20)     | `"user"` (default) or `"admin"`                  |
| `is_active`    | Boolean        | Admin kill-switch — blocks all access when false |
| `created_at`   | DateTime       | When user first registered                       |
| `last_login_at`| DateTime, null | Updated on each auth                             |

## OAuthAccount Model

| Field              | Type        | Notes                                     |
|--------------------|-------------|-------------------------------------------|
| `id`               | Integer (PK)| Auto-increment                             |
| `user_id`          | Integer (FK)| References `users.id` (CASCADE delete)     |
| `provider`         | String(20)  | `'github'` or `'google'` (check constraint)|
| `provider_user_id` | String      | Provider's stable user identifier           |
| `email`            | String(254) | Email from provider at time of linking      |
| `created_at`       | DateTime    | When account was linked                     |

Unique constraint on `(provider, provider_user_id)`.

## Role Enforcement

- **Regular routes**: `verify_auth()` → accepts JWT or bot secret
- **Admin routes**: `verify_admin()` → requires JWT with `role=admin`. Bot callers rejected.
- **Deactivation**: Admin PATCHes `/api/admin/users/{id}` with `is_active=false`. Cannot deactivate other admins.

## Admin Bootstrap

Idempotent `make create-admin` — creates or promotes the admin user from `ADMIN_EMAIL` env var. Backend startup verifies an active admin exists or refuses to boot.

## Error Cases

| Scenario                         | Status |
|----------------------------------|--------|
| OAuth state invalid/expired      | redirect with `?error=invalid_state` |
| New user, email not on waitlist  | redirect with `?error=not_approved` |
| User deactivated                 | 403    |
| JWT missing/expired/malformed    | 401    |
| User not found (JWT sub)        | 401    |
| Telegram HMAC invalid           | 401    |
| Telegram payload > 24h old      | 401    |

## Environment Variables

| Variable              | Purpose                                    |
|-----------------------|--------------------------------------------|
| `JWT_SECRET_KEY`      | Signs/verifies JWTs                        |
| `TELEGRAM_BOT_TOKEN`  | Verifies Telegram Login Widget HMAC        |
| `BOT_SECRET`          | Shared secret for bot → backend calls      |
| `ADMIN_EMAIL`         | Bootstrap admin user (verified at startup)  |
| `GITHUB_CLIENT_ID`    | GitHub OAuth app ID                        |
| `GITHUB_CLIENT_SECRET`| GitHub OAuth app secret                    |
| `GOOGLE_CLIENT_ID`    | Google OAuth app ID                        |
| `GOOGLE_CLIENT_SECRET`| Google OAuth app secret                    |
| `FRONTEND_URL`        | OAuth redirect target                      |
| `BACKEND_URL`         | OAuth callback base URL                    |
