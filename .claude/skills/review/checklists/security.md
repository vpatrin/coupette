# Security checklist

Applies when the diff touches an API route, user-scoped data, secrets or config, dependencies, or client-side storage — and in depth with `/review security`. Threat model: `docs/SECURITY.md`; a risk it already accepts is noted, not flagged. Auth mechanics are in `auth.md`; scraping legality in `scraper.md`.

Read changed files in full — security bugs hide in context, not in diffs. Report each finding with an exploit scenario. Severity: Critical (exploitable now: breach, auth bypass) and High (exploitable with moderate effort) are BLOCK; Medium and Low are WARN.

- **SEC-1** IDOR: every user-scoped read or write filters by the authenticated user's id, not just the resource id.
- **SEC-2** Every route without auth is explicitly justified; a bot-secret path handles `user=None`.
- **SEC-3** No raw SQL or string-built queries; no `subprocess` / `shell=True` / `os.system`; no file path from user input.
- **SEC-4** `*Out` schemas expose no secret, hash, token, or internal-only field; error responses leak no stack trace, SQL, or file path.
- **SEC-5** Input bounds: string fields have `max_length`, numbers are bounded, `limit`/`offset` are capped.
- **SEC-6** No secret in code or in `frontend/src/` (it ships to the browser); a new secret is required by the production lifespan check.
- **SEC-7** No user-controlled `dangerouslySetInnerHTML`, `eval`, or `new Function`; `target="_blank"` links carry `rel="noopener noreferrer"`; no token or user id in a URL.
- **SEC-8** No sensitive data in `localStorage`/`sessionStorage` without a stated reason.
- **SEC-9** CORS origins match the expected domains — no wildcard in production.
- **SEC-10** New dependencies are maintained, pinned, and free of known CVEs (`make audit-<service>`).
- **SEC-11** A threat-model change is reflected in `docs/SECURITY.md`.
