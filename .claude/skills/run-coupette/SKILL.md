---
name: run-coupette
description: Start, run, and drive the Coupette web app locally (FastAPI backend + React frontend) on this worktree's throwaway seeded database, call its API as a logged-in user, click through the UI, and take screenshots. Use when asked to run or start the app, launch the local stack, verify a change in the real app, screenshot a page, or check an endpoint end to end.
---

Drive the app with `.claude/skills/run-coupette/driver.sh` (interface: `ops/CONTRACTS.md` §3). `up` uses this worktree's **throwaway** Postgres and Redis from `.env.local`, which `/Users/victor/.agent-harness/bin/exp-docker db up` wrote as its own command just before. It migrates, seeds and embeds the synthetic catalog, starts the backend and frontend, and logs in once through the dev-only `POST /api/auth/dev-login`. `api` calls endpoints as the seeded admin with that token. `browse` clicks through the UI in headless Chrome and saves screenshots. Paths are relative to the repo root.

Agents use this, never `make dev`: `make dev` starts the shared containers and migrates the shared database. The driver makes no `docker` call and never touches `coupette-postgres` / `coupette-redis`.

## Ports

Each worktree gets a slot from exp-docker. With `n = (DB_PORT - 5434) / 10`:

| service | port |
|---|---|
| Postgres | `5434 + 10n` |
| Redis | `6380 + 10n` |
| backend | `8101 + 10n` |
| frontend | `5273 + 10n` |

Worktrees run side by side and never take main's 8001 / 5173. `up` prints the URLs; `status` prints the slot and ports.

## Prerequisites

The worktree setup in `ops/CONTRACTS.md` §2: `.env` linked, `.env.local` from `exp-docker db up`, Poetry venvs for core/backend/scraper, `frontend/node_modules`. Also Node (verified with 24) and Google Chrome (the browser driver uses it; no browser download). Verified on macOS only.

## Run

```bash
.claude/skills/run-coupette/driver.sh up        # DB, migrate, seed, servers, dev login; prints "✅ ready" and the URLs
.claude/skills/run-coupette/driver.sh status    # slot, ports, backend /health
```

Call the API as the seeded admin (`dev-admin@coupette.test`). The driver prints the status line, then the body. It exits 0 on any HTTP status; read the status.

```bash
.claude/skills/run-coupette/driver.sh api GET '/api/products?limit=2'   # HTTP 200, then {"products":[…],"total":51,…}
.claude/skills/run-coupette/driver.sh api POST /api/watches '{"sku": "<a sku from GET /api/products>"}'
.claude/skills/run-coupette/driver.sh token                             # raw JWT, for your own curl
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
| `--shot <name>` | saves `$RUN_DIR/shots/<name>.png` and prints its path |

`$RUN_DIR` is `~/.cache/coupette-run/runs/<id>`, one per worktree (`<id>` matches exp-docker's container names; `status` prints it). A failed step saves `failure.png`. After the steps it prints any page errors, console errors, and `/api/*` responses ≥ 400; a page can render its shell while every fetch fails, so read them. Open the PNG with the Read tool before claiming the UI works.

```bash
.claude/skills/run-coupette/driver.sh logs      # tail of backend + frontend logs ($RUN_DIR/*.log)
.claude/skills/run-coupette/driver.sh down      # stop servers, exp-docker db down
```

When exp-docker can recreate the containers, each `up` starts from an empty DB, so runs are deterministic: 58 products (51 listed: the app shows wine only), 4 stores, one admin.

## Test

```bash
make test-backend   # pytest, DB mocked; most backend PRs need only this plus `driver.sh api`
make test-frontend  # vitest
```

## Gotchas

- **exp-docker only as its own command.** A sandboxed command can't reach Docker, and the driver's children inherit the sandbox. Only a Bash command that is exactly `/Users/victor/.agent-harness/bin/exp-docker db up|down|reset` runs outside it. So run `db up` before `driver.sh up` and `db down` after `driver.sh down`. For a fresh DB, run `db reset` the same way.
- **`up` rewrites `.env.local`.** exp-docker can pick another slot on each `up`. The driver copies its output into `.env.local`, so `make` targets reach the same DB as the running app.
- **Overrides go on the make command line.** The Makefile does `-include .env` (then `.env.local`) + `export`, which beats plain environment variables. The driver passes `DB_*`, `REDIS_URL`, `BACKEND_PORT`, `ADMIN_EMAIL`, `JWT_SECRET_KEY`, `DEV_LOGIN_ENABLED`, `FRONTEND_URL`, `RESEND_API_KEY` (blank) as `make VAR=value`; copy that if you run a target by hand against the throwaway DB.
- **Readiness is a protocol probe over TCP.** Docker's port proxy accepts connections before Postgres listens, and the pgvector init server answers on its Unix socket only, then restarts. The driver sends a Postgres SSLRequest and a Redis `PING`, and waits for real answers.
- **Wine cards are buttons.** Each `WineCard` has `role=button` and its accessible name includes "Add to my cellar" and "Watch"; a substring match clicks the card and opens the detail panel instead. `--click` matches the exact name for this reason.
- **Dev login is opt-in.** The driver passes `DEV_LOGIN_ENABLED=true` (plus `FRONTEND_URL` on the slot port, so nothing lands on the root `.env`'s tunnel). `up` posts `{"email": "dev-admin@coupette.test"}` to `/api/auth/dev-login` once and caches the JWT in `$RUN_DIR/token`; the route is rate limited (10/min), so reuse `driver.sh token` instead of calling it again. The browser gets the token through `localStorage` (`auth_token`, plus `onboarded` to skip `/onboarding`). With the flag off the route answers 404, and it never appears in `/openapi.json`, flag or not. The backend refuses to boot with the flag outside development.
- **Vite listens on 127.0.0.1 only in driver runs.** `vite.config.ts` sets `host: true` (all interfaces) for the tunnel workflow; the driver runs `yarn dev --host 127.0.0.1 --strictPort` instead, so the dev login stays off the LAN and Vite fails rather than drift onto another worktree's port.
- **Chat and recommendations need embeddings.** Retrieval filters on `embedding IS NOT NULL`, so `up` runs `make embed-sync` after the seed (OpenAI key in `.env`, well under a cent for 58 products). An empty answer means the embed step failed: read `setup.log`.
- **`DEV-` SKUs give dead outbound links.** `NoteViewModal` builds a saq.com URL from the SKU.

## Troubleshooting

- **`port 81x1 is busy`**: a crashed run of this worktree holds it. `driver.sh down`, then `up`.
- **`a run is in progress here`**: `driver.sh down` first; `up` never stacks two runs in one worktree.
- **`make test-backend` fails `test_submit_waitlist_silences_duplicate_email` with `assert 429 == 201`** on a rerun within a minute: slowapi counts in the Redis that `REDIS_URL` points to, and the conftest reset only clears the in-memory fallback (3/min on `/api/waitlist`). Wait a minute, or run `cd backend && REDIS_URL=redis://127.0.0.1:1/0 poetry run pytest -q` (unreachable Redis → in-memory limiter; passes back to back).
- **`step failed: locator.waitFor: Timeout 15000ms exceeded`**: the text never appeared; open `$RUN_DIR/shots/failure.png`. Seen when a `--click` hit the wrong element (the substring trap above).
