# Frontend

> React 19 + Vite + Tailwind 4 + shadcn/ui SPA at coupette.club — the human-facing surface for chat, watches, saved stores, tastings.

## Contract

What the frontend exposes:

- **Pages** at `frontend/src/pages/` — Landing, Login, AuthCallback, Onboarding, Chat (default after login), Chats (history), Search, Stores, SavedStores, Watches, Tastings, Settings, Admin
- **Backend dependency**: every page calls `coupette.club/api/*` (proxied through Caddy in prod, `localhost:8001` in dev)
- **No public JS API** — SPA only, no embedded widgets

## How it works

The SPA boots from `frontend/src/main.tsx`, mounts `App.tsx`, which sets up:
1. **React Router** for client-side routing across pages
2. **AuthContext** (`contexts/AuthContext.tsx`) — JWT token state, login/logout, OAuth callback handling
3. **WineDetailContext** (`contexts/WineDetailContext.tsx`) — selected wine across sidebar/cards
4. **i18next** (`i18n.ts`) — bilingual fr/en, French default, detects browser language

A typical user flow:
1. Land on Login (or arrive via OAuth callback)
2. Backend issues JWT → stored in AuthContext
3. Default route lands on Chat — the sommelier conversation surface
4. User asks a wine question → frontend calls `/api/chat` → token-streamed reply with interactive wine references
5. Side surfaces (Watches, SavedStores, Tastings) load from their respective `/api/*` endpoints

## Files

| Concern | Where |
|---|---|
| Entry point | `frontend/src/main.tsx` |
| Routing + layout | `frontend/src/App.tsx`, `components/AppShell.tsx` |
| Auth state | `frontend/src/contexts/AuthContext.tsx` |
| Wine detail panel | `frontend/src/contexts/WineDetailContext.tsx` |
| Protected routes | `frontend/src/components/ProtectedRoute.tsx` |
| Pages | `frontend/src/pages/*.tsx` |
| Shared components | `frontend/src/components/*.tsx` (incl. `ui/` for shadcn primitives) |
| HTTP wrapper | `frontend/src/lib/api.ts` (or similar — `fetch`-based, no axios) |
| Locales | `frontend/src/locales/{fr,en}.json` |
| i18n setup | `frontend/src/i18n.ts` |
| Tests | co-located: `Component.tsx` + `Component.test.tsx` (Vitest + RTL) |

## Dependencies

- **Backend `/api/*`** — all data flows through. Frontend doesn't talk to PostgreSQL or LLM directly.
- **Caddy** (prod) — routes `coupette.club/*` to the SPA, `coupette.club/api/*` to the backend
- **react-i18next** — translation runtime
- **shadcn/ui** primitives (`components/ui/`) — copy-pasted, not a runtime dependency
- **Tailwind CSS 4** — utility classes, theme tokens in `index.css`

## Cross-cutting concerns

- **Auth:** JWT in `AuthContext`, attached to every fetch via the HTTP wrapper. `ProtectedRoute` gates authenticated pages.
- **Logging:** browser console for dev; no centralized client logging in prod yet (no Sentry / equivalent).
- **Errors:** inline next to the failed action (per UX bible — no toasts). Retry actions surfaced inline.
- **Observability:** Umami pageview analytics (loaded via separate VPS service); no frontend-specific telemetry.
- **Rate limiting:** none at the SPA layer; backend's SlowAPI handles it.
- **i18n:** every user-facing string via `t('key')`. Keys MUST land in BOTH `locales/fr.json` AND `locales/en.json` before PR.

## Operational notes

- **Dev:** `yarn dev` (bare-metal on Mac, not Docker — hot reload matters). Backend must be running on `localhost:8001`.
- **Prod build:** Dockerized via `frontend/Dockerfile`; output served as static assets by Caddy at `coupette.club/`
- **Node version:** v24.10.0 (pinned in dev; CI uses Node 24)
- **No env vars at runtime** — the build embeds `VITE_*` env vars at build time. New env var = rebuild required.
- **Visual review gap:** Claude cannot natively take screenshots; either Victor pastes a screenshot OR Chrome DevTools MCP drives the browser (see `.mcp.json`).

## Related

- **ADRs:** [`adrs/0006-react-shadcn-frontend.md`](../adrs/0006-react-shadcn-frontend.md)
- **Agent rules (imperative form):** [`.claude/rules/frontend.md`](../../.claude/rules/frontend.md) — UX bible, didactic workflow, component conventions, i18n rules
- **Recent session logs:** look up via [`../session-logs/INDEX.md`](../session-logs/INDEX.md)
