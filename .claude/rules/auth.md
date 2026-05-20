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

# Auth (auto-loaded) — SECURITY-SENSITIVE

Full context: [`domains/auth.md`](../domains/auth.md), `docs/SECURITY.md`.

## Hard rules

1. **Never log JWTs, OAuth tokens, the bot secret, or session tokens.** Audit every `logger.*` and `print()` near token-holding variables. No raw values in formatted strings either.
2. **Reuse existing auth dependencies.** New protected routes: `Depends(verify_auth)` or `Depends(verify_admin)`. Never write a parallel auth check.
3. **Real DB sessions in auth tests.** No mocking `AsyncSession`, `get_db`, or the user repository. Use the test DB fixture.
4. **New secret?** Add to the production lifespan validation in `backend/main.py` so missing config fails fast at boot.
5. **OAuth callbacks:** validate origin / state parameter. Never trust the callback blindly.
6. **Admin route?** Check the router-level mount in `backend/app.py` — `dependencies=[Depends(verify_admin)]` at `include_router` protects every route under the prefix.

## Required test scenarios for auth changes

Every change must add tests for: happy path, token expiry, invalid/tampered token, unauthenticated request, authorized user (positive), waitlist gate (if relevant).

## Recommended after any non-trivial auth diff

Run `/security` for a second-pass appsec review.
