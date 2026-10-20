# Engineering

Engineering targets and the backlog of work that makes Coupette build better without being user-visible. Product phases live in [ROADMAP.md](ROADMAP.md). Platform work (VPS, Caddy, backups, monitoring) lives in the [infra repo](https://github.com/vpatrin/infra).

Scheduled work is tracked in Linear; this file keeps the targets and the unscheduled ideas. GitHub `#NNN` refs date from before Linear: they stay as history, and new items get none.

---

## In place

One line per area; the linked doc owns the detail.

- **Testing** — unit tests in every service, Vitest + React Testing Library in the frontend. Rules and coverage thresholds: [`.claude/rules/testing.md`](../.claude/rules/testing.md).
- **Code quality** — Ruff in the four Python services (rule set and per-file ignores in each `pyproject.toml`, e.g. [backend/pyproject.toml](../backend/pyproject.toml)); ESLint, Prettier, and strict TypeScript in the frontend. `make lint` checks, `make format` fixes.
- **Git hooks** — `.githooks/`, enabled by `make install`. Pre-commit lints the services with staged changes. Pre-push checks lock files and migration coverage, then tests the changed services.
- **Frontend type check** — `yarn typecheck` runs `tsc --noEmit` on the root `tsconfig.json`, which holds only project references, so it checks no file. Type errors surface in `yarn build` (`tsc -b`), which CI runs in `build-frontend`.
- **Security** — [SECURITY.md](SECURITY.md): auth model, threat model, CI scanning.
- **Observability** — Loguru logs ([core/logging.py](../core/logging.py)), Prometheus `/metrics` with custom `coupette_*` metrics ([backend/metrics.py](../backend/metrics.py)), and the `recommendation_logs` table. History: [SCALING.md](SCALING.md#tier-1-measure--baseline--observability). Dashboards and alerts: infra repo.
- **Settings** — Pydantic `BaseSettings` in [core/config/settings.py](../core/config/settings.py): startup fails on a missing required var (`DB_USER`, `DB_PASSWORD`, `DB_NAME`), `ENVIRONMENT` gates dev-only behavior, `DATABASE_ECHO` logs SQL.
- **Platform** — CI on every PR; CD on tag push, with images tagged by the release's semver tag (`sha-<commit>` on a manual dispatch, see `.github/workflows/cd.yml`). Deploy process: [DEVELOPMENT.md](DEVELOPMENT.md#deploy). Local stack: `make dev`.
- **Containers** — non-root (`USER 1000` in each service Dockerfile); read-only filesystem, `no-new-privileges`, and log rotation (50 MB × 3) in [docker-compose.yml](../docker-compose.yml); memory limits in [docker-compose.prod.yml](../docker-compose.prod.yml).
- **AI / ML** — RAG pipeline: [ADR 0005](adrs/0005-rag-pipeline.md). Retrieval and eval: [specs/rag.md](specs/rag.md).
- **Scaling** — tiers, what to monitor, and when to advance: [SCALING.md](SCALING.md). Scraper operations (idempotent runs, systemd timers, exit codes): [DEVELOPMENT.md](DEVELOPMENT.md#scraper).

---

## Targets

| Area | Target | Today |
|---|---|---|
| API latency | p95 < 500 ms | First Tier 1 baseline (#502): search p95 328 ms, detail 138 ms, facets 863 ms |
| Uptime | 99% | Uptime Kuma (infra repo) |
| Data freshness | Scraper completes weekly; data < 8 days stale | Not measured |
| Bot | Ack < 2 s | Not measured |
| DB pool | Scraper engine: `pool_size=3`, `max_overflow=2`, sized for a 4 GB VPS that shares Postgres. The backend keeps 10 / 10 for parallel facets queries ([SCALING.md](SCALING.md#2026-03-21--connection-pool-tuning-509)) | `core/db/base.py:create_session_factory` passes no pool args, so SQLAlchemy's 5 / 10 applies (#314) |
| `/metrics` | Separate internal port | Served on the app port (`backend/app.py`) (#501) |

---

## Benchmarks

Two tracks, load and AI quality, each recorded per version. Each [SCALING.md](SCALING.md) tier action gets a before/after baseline as proof it worked. Runs are manual; no CI automation.

### Load testing

k6 scripts in `backend/benchmarks/load/`. `runners/tier1-baseline.sh` runs the four scenarios (search, stores, watches, chat) at 1 VU. Results land in `backend/benchmarks/load/results/tier1-<ref>-<datetime>/` (gitignored). `--skip-chat` saves Claude credits.

Phases:

0. **Run** — fix the k6 scripts against localhost: default `localhost:8001`, prod opt-in, validate response shapes.
1. **Capture** — record metadata and Grafana annotations in the runner (#503); generate the baseline `.md` from the k6 summary JSON (#504); commit baselines to `benchmarks/baselines/`, keyed by tag (#505).
2. **Compare** — diff two baselines and flag regressions (#506). Optional: k6 Prometheus remote write for a per-scenario Grafana breakdown.
3. **Tooling** — Tier 2 breakpoint script, 10–50 VU ramp (#507); one command for run, capture, and report.
4. **Cloud** (#523) — Terraform in `benchmarks/terraform/` provisions an ephemeral Hetzner CX23, restores the prod DB from the S3 backup, runs k6 and the evals on prod-like data (14k vectors, no network noise), and uploads results to `s3://victorpatrin-backups/benchmarks/`. State: key `benchmarks/terraform.tfstate` in `s3://victorpatrin-terraform-state/`.

### AI quality

Eval framework in `backend/benchmarks/eval/`, spec in [specs/rag.md](specs/rag.md): relevance, diversity, and prompt adherence against a frozen test set. Next: put eval scores into the baseline reports, so load and quality share one snapshot.

Synthesized reports live in [benchmarks/](../benchmarks/).

---

## Backlog

Unscheduled engineering work: not product, not infra. Picked up when it unblocks product work. When an item is done, delete its line.

### Frontend

From the 2026-04-02 audit, in priority order:

1. **Error boundary** — there is none, so one unhandled throw takes down the whole app. Wrap the pages in a single `<ErrorBoundary>`.
2. **Silent failures** — 6 `catch(() => {})` (`AuthContext`, `AppShell`, `SettingsPage` ×2, `LandingPage`, `ChatPage`) leave the user with a blank state. Replace them with inline error state.
3. **Split large pages** — `SearchPage.tsx` (754 lines) and `AppShell.tsx` (572 lines): extract `SearchFilters`, `SearchResults`, `CategoryChips`, `NavigationSidebar`. The page tests below need it.
4. **API layer** — `lib/api.test.ts` covers `ApiError`, `api`, and `fetchAllPages`; `useApiClient` has no test.

Tests still missing:

- `AppShell` — sidebar collapsed and expanded state
- API-mocked pages — `SearchPage`, `SavedStoresPage`: loading, empty, and populated states
- `LoginPage` / `LandingPage` — render and CTA presence
- `ChatPage` — render and message list
- Coverage threshold — a ~60% floor once the page split lands ([`.claude/rules/testing.md`](../.claude/rules/testing.md))
- A real type check — `tsc -b --noEmit` or a per-project `-p`, so the pre-commit hook catches type errors before CI does

### Python tests

- Product test factory (`make_red()`, `make_white()`, `make_wines(n)`) — removes repeated fixture setup
- Real-DB fixture — integration tests on a seeded PostgreSQL for the repository layer: search, filter, pagination, upsert idempotency
- Contract tests — snapshot API response shapes, so the bot's assumptions are checked on every PR

### Auth

- JWT from `localStorage` to `HttpOnly` cookies — removes XSS token theft. The backend sets and clears the cookie on login and logout, the frontend drops the manual `Authorization` header, and CORS needs `credentials: 'include'`.

### Observability

- Request correlation — `X-Request-ID` middleware across bot → backend → DB (#315)
- Source identifier on recommendation logs (#340)
- Structured JSON logging (#489) — consistent fields across services, and one JSON line per recommendation: `event`, `query`, `candidate_count`, `top_similarity`, `min_similarity`, `retrieval_ms`, `llm_ms`, `total_ms`, `tokens_in`, `tokens_out`, `model`, `status`, `error`, null or 0 when missing, never omitted. Contract with the infra repo: Alloy ships to Loki (vpatrin/infra#63), dashboards in vpatrin/infra#64 and #65. No PII beyond session-level ids.
- API request logging middleware → `api_request_logs` table (path, status, latency, user_id) — the baseline for SLO tracking
- LLM cost tracking — token usage per request, daily budget alert

### Bot, scraper, AI

- Bot: feedback buttons on recommendation responses (#337)
- Scraper: batch the embedding step to cut memory use (#390)
- Scraper: monthly scrape refactor — SKU-set diff, new SKUs only. Design in [specs/scraper.md](specs/scraper.md) § Monthly scrape.
- AI/ML: RAG eval iteration — frozen until pipeline quality needs attention. See [specs/rag.md](specs/rag.md).

### SRE

- DB pool limits and scraper retries (#314) — the pool target is in [Targets](#targets); the scraper's httpx client needs `AsyncHTTPTransport(retries=2)`, so one 5xx stops killing that product's scrape
- `/metrics` on a separate internal port (#501) — see [SCALING.md](SCALING.md#separate-metrics-port)
- `/health/detailed` — Postgres reachability, data freshness, disk space
- SLO tracking — measure the [targets](#targets); needs the API request log
- IP-based rate limits to Caddy — global, auth, and waitlist limits move to the proxy; per-user LLM limits stay in the app, because the proxy can't read JWT claims. Several Caddy instances need `caddy-ratelimit` on the shared Redis. See [ADR 0009](adrs/0009-rate-limiting-tiered-strategy.md).

### Ops

- Rename the database `saq_sommelier` → `coupette`, coordinated with infra (#423)
- Rotate all production secrets (#406)

---

## Side quests

Ideas worth revisiting, one line each. Not scheduled.

- **SSE chat streaming** — worth doing: the UX rule "Stream, don't spin" (`.claude/rules/frontend.md`) asks for token-by-token AI responses, and `send_message` waits for the full Claude reply. See [SCALING.md](SCALING.md#sse-streaming).
- **Playwright E2E** — one test per critical journey (login → search → watch, a chat message, a logged tasting) against a real server.
- **Idempotency keys** — an `Idempotency-Key` header cached 24 h in Redis on `POST /tastings` and `POST /chat/sessions`; until then, a disabled submit button covers most double submits.
- **Background task queue** — fire-and-forget jobs such as Haiku signal extraction, off the request cycle; a stepping stone before Temporal. Tool choice: [SCALING.md](SCALING.md#async-task-queue).
- **Prompt versioning + LLM observability** — log a prompt version hash with every LLM call in `recommendation_logs`; LangSmith or Braintrust to browse traces and compare prompt versions.
- **Load testing phases 0–1** — see [Load testing](#load-testing).
- **Embedding caching** — cache query embeddings by normalized query text, to cut OpenAI cost and search latency. Design: [SCALING.md](SCALING.md#embedding-cache).
- **MCP server / Sonnet + tools** — expose Coupette data to Claude Code and Claude Desktop through MCP (`search_wines`, `get_product`, `get_user_watches`), then benchmark Haiku RAG against Sonnet + tools.

**Someday:** Temporal (durable workflows) · NATS JetStream (event fan-out for notifications) · WebSockets (in-app notifications) · OpenTelemetry (end-to-end traces) · Sentry (error tracking) · DB read replica ([SCALING.md](SCALING.md#read-replica)).
