# Session Log — Cellar CRUD endpoints

**Branch:** `feat/vpa-18-cellar-crud-endpoints`
**Date:** 2026-10-15
**PR:** not yet
**Issue:** VPA-18
**Spec snapshot:** see `.claude/scratchpad/feat-vpa-18-cellar-crud-endpoints/spec.md` while branch lives

## Why this work

The Cellar milestone (`docs/ROADMAP.md`) had its table (VPA-17, `CellarEntry`) but no way to reach it.
This ships the HTTP surface the cellar UI (VPA-19..22) will build on: add, list, set quantity and
remove, at `/api/cellar`, scoped to the JWT user. API only, no UI, so no changelog line yet.

## Decisions worth keeping

### Integer `users.id` via `get_current_active_user`; cellar is JWT-only

- **Context:** VPA-17's log warned that cellar code cannot be copy-pasted from `watches.py`. The
  existing helpers (`get_caller_user_id`, `resolve_user_id`) yield `"user:{id}"` strings and let a
  bot-secret caller supply `user_id`.
- **Decision:** routes take `Depends(get_current_active_user)` and pass `user.id` (plain `int`) to
  the service, as `api/users.py` does. No `user_id` in any body or query. A bot-secret caller with no
  bearer gets 401. Cross-user access has no 403 path: every query filters on the JWT user id, so
  another user's row is simply a 404.
- **Rejected:** reusing `get_caller_user_id` / `resolve_user_id` (wrong id type, and the bot-secret
  `user_id` override has no use on a table with no bot consumer).
- **ADR:** no. Fails test 2 (no client consumes the API yet; bot access would be additive later).
  The integer FK itself is already covered by the VPA-17 log, ADR 0004/0008 and VPA-42.

### POST is an atomic upsert-increment, always 201 (no 409)

- **Context:** watches map a duplicate to `ConflictError` (409). A cellar "add" is a +1 on a card,
  and owning two of a bottle is normal.
- **Decision:** one `INSERT ... ON CONFLICT ON CONSTRAINT uq_cellar_entries_user_sku DO UPDATE SET
  quantity = quantity + excluded.quantity`, then a re-select through the product join. `added_at` is
  not in the SET clause, so re-adding keeps the first-add date. 201 for create and increment alike
  (the atomic upsert cannot cheaply tell them apart); the body carries the new total.
- **Rejected:** 409 on duplicate (forces the client to PATCH after a failed POST); select-then-write
  (racy: lost increment or a 500 on the unique constraint).
- **ADR:** no. Fails test 2 (no consumer yet, cheap to change before the UI ships).

### PATCH `quantity=0` deletes (204, no body); `> 0` returns 200 + body

- **Context:** roadmap says "auto-remove when quantity hits 0", and the `quantity > 0` CHECK must never
  be the thing that rejects a request.
- **Decision:** the service looks the entry up first (missing is 404, also for `quantity=0`), then
  either updates or deletes (load, mutate/delete, flush, as tastings does). The route declares
  `response_model=CellarEntryOut` and returns `Response(204)` when the service returns `None`,
  documented via `responses={204: ...}`. FastAPI rejects `response_model` on a 204-only route, and
  there was no repo precedent for one route answering 200 or 204.
- **Rejected:** 422 on `0` (pushes removal to a second DELETE call); update-then-delete (would write
  a `0` row and trip the CHECK).
- **ADR:** no. Fails test 2.

### Delisted SKUs can be added and stay listed; `Out` is always built from the repo join

- **Context:** `products_repo.find_by_sku` filters delisted products. An owned bottle does not stop
  being owned when SAQ delists it.
- **Decision:** `find_one`, `find_by_user` and `upsert` return `(CellarEntry, Product)` from one
  INNER join with no delisted filter. Every `CellarEntryOut` (POST, PATCH, GET) comes from that join,
  never from `find_by_sku`, which would 500 a non-null `product`. GET is one query (no N+1).
- **Rejected:** blocking delisted adds (hides a bottle the user owns).
- **Consequence:** `ProductOut` has no delisted flag or image, so VPA-20 may need to extend it.
- **ADR:** no. Not hard to reverse; the code and its docstring explain it.

### Smaller calls (Victor accepted the defaults)

- `MAX_CELLAR_QUANTITY = 99` caps `quantity` in POST/PATCH bodies only; the running total is uncapped.
- POST `quantity` optional, default 1, `ge=1`. PATCH `quantity` `ge=0`. GET is a plain list, no
  pagination (revisit at VPA-21).
- Lax coercion like every other schema: `"2"` and `2.0` are accepted, fractional or non-numeric is
  422. Pinned by a test.
- Services take a plain `int` user id, captured before any rollback path. Any `IntegrityError` on
  POST is reported as `Product not found` (tastings precedent; a user-FK race would mislabel).

### Ticket reconciled with code

The ticket's ACs were adjusted in the spec: "unknown SKU" is 404 `Product` on POST (not 422), and 404
`CellarEntry` on PATCH/DELETE (two tests, not one); no `ConflictError` path; a third schema
`CellarEntryUpdateIn` for PATCH (tastings precedent); user resolution as above.

## Obstacles + lessons

- **Stale-read footgun in `upsert` (reviewer W1).** The upsert bypasses the ORM, so the plain ORM
  re-select could return the old quantity if the `CellarEntry` is already in the session identity map
  (reproduced on SQLite: 1 vs 4). Unreachable in today's POST flow, but `upsert` is a reusable
  primitive and VPA-8's taste-profile hook is the obvious next caller. Fixed with
  `.execution_options(populate_existing=True)`, pinned by a mutation-checked test.
