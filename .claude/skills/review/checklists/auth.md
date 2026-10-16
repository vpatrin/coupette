# Auth checklist

Applies when the diff touches the paths in `rules/auth.md` or adds or changes a route in `backend/api/`. Risky lane for the auth paths.

- **AUTH-1** No JWT, OAuth token, bot secret, or session token reaches a log call or formatted string.
- **AUTH-2** Protected routes use `Depends(verify_auth)` / `Depends(verify_admin)`, never a parallel check. Before calling a route unprotected, check the decorator's `dependencies=[...]` and the `app.include_router(..., dependencies=[...])` mount site in `backend/app.py`.
- **AUTH-3** OAuth callbacks validate state and origin.
- **AUTH-4** Auth-logic tests run the real `verify_auth` path (override removed) — `rules/testing.md` → Auth tests.
- **AUTH-5** Required scenarios covered: happy path · token expiry · invalid/tampered token · unauthenticated request · authorized user · waitlist gate (if relevant).
- **AUTH-6** `/security` ran on the branch and no Critical or High finding is open.
- **AUTH-7** A threat-model change is reflected in `docs/SECURITY.md`.
