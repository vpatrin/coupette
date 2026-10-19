---
name: run-coupette
description: Start, run, and drive the Coupette web app locally (FastAPI backend + React frontend) on a throwaway seeded database, call its API as a logged-in user, click through the UI, and take screenshots. Use when asked to run or start the app, launch the local stack, verify a change in the real app, screenshot a page, or check an endpoint end to end.
---

Drive the app with `.claude/skills/run-coupette/driver.sh`. `up` starts the backend (:8001) and frontend (:5173) against a **throwaway** Postgres (:5434) and Redis (:6380) seeded with the synthetic catalog. `up` logs in once through the dev-only `POST /api/auth/dev-login`; `api` calls endpoints as the seeded admin with that token. `browse` clicks through the UI in headless Chrome and saves screenshots. Paths are relative to the repo root.

Agents use this, never `make dev`: `make dev` migrates the database every workspace shares (`rules/migrations.md`). The driver never touches `coupette-postgres` / `coupette-redis`.

## Prerequisites

Set up by the Superset workspace (`.superset/setup.sh`) or `make install`: Poetry venvs for core/backend/scraper, `frontend/node_modules`. Also Docker running, Node (verified with 24), and Google Chrome installed (the browser driver uses it; no browser download). Verified on macOS only.

## Run (agent path)

```bash
.claude/skills/run-coupette/driver.sh up        # ~9 s: containers, migrate, seed, servers, dev login; prints "✅ ready"
.claude/skills/run-coupette/driver.sh status    # ports + backend /health
```

Call the API as the seeded admin (`dev-admin@coupette.test`), through the frontend proxy:

```bash
.claude/skills/run-coupette/driver.sh api '/api/products?limit=2'   # {"products":[…],"total":51,…}
.claude/skills/run-coupette/driver.sh api /api/cellar
.claude/skills/run-coupette/driver.sh token                         # raw JWT, for your own curl
```

Drive the UI. Steps run in order; the browser is already logged in and past onboarding:

```bash
.claude/skills/run-coupette/driver.sh browse /search \
  --fill "Search wines by name...=riesling" --wait "4 results" --shot search-riesling \
  --click "Add to my cellar" --wait "In your cellar" \
  --goto /cellar --wait "Riesling" --shot cellar
```

| step | what it does |
|---|---|
| `--fill <placeholder or label>=<text>` | types into the first matching field |
| `--click <text>` | clicks the first button whose accessible name is exactly `<text>` |
| `--wait <text>` | waits up to 15 s for visible text |
| `--goto <path>` | navigates, waits for network idle |
| `--shot <name>` | saves `/tmp/coupette-run/shots/<name>.png` |

Screenshots land in `/tmp/coupette-run/shots/` (a failed step saves `failure.png`). After the steps it prints any page errors, console errors, and `/api/*` responses ≥ 400; a page can render its shell while every fetch fails, so read them. Open the PNG with the Read tool before claiming the UI works.

```bash
.claude/skills/run-coupette/driver.sh logs      # tail of backend + frontend logs (/tmp/coupette-run/*.log)
.claude/skills/run-coupette/driver.sh down      # stop servers, remove both throwaway containers
```

Each `up` starts from an empty DB, so runs are deterministic: 58 products (51 listed: the app shows wine only), 4 stores, one admin.

## Run (human path)

`make dev` in a terminal: shared DB, real `.env` admin, OAuth login on http://localhost:5173. See `docs/DEVELOPMENT.md`.

## Test

```bash
make test-backend   # pytest, DB mocked; most backend PRs need only this plus `driver.sh api`
make test-frontend  # vitest
```

## Gotchas

- **Fixed ports.** 8001 and 5173 are hardcoded (Makefile, vite proxy, OAuth redirect URIs), so one workspace at a time runs the app. `up` refuses when a port is busy; stop the other run first.
- **Overrides go on the make command line.** The Makefile does `-include .env` (then `.env.local`) + `export`, which beats plain environment variables. The driver passes `DB_*`, `REDIS_URL`, `ADMIN_EMAIL`, `JWT_SECRET_KEY`, `DEV_LOGIN_ENABLED`, `FRONTEND_URL`, `RESEND_API_KEY` (blank) as `make VAR=value`; copy that if you run a target by hand against the throwaway DB.
- **Postgres readiness must be checked over TCP.** The pgvector image's init server answers `pg_isready` on its Unix socket, then restarts; migrating at that moment fails. The driver uses `pg_isready -h 127.0.0.1`.
- **Wine cards are buttons.** Each `WineCard` has `role=button` and its accessible name includes "Add to my cellar" and "Watch"; a substring match clicks the card and opens the detail panel instead. `--click` matches the exact name for this reason.
- **Dev login is opt-in.** The driver passes `DEV_LOGIN_ENABLED=true` (plus `FRONTEND_URL=http://localhost:5173`, so nothing lands on the root `.env`'s tunnel). `up` posts `{"email": "dev-admin@coupette.test"}` to `/api/auth/dev-login` once and caches the JWT in `/tmp/coupette-run/token`; the route is rate limited (10/min), so reuse `driver.sh token` instead of calling it again. The browser gets the token through `localStorage` (`auth_token`, plus `onboarded` to skip `/onboarding`). With the flag off the route answers 404 (checked against the throwaway DB), and it never appears in `/openapi.json`, flag or not. The backend refuses to boot with the flag outside development.
- **Vite listens on 127.0.0.1 only in driver runs.** `vite.config.ts` sets `host: true` (all interfaces) for the tunnel workflow; the driver runs `yarn dev --host 127.0.0.1` instead so the dev login stays off the LAN. The log shows `Local: http://127.0.0.1:5173/`; `localhost:5173` still works for curl and Chrome.
- **Chat and recommendations return nothing on seed data.** The seed has no embeddings, and retrieval filters on `embedding IS NOT NULL`. `make embed-sync` fixes it but needs `OPENAI_API_KEY` and costs money; it also needs the `DB_*` overrides to hit the throwaway DB.
- **`DEV-` SKUs give dead outbound links.** `NoteViewModal` builds a saq.com URL from the SKU.

## Troubleshooting

- **`port 8001 is busy`**: another workspace (or a crashed run) holds it. `driver.sh down` here frees this run's ports; otherwise stop the app in that workspace.
- **`make test-backend` fails `test_submit_waitlist_silences_duplicate_email` with `assert 429 == 201`** on a rerun within a minute: the Makefile exports the root `.env`'s `REDIS_URL`, so slowapi counts in the live `coupette-redis` and the conftest reset only clears the in-memory fallback (3/min on `/api/waitlist`). Wait a minute, or run `cd backend && REDIS_URL=redis://127.0.0.1:1/0 poetry run pytest -q` (unreachable Redis → in-memory limiter; passes back to back).
- **`step failed: locator.waitFor: Timeout 15000ms exceeded`**: the text never appeared; open `/tmp/coupette-run/shots/failure.png`. Seen when a `--click` hit the wrong element (the substring trap above).