- **The upsert SQL has never executed against Postgres (W2, open).** Backend tests mock the session
  and CI runs Postgres only for the `migrate` job, so evidence is compile-level (the rendered SQL, and
  `insert_prefetch` confirming the Python-side `added_at` default fires). Open pre-merge check, listed
  in the PR body: POST twice for one SKU (quantity accumulates, `added_at` stays, 201 both times);
  unknown SKU gives 404 (the FK error must surface at `await db.execute`, inside the service's
  try/except); delisted SKU gives 201 with `product` populated; two parallel POSTs for a new SKU give
  no 500 and sum correctly. The working notes assume Victor runs it; he did not explicitly confirm.
- **Circular cross-user tests.** First pass: 66 tests / 639 lines. With a mocked repo, a test whose
  fake `find_one` returns `None` for user 2 proves nothing. The real checks are the caller's id
  reaching the repo (now parametrized over users 1 and 2) and exact-equality on the compiled
  `WHERE cellar_entries.user_id = ...`. Trimmed to 63 tests / 573 lines.
- **Rule vs reality:** `testing.md:79` and `auth.md:28` demand real DB sessions; every backend test
  mocks them. Followed the existing pattern (reviewer: deviation by decision). The rule text is
  aspirational; flagged below.
- Worktree HEAD predated #862, so `CellarEntry` was missing until the branch was based on
  `origin/main`. `origin/main` then moved to `ce00fed` mid-run (unrelated `.claude/` changes);
  rebase before the first push.

## Final state

- **Files changed:** 8 (6 backend source: `api/cellar.py`, `services/cellar.py`,
  `repositories/cellar.py`, `schemas/cellar.py` new, ~201 lines, plus `app.py` +2 and `config.py`
  +1; 2 test files, 573 lines: `test_cellar.py` 422, `test_cellar_repository.py` 151).
- **Tests:** 63 added (50 route, 13 repo SQL-contract). Backend suite 354 passed (was 291).
  Coverage 84.18% (last pre-change figure, VPA-17 log) to 85.04%; cellar modules 100% line+branch;
  diff coverage 100% on 101 lines.
- **ADRs spawned:** none. No specialist suggested one; all four candidates failed test 2.
- **Docs updated:** `docs/ROADMAP.md` (Cellar CRUD item ticked), `.claude/rules/backend.md` (added
  `get_current_active_user` and which-dependency guidance),
  `.claude/rules/auth.md` (`get_current_active_user` in the Mechanisms list),
  `docs/session-logs/INDEX.md`.
- **Migrations:** no.

## Docs NOT updated (checked)

- `CHANGELOG.md`: deferred per the spec. API-only, nothing a user can reach; the line lands with the
  cellar UI (VPA-19/20), same as the VPA-17 and tasting-model precedent.
- `docs/specs/`: no cellar spec exists and no existing spec lists these routes (watches and tastings
  have none either). Not creating one while the subsystem is half-built.
- `docs/ARCHITECTURE.md` route diagram: already omits `/api/tastings` and `/api/users`, so it is
  illustrative. `docs/SECURITY.md`: its unauthenticated-route exception list is unchanged.

## Pipeline friction (for Victor's `/fix` backlog)

- `.claude/agents/orchestrator.md` worktree snippet: `git worktree add "$WORKTREE" -b "$BRANCH"` has
  no start point, so it branches from the orchestrator's current HEAD (a stale Superset branch here).
  The orchestrator had to pass `origin/main`. **Reconcile with the VPA-17 log**
  ([2026-08-05](./2026-08-05-cellar-entry-model.md)), which recommended *removing* the nested-worktree
  step; this run used it. Decide keep-and-fix or remove in one `/fix`.
- `.claude/agents/test-writer.md`, `.claude/agents/reviewer.md`: `diff-cover --compare-branch=main`
  is wrong in worktrees (local `main` is stale; use `origin/main`), and diff-cover ignores untracked
  files, so new files are invisible until committed or `git add -N`'d. Both worked around it.
- `.claude/agents/scoper.md`: relative `.claude/scratchpad/...` resolves against the subagent's cwd
  (a Superset workspace), not the main repo; the orchestrator passed the absolute path.
- `.claude/agents/orchestrator.md` says to fetch Linear via MCP tools; the Superset CLI (v1.37.0) has
  no `mcp` subcommand and the native Linear MCP needed an OAuth round-trip before the scoper could start.
- `.claude/rules/testing.md:79` and `.claude/rules/auth.md:28` (real DB sessions) contradict the
  all-mocked backend suite. Either add a DB fixture or reword the rules; subagents keep tripping on it.

## Links

- **PR:** TBD
- **Per-agent pipeline trace:** `.claude/scratchpad/feat-vpa-18-cellar-crud-endpoints/log.md`
- **Related ADRs:** `docs/adrs/0004-telegram-first-auth.md`, `docs/adrs/0008-oauth2-security-design.md`
- **Related session logs (same surface):** [2026-08-05-cellar-entry-model.md](./2026-08-05-cellar-entry-model.md)
- **Deferred, optional (reviewer recommendation):** `/security` (new user-scoped API surface; IDOR
  isolation is proven only by compiled where-clauses) and `/data` (upsert plus use of the
  `uq_cellar_entries_user_sku` index).
- **Forward pointers:** VPA-19/20 add the changelog line, may extend `ProductOut`, and are the moment
  to write `docs/specs/cellar.md`; VPA-21 revisits pagination and the card badge (build from
  `GET /api/cellar`); VPA-8 hooks taste-profile signals (reuse `upsert`); VPA-42 migrates
  `Watch`/`TastingNote` to the integer FK.
