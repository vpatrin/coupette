# Review Invariants

> The reviewer agent walks through this list on every pipeline run. Each invariant is something Coupette *actually does* today — not aspirational. If an invariant requires infrastructure that doesn't exist, it doesn't belong here (add the infra first, then the invariant).
>
> Two sections: **mechanical** (greppable / structural — fast to check) and **semantic** (reviewer reads code paths and judges).

## Mechanical invariants

Run these against the diff (`git diff main...HEAD`). If a trigger condition is met, the check must pass.

### Backend

| # | Trigger | Invariant | How to check |
|---|---|---|---|
| 1 | New/edited file in `backend/api/` | No direct DB queries in routes — must call a service | `grep -rE "(session\.execute|session\.query|select\()" backend/api/` should match 0 lines in the diff |
| 2 | Any `backend/` Python diff | No sync SQLAlchemy `Session` — must use `AsyncSession` | `grep -E "from sqlalchemy.orm import Session" backend/` in diff should match 0 lines |
| 3 | New route on a protected resource | Uses `Depends(verify_auth)` or `Depends(verify_admin)` — no parallel auth checks | grep the route decorator in the diff |
| 4 | New Pydantic schema in `backend/schemas/` | Class suffix is `*In` or `*Out` (not `*Request`, `*Create`, `*Response`) | grep class names |
| 5 | New env var or secret in `core/config/settings.py` or `backend/config.py` | Added to production lifespan validation check in `backend/main.py` | diff includes both files |

### Frontend

| # | Trigger | Invariant | How to check |
|---|---|---|---|
| 6 | New user-facing string in `.tsx` | Wrapped in `t('...')`, not hardcoded | grep new string literals in JSX |
| 7 | New `t('key')` call | Key exists in BOTH `frontend/src/locales/fr.json` AND `en.json` | diff includes both locale files OR `jq` lookup |
| 8 | New `.tsx` / `.ts` file | No `as any` casts | grep `as any` in diff |
| 9 | New component | Co-located test file (`Component.tsx` + `Component.test.tsx`) | diff lists both |

### Scraper

| # | Trigger | Invariant | How to check |
|---|---|---|---|
| 10 | New URL fetched in `scraper/` | URL pattern matches a sitemap entry from [`domains/scraper.md`](../domains/scraper.md) allowlist | grep `requests.get` / fetch calls; confirm host matches |
| 11 | New HTTP client in `scraper/` | Reuses existing rate-limited client, doesn't instantiate a fresh `requests.Session` | grep `requests.Session()` / `httpx.Client()` in diff |

### Logging

| # | Trigger | Invariant | How to check |
|---|---|---|---|
| L1 | New log call in `backend/` | Uses `from loguru import logger` (universal pattern) | grep `import logging` / `getLogger` in diff — must be 0 |
| L2 | New log call | Uses structured placeholders, not f-strings — e.g. `logger.info("event: id={} user={}", id, user)` | grep f-string log calls in diff |
| L3 | Auth, OAuth, or token-handling code | Token values, OAuth `access_token`, JWT, and bot secret never appear as a log argument or in a formatted string | grep log calls in auth diff |

### Testing

| # | Trigger | Invariant | How to check |
|---|---|---|---|
| 12 | New test file or test function | Test names are full behavioral sentences, not vague stubs | grep for `def test_happy_path`, `test_valid_input`, `test_clean_run` — must be 0 hits |
| 13 | New test mocks DB or auth | Auth/DB tests use real DB session per `patterns/testing-patterns.md` | grep for `Mock`/`patch` on `AsyncSession`, `get_db`, `verify_auth` |

### Git / Commit hygiene (Hard Rules)

| # | Trigger | Invariant | How to check |
|---|---|---|---|
| 14 | Any commit message in this branch | No `Co-Authored-By`, no `Generated with Claude Code`, no AI attribution | `git log main..HEAD --format=%B \| grep -iE "claude\|anthropic\|co-authored-by\|generated with"` returns 0 |

## Semantic invariants

These require reading code paths, not greps. Reviewer applies judgment.

### Hard Rules (CLAUDE.md)

| # | Invariant | Where the rule lives |
|---|---|---|
| 15 | No SAQ impersonation in user-facing copy (LLM prompts, bot messages, UI strings, error messages) | CLAUDE.md → Hard Rules → Legal |
| 16 | No deploy / prod docker / migration commands run by the implementer | CLAUDE.md → Hard Rules → Deploy |

### Auth

| # | Invariant | Where the rule lives |
|---|---|---|
| 17 | JWTs, OAuth tokens, bot secret never appear in `logger.*` or `print()` calls — including formatted strings | [`domains/auth.md`](../domains/auth.md) |
| 18 | New protected routes reuse existing `Depends(verify_auth)` / `Depends(verify_admin)`, never write a parallel check | [`domains/auth.md`](../domains/auth.md) |
| 19 | OAuth callback handlers validate origin / state parameter | [`domains/auth.md`](../domains/auth.md) |

### RAG

| # | Invariant | Where the rule lives |
|---|---|---|
| 20 | Prompt changes (intent, sommelier, recommendations) → reviewer flags **eval required before merge** | [`domains/rag.md`](../domains/rag.md), [`domains/llm.md`](../domains/llm.md) |
| 21 | Embedding model or dimension change → reviewer flags **catalog-wide re-embedding cost** for Victor to approve | [`domains/rag.md`](../domains/rag.md) |
| 22 | New LLM system prompt — uses cache control on the static portion | [`domains/llm.md`](../domains/llm.md) |

### Architecture

| # | Invariant | Where the rule lives |
|---|---|---|
| 23 | Services raise domain exceptions, not `HTTPException` — translation happens in `backend/errors.py` | [`domains/backend.md`](../domains/backend.md) |
| 24 | New constants/timeouts/thresholds surfaced to Victor for validation, not silently picked | CLAUDE.md → Code Style |

## Audited gaps — invariants we'd want but can't enforce yet

These are real best practices that aren't in the list above because Coupette lacks the supporting infrastructure. Adding them to this list would produce hollow checks. Build the infra first.

- **Audit trail on admin actions.** No audit-log service or `audit_logs` table exists today (verified — `backend/api/admin.py:38` `delete_user` has no logging beyond exception path). Until built, the reviewer cannot enforce "every admin mutation must call `audit_log(...)`."
- **OAuth event logging.** Login success is structured-logged (`backend/services/auth.py:92`), but OAuth callbacks (`backend/api/auth.py:48-78, 99-130`) are silent — state validation, code exchange, user upsert. Adding consistent OAuth callback logging would let the reviewer enforce "OAuth flows log provider + result."
- **Sensitive-data redaction filter.** No loguru filter that strips JWT/OAuth tokens before emission. Token-never-logged (#L3) is enforced by code review, not by infrastructure. A pre-emission filter would make this mechanical.
- **Login failure rate limiting per user/IP.** Rate limit exists at the endpoint level (SlowAPI) but no per-account failure tracking — brute-force on a single account isn't separately detected.
- **Tracing / distributed APM.** Prometheus metrics exist (`backend/metrics.py`); no OpenTelemetry/Sentry tracing. Cross-service request correlation is not enforceable.

If you want any of these, the work is two-step: ship the infrastructure, then add the invariant.
