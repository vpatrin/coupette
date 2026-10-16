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

> Read whenever touching `backend/auth.py`, OAuth services, the waitlist, or any route with `Depends(verify_auth)`. Auth work is always the **risky lane** in `/feature`.

How it works — JWT, OAuth flows, bot secret, waitlist gate, file map: [`docs/specs/auth.md`](../../docs/specs/auth.md). Threat model: `docs/SECURITY.md`. ADRs: `docs/adrs/0004-*` (Telegram-first auth), `docs/adrs/0008-*` (OAuth2).

## Hard rules

1. **Never log JWTs, OAuth tokens, the bot secret, or session tokens.** Audit every `logger.*` / `print()` near token-holding variables. No raw values in formatted strings either.
2. **Reuse existing auth dependencies.** New protected routes: `Depends(verify_auth)` or `Depends(verify_admin)`. Never write a parallel auth check.
3. **Auth logic is tested through the real code path.** Remove the `verify_auth` override and mock the DB only at the session boundary — see `rules/testing.md` → Auth tests.
4. **New secret?** Add to the production lifespan validation in `backend/app.py` so missing config fails fast at boot.
5. **OAuth callbacks:** validate origin / state parameter. Never trust the callback blindly.
6. **CORS changes are deliberate.** Any change to CORS settings is recorded in the PR's Decisions with its reason.
7. **Admin route check:** verify both per-route `Depends(...)` AND the `app.include_router(..., dependencies=[Depends(verify_admin)])` mount site. Protection may be applied at the router level (the admin router mount in `backend/app.py`) — a route without a per-route dep is NOT necessarily unprotected.
8. **Unsure about a flow?** (OAuth state validation, a JWT edge case, a waitlist transition) Stop and ask Victor. Don't guess — auth mistakes ship to production.

## Required test scenarios for auth changes

happy path · token expiry · invalid/tampered token · unauthenticated request · authorized user (positive) · waitlist gate (if relevant)

## Before the PR

Run `/review security` on the branch. A Critical or High finding blocks the PR. If the change alters the threat model, update `docs/SECURITY.md` in the same PR.
