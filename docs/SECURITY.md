# Security

Application-level security model. VPS-level hardening (firewall, SSH, TLS) lives in the [infra repo](https://github.com/vpatrin/infra/blob/main/docs/INFRASTRUCTURE.md).

---

## Authentication

### OAuth providers (identity)

Users authenticate via third-party OAuth providers. The backend handles the full OAuth 2.0 flow: state generation, authorization redirect, code exchange, and user info fetch. Telegram is not a login provider: it is linked from Settings for notifications and bot access (below).

| Provider  | Scopes              | User info endpoint                       |
|-----------|---------------------|------------------------------------------|
| GitHub    | `user:email`        | `/user` + `/user/emails` (parallel)      |
| Google    | `openid email profile` | `/oauth2/v3/userinfo` (single call)   |

**State token:** a random token stored in Redis (`oauth:state:<token>`, 10 min TTL) and consumed atomically on callback via `DELETE`, so each state works once. An unknown or reused state redirects with `?error=invalid_state`.

**Exchange code pattern:** After successful OAuth, the backend stores the JWT in Redis under a random single-use code (`oauth:exchange:<code>`, 60s TTL, read with `GETDEL`). The browser is redirected to the frontend with `?code=...`, which swaps it for the JWT via `GET /api/auth/exchange`. This avoids putting JWTs in URLs (logs, referrer, browser history).

**Waitlist gate:** New users (no existing account or email match) must have an approved waitlist entry. Unapproved users are redirected to the frontend with `?error=not_approved`.

**Account linking:** If a user logs in with a new OAuth provider but their email matches an existing account, the new provider is linked automatically — one user, multiple login methods.

**Code:** `backend/api/auth.py` (endpoints), `backend/redis_client.py` (state + exchange code), `backend/services/auth.py` → `create_oauth_session()`, `backend/services/github_oauth.py`, `backend/services/google_oauth.py`

### Dev-only login (local agents)

`POST /api/auth/dev-login` returns a JWT for an existing active user by email, with no OAuth. It lets agents and QA reach authenticated pages on a throwaway local database (`.claude/skills/run-coupette/driver.sh`).

- **Two keys to mount it:** `DEV_LOGIN_ENABLED=true` AND `ENVIRONMENT=development`. `ENVIRONMENT` itself defaults to `development`, so the flag (default `false`) is what keeps the route off when `ENVIRONMENT` is unset.
- **Why a flag, not the environment alone:** local dev can run behind a tunnel (ngrok, via `FRONTEND_URL`), and Vite proxies `/api`. An environment-only gate would hand admin login to anyone who reaches the tunnel. Only the run driver sets the flag; `make dev` leaves it off. The driver binds Vite to `127.0.0.1` (the config's `host: true` would put it on the LAN) and blanks `RESEND_API_KEY`. What is left during a driver run: a tunnel left open on `:5173`, or a DNS-rebinding page (Vite's `allowedHosts: true`), could reach it. It gets a throwaway database with synthetic data and a token signed with a per-run key the real backend never accepts, but the backend still holds the root `.env`'s LLM keys, so chat calls would spend API credit.
- **Startup guard:** the backend refuses to boot when the flag is `true` in any environment other than development. The check runs first in the lifespan, before the secret checks.
- **No waitlist bypass:** it never creates a user; unknown email → 401, deactivated → 403. Hidden from OpenAPI, rate limited like the OAuth login routes, logs the user id only.

**Code:** `backend/api/auth.py` → `dev_login()`, `backend/services/auth.py` → `create_dev_session()`, `backend/app.py` → `include_dev_login()` + `lifespan()`

### Telegram HMAC (notification linking)

The Telegram Login Widget uses HMAC-SHA-256 verification per Telegram's spec. Used in Settings to link a Telegram account for notifications and bot access (not as a login provider). Payloads older than 24 hours are rejected to prevent replay attacks.

**Code:** `backend/services/auth.py` → `verify_telegram_data()`, `_verify_telegram_hash()`

### JWT (sessions)

- **Library:** PyJWT (python-jose is unmaintained with CVEs)
- **Algorithm:** HS256
- **Expiry:** 7 days
- **Claims:** `sub` (user ID), `role`, `display_name`, `exp`, `iat`
- **Signing key:** `JWT_SECRET_KEY` env var, required in production (startup guard)

**Why no refresh tokens:** This is a wine discovery app for a closed beta, not a financial product. Re-login is one OAuth click. The cost of implementing refresh token rotation exceeds the security benefit.

**Code:** `backend/services/auth.py` → `_create_jwt()`, `backend/auth.py` → `get_current_active_user()`

### Dual auth (web + bot)

Two authentication paths through a single `verify_auth()` dependency:

| Client         | Method           | Header                          |
|----------------|------------------|---------------------------------|
| Web app        | JWT bearer token | `Authorization: Bearer <token>` |
| Bot → backend  | Shared secret    | `X-Bot-Secret: <secret>`        |

When `BOT_SECRET` is set, the bot secret takes priority: a matching header skips JWT validation and `verify_auth` returns `None` (no user context); a wrong one returns 403. `BOT_SECRET` is required in production. When it is empty (local dev), `verify_auth` ignores the header and falls back to JWT, and `require_bot_secret` (guarding `GET /api/auth/telegram/check`) lets every call through.

**Code:** `backend/auth.py` → `verify_auth()`, `require_bot_secret()`

---

## Flows

### OAuth login (GitHub / Google)

1. User clicks "Sign in with GitHub/Google" on the login page
2. `GET /api/auth/{github,google}/login` — generates a state token (Redis, 10 min TTL), redirects to provider's authorize URL
3. User authenticates on the provider's site
4. Provider redirects to `GET /api/auth/{github,google}/callback` with `code` and `state`
5. Backend validates state (atomic Redis DELETE), exchanges code for access token, fetches user info
6. `create_oauth_session()` — upserts user (existing account → link provider, new user → check waitlist gate), mints JWT
7. JWT stored in Redis under a random exchange code (60s TTL)
8. Redirects to `FRONTEND_URL/auth/callback?code=...` (or `?error=not_approved` / `?error=invalid_state`)
9. Frontend calls `GET /api/auth/exchange?code=...` → receives JWT, stores in localStorage

### Telegram account linking

1. Authenticated user clicks "Connect" in Settings → Telegram Login Widget
2. `POST /api/users/me/telegram` — verify HMAC, check for conflicts, set `telegram_id` on user
3. Unlinking: `DELETE /api/users/me/telegram` — clears `telegram_id`

### Authenticated API request

```text
Request with Authorization: Bearer <jwt>
  → verify_auth()
    → no X-Bot-Secret → get_current_active_user()
      → decode JWT → find user by ID → check is_active
      → return User
  → handler runs
```

### Bot → backend service call

```text
Request with X-Bot-Secret: <secret>
  → verify_auth()
    → secret matches → return None (no user context, bot is trusted)
  → handler runs
```

### Bot user authorization

```text
Telegram user sends message
  → access_gate() [group -2]
    → cache hit (<1h, authorized=true) → pass
    → cache miss → GET /api/auth/telegram/check (X-Bot-Secret)
      → 204 → cache authorized=true
      → other 4xx (404 unknown, 403 deactivated) → reject message, ApplicationHandlerStop
      → 5xx/timeout → fail open (allow through, nothing cached)
  → rate_limit_gate() [group -1]
  → handler
```

### Admin bootstrap

Locally, `make create-admin` creates or promotes the admin user from the `ADMIN_EMAIL` env var (idempotent). On deploy, `deploy/deploy_backend.sh` upserts the same row with `psql`. The backend refuses to start without an active admin.

---

## Authorization

### Route guards

All `/api/*` routes require authentication except:

- `GET /api/auth/telegram/check` — user existence check (`require_bot_secret` guard)
- `GET /api/auth/github/login` — OAuth redirect (generates state, no user data)
- `GET /api/auth/github/callback` — OAuth callback (validates state + code)
- `GET /api/auth/google/login` — OAuth redirect
- `GET /api/auth/google/callback` — OAuth callback
- `GET /api/auth/exchange` — exchange code for JWT (single-use, 60s TTL)
- `POST /api/waitlist` — public waitlist submission
- `POST /api/auth/dev-login` — only when mounted (local development, see above)

Outside `/api`, the backend serves `GET /health`, the Prometheus `GET /metrics`, and FastAPI's default `/docs`, `/redoc`, and `/openapi.json` without auth. What the public proxy exposes is set in the infra repo.

JWT-authenticated requests decode the token, look up the user, and reject if `is_active` is false — deactivation is enforced on every request, not just at login.

Admin routes (`/api/admin/*`) require `role == "admin"` via `verify_admin()` dependency.

**Code:** `backend/auth.py` → `verify_auth()`, `get_current_active_user()`, `backend/app.py` (router `dependencies=` wiring)

### Waitlist gate (closed beta)

New OAuth users must have an approved waitlist entry (matched by email). Visitors submit their email via the landing page form, admins approve via the admin panel. Approved users receive a confirmation email via Resend.

**Code:** `backend/services/auth.py` → `create_oauth_session()`, `backend/repositories/waitlist.py`

### Bot access gate

The Telegram bot checks user registration before handling any message:

1. `access_gate()` middleware runs at handler group -2 (before all handlers)
2. Calls `GET /api/auth/telegram/check?telegram_id=...` on the backend: check user exists and is active, by telegram id
3. Caches a positive result in `context.user_data` for 1 hour (avoids hammering backend)
4. Unauthorized users get a rejection message + `ApplicationHandlerStop`

**Fail-open on backend unavailability:** If the backend is unreachable (timeout, 5xx), the bot allows the user through and caches nothing — any Telegram user passes the gate while the check fails. Rationale: the bot is the primary interface during closed beta — denying access when the auth service is down helps nobody, and every command still goes through the backend.

**Code:** `bot/bot/middleware.py` → `access_gate()`

### User lifecycle

- `is_active` boolean on the `users` table replaces the old `ALLOWED_USER_IDS` env var
- Deactivation applies at once on the web (checked on every JWT request) and at `/check`; the bot's cached access check can lag up to 1 hour
- Admin bootstrap via `ADMIN_EMAIL` env var (verified at startup); admin accounts cannot be deactivated

---

## Rate Limiting

**Backend (SlowAPI):** Tiered limits via `slowapi`, keyed by client IP: 100/min global, 10/min on the login routes and dev-login, 3/min on the waitlist. The LLM routes (chat send-message, recommendations) allow 20/min, keyed by the JWT user (IP when there is no token). Counters live in Redis, with an in-memory fallback. ADR: [0009-rate-limiting-tiered-strategy](adrs/0009-rate-limiting-tiered-strategy.md).

**Bot:** Per-user limit of 3 updates per second. Silently drops updates from users exceeding the threshold.

**Code:** `backend/rate_limit.py`, `bot/bot/middleware.py` → `RateLimiter`, `rate_limit_gate()`

---

## CI/CD Security

| Tool       | What it catches                               | Where          |
|------------|-----------------------------------------------|----------------|
| Dependabot | Outdated dependencies (pip, npm, Docker, GitHub Actions) | Weekly PRs; patch/minor auto-merge once CI passes |
| pip-audit  | Known vulnerabilities in Python packages      | CI per service |
| yarn audit | Known vulnerabilities in frontend packages (with an ignore filter) | CI |
| gitleaks   | Secrets committed in code                     | CI             |
| Hadolint   | Dockerfile anti-patterns                      | CI             |
| Trivy      | Container image vulnerabilities               | CI on PR, CD before the image push, weekly scan (`.github/workflows/cve-scan.yml`) |
| `on-main`  | A tag or dispatch for a commit not on main    | CD, first job  |

---

## Application Hardening

- **CORS:** Env-driven `CORS_ORIGINS`, defaults to `http://localhost:5173` in dev
- **Input validation:** Pydantic request schemas with `max_length` constraints on most string fields
- **Production startup guards:** when `ENVIRONMENT=production`, the backend refuses to start without `BOT_SECRET`, `JWT_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FRONTEND_URL`, `BACKEND_URL`. In every environment it refuses to start without an active admin, and outside development with `DEV_LOGIN_ENABLED=true`
- **DB password encoding:** URL-encoded in connection string to handle special characters
- **Non-root Docker containers:** All Dockerfiles create and switch to a non-root user
- **No debug ports in production:** `docker-compose.prod.yml` publishes no host ports

---

## Threat Model

| Threat                  | Mitigation                                                     | Residual risk                                                   |
|-------------------------|----------------------------------------------------------------|-----------------------------------------------------------------|
| OAuth callback forgery  | Random single-use state token in Redis (10 min TTL)            | The PKCE + signed state of [ADR 0008](adrs/0008-oauth2-security-design.md) is not implemented |
| OAuth code interception | Exchange codes are single-use (GETDEL), 60s TTL                | 60s window if code is intercepted (HTTPS mitigates)             |
| HMAC forgery (Telegram) | `hmac.compare_digest` (timing-safe), SHA256 key derivation     | None — standard Telegram spec                                   |
| Auth replay (Telegram)  | 24h `auth_date` freshness check                                | Replay within 24h window (acceptable)                           |
| JWT theft               | 7-day expiry, `is_active` check on every request               | No revocation before expiry                                     |
| Bot impersonation       | `X-Bot-Secret` required in production                          | Compromised secret = full bot access                            |
| Deactivated user access | `is_active` checked on every JWT request and at `/check`       | Cached auth in bot (up to 1h stale)                             |
| Backend down            | Bot fails open; every command still needs the backend          | Unregistered users pass the gate while the check fails          |
| XSS -> token theft      | React JSX auto-escaping, no `dangerouslySetInnerHTML`          | localStorage accessible to XSS; no CSP is set in this repo (any CSP header comes from the proxy, infra repo) |
| LLM API key leak        | Env vars only, never in frontend or logs, sops-encrypted prod  | Billing exposure if VPS compromised                             |
| OAuth endpoint abuse    | Waitlist gate, state validation, SlowAPI rate limits            | Rate-limited but public endpoints                               |
| Dev-only login reachable | Two-key mount (flag + development), boot refusal elsewhere, never creates a user, rate limited | A driver run reached through a tunnel or DNS rebinding can log in on a throwaway DB and spend LLM credit |

---

## Known Limitations

- **No JWT revocation** — can't invalidate a token before its 7-day expiry. Mitigated by `is_active` flag checked on every API call.
- **No admin promotion** — the bootstrap creates one admin from `ADMIN_EMAIL`; there is no endpoint to promote another user.
- **Docker secrets not adopted** — credentials live in `.env` on disk.
- **Bot auth cache** — up to 1 hour stale. A deactivated user can keep using the bot for up to 1 hour after deactivation.
- **JWT in localStorage** — accessible to XSS. HttpOnly cookie migration is in the [ENGINEERING.md](ENGINEERING.md) backlog.

---

## Security Log

### 2026-02-15 — API hardening baseline (#72, #80)

**Context:** First public-facing API endpoints going live — needed baseline security before any users touch it.
**Action:** CORS lockdown (env-driven origins), Pydantic input validation with `max_length` on all string fields, Hadolint in CI for Dockerfile hygiene.

### 2026-02-21 — CI security scanning (#194, #217)

**Context:** Dependencies growing — manual dep auditing doesn't scale, needed automated gates before merge.
**Action:** pip-audit + gitleaks in CI. Later hardened with timeouts and concurrency controls.

### 2026-03-08 — Supply chain + secrets hardening (#313)

**Context:** Preparing for auth system — unpinned installers are supply chain risk, special chars in DB password broke connections silently, production had no startup guards for required secrets.
**Action:** Pinned Poetry installer hash, URL-encoded DB password in connection string, `BOT_SECRET` startup guard in production.

### 2026-03-09 — Auth system (#353–#358)

**Context:** Needed closed beta access control before shipping the web app. Re-login is one tap (Telegram Widget), so refresh token rotation complexity unjustified for wine app closed beta.
**Decision:** Telegram OAuth + JWT + invite codes. HS256 over RS256 (single service, no token sharing). 7-day expiry, no refresh tokens.

### 2026-03-09 — Container image scanning (#360)

**Context:** Auth system shipping — containers now handle user credentials. pip-audit catches Python deps but misses OS-level CVEs.
**Action:** Trivy scan on built Docker images in CI (PR checks + tag push).

### 2026-03-19 — Deploy secrets encryption (#482)

**Context:** Automated CD pipeline needed secrets on the runner without storing them in plaintext — GitHub Actions secrets are fine for CI, but the deploy script needs the full `.env`.
**Action:** sops + age encryption for production secrets. Decrypted at deploy time only. Simpler than Vault for a single-VPS setup.

### 2026-04-05 — GitHub + Google OAuth (#595, #591)

**Context:** Replacing invite codes with OAuth for user registration. Waitlist gate controls access instead.
**Decision:** OAuth 2.0 with CSRF state tokens (Redis), single-use exchange codes. GitHub + Google as providers. OIDC `id_token` decoding deferred — `/userinfo` approach is simpler and consistent across providers.

### 2026-04-05 — Email-based admin + Telegram as notification channel

**Context:** Admin bootstrap relied on `ADMIN_TELEGRAM_ID`, coupling admin identity to Telegram. Telegram login on the web app was redundant with Google/GitHub OAuth.
**Action:** Admin identified by `ADMIN_EMAIL`. Telegram removed from login page, moved to Settings as a linked notification channel (`POST /users/me/telegram`). Telegram Login Widget HMAC verification reused for linking.

### 2026-10-19 — Deploy only commits on main (VPA-53)

**Context:** An `exp/agentic` branch will run autonomous agents and never merge. CD deployed any `v*` tag and the `production` environment accepts any `v*` tag, so one tag on that branch would deploy it and run its migrations on prod.
**Action:** A first CD job (`on-main`) fails unless the tagged or dispatched commit is an ancestor of `origin/main`. The global `git-guard` hook also blocks `gh api` writes to git refs, tags, and releases. Limit: a tag runs the `cd.yml` of its own commit, so a branch commit that edits `cd.yml` drops the check.
