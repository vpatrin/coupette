# Session Log — CellarEntry model + migration

**Branch:** `feat/cellar-entry-model`
**Date:** 2026-08-05
**PR:** not yet
**Issue:** VPA-17
**Spec snapshot:** see `.claude/scratchpad/feat-cellar-entry-model/spec.md` while branch lives

## Why this work

The Cellar milestone (`docs/ROADMAP.md`) needs persistence for bottles users
own at home before any CRUD/UI work can start. This session ships the
`CellarEntry` model and migration only — one row per `(user_id, sku)` with a
`quantity`, not one row per bottle. CRUD endpoints, product-card actions, and
the My Cellar page are VPA-18..22.

## Decisions worth keeping

### `user_id` is `Integer` FK → `users.id`, not the legacy channel-prefixed string

- **Context:** `Watch.user_id` / `TastingNote.user_id` are `String` columns
  holding a channel-prefixed ID (`tg:123456`), inherited from Telegram-first
  auth (ADR 0004, superseded by ADR 0008 OAuth). `CellarEntry` is a brand-new
  table with no existing rows to preserve.
- **Decision:** go straight to `Integer, ForeignKey("users.id", ondelete="CASCADE")`
  — skip reproducing the legacy shape just to migrate it again later (VPA-42
  tracks migrating `Watch`/`TastingNote`).
- **Rejected:** matching `Watch`'s `String` pattern for consistency — rejected
  because it doubles the migration work for no benefit; the inconsistency
  between old and new tables is temporary and tracked.
- **Consequence for VPA-18 (the most useful thing for the next reader):**
  cellar service/repo code **cannot be copy-pasted from `watches.py`** — it
  must resolve the authenticated user's integer `id`, not build a
  `tg:`-prefixed string.
- **ADR:** no — this is scoped by the existing ADR 0004/0008 pair plus VPA-42;
  doesn't need its own record.

### No standalone index on `user_id`

- **Context:** `Watch.user_id` carries both a standalone index and a
  `(user_id, sku)` unique constraint — redundant, since the composite btree's
  leftmost prefix already serves `user_id`-only lookups.
- **Decision:** drop the standalone index on `CellarEntry.user_id`, keep it on
  `sku` (FK target, not covered by any other index). Reviewer independently
  verified the migration emits exactly one index (`ix_cellar_entries_sku`).
  AC wording "indexed" is satisfied by the composite constraint.
- **Rejected:** mirroring `Watch`'s redundant index for consistency — the spec
  explicitly called out not reproducing `Watch`'s legacy debt in a new table.
- **Spec drift note:** `spec.md`'s acceptance criteria still literally says
  `user_id (Integer, FK → users.id, indexed)` — this decision superseded that
  wording after the spec was drafted. Not fixing the scratchpad spec (it's
  ephemeral, dies with the branch); recording the reasoning here is what makes
  it durable.
- **ADR:** no — one-line index tuning, not a reversible-cost decision.

### `revision` (codegen) vs `migrate` (real DB) agent-ownership boundary

- **Context:** `.claude/rules/migrations.md` forbids agents writing migration
  files. This session got explicit one-time authorization for an agent to run
  `make revision` after verifying the Makefile target is hermetic (ephemeral
  `coupette-revision-tmp` container, torn down on every exit path, never
  touches dev or prod).
- **Decision (this session, scoped to this run only):** `revision` = codegen
  against an ephemeral container, agent-ownable under explicit authorization;
  `migrate` = runs against a real DB, always Victor's, never delegated.
- **Not decided here:** whether this becomes the standing rule. That requires
  editing `.claude/rules/migrations.md` and `.claude/agents/migrator.md`,
  which is out of scope for this PR — tracked as a follow-up chore (see
  Links).
- **ADR:** no — deliberately deferred to the follow-up chore PR, not this one.

## Obstacles + lessons

- Full-schema SQLite (`Base.metadata.create_all()`) fails for any model test
  in this repo — `products.tasting_profile` is `JSONB` (Postgres-only type),
  unsupported by the SQLite compiler. Confirmed empirically. Route taken:
  `CellarEntry.__table__.create(engine)`, creating only the one table under
  test. SQLite doesn't enforce FK constraints by default, so `users`/
  `products` never need to exist for the two constraint tests written here.
  Future model-level tests in this repo should expect the same constraint and
  reuse the single-table-create pattern.
- `core` has no pytest dependency, no `tests/` dir, and no CI job that would
  run tests placed there — tests for a `core` model live in `backend/tests/`
  instead (CI's `test-backend` job triggers on `core/**` changes, so this is
  the path that actually executes). Worth revisiting if `core` ever gets its
  own suite.

## Final state

- **Files changed:** `core/db/models.py` (new `CellarEntry` class, +38
  lines), `core/alembic/versions/a321897f6ef7_add_cellar_entries_table.py`
  (new migration, chains onto prior head `d54ff3a506b5`),
  `backend/tests/test_cellar_entry_model.py` (new, 2 tests).
- **Tests:** 2 added (duplicate `(user_id, sku)` → `IntegrityError`;
  `quantity=0` → `IntegrityError`). Full backend suite: 291 passed, coverage
  84.18% (unchanged from baseline — new test file is under `omit = ["tests/*"]`).
  `core` has no coverage threshold (`.claude/rules/testing.md`).
- **ADRs spawned:** none — all three decisions above failed the ADR gate
  (no ADR-worthy alternative-weighing beyond what ADR 0004/0008 already cover,
  or explicitly deferred to a follow-up chore PR).
- **Docs updated:** `docs/ROADMAP.md` (Cellar milestone item marked `[x]`),
  `docs/session-logs/INDEX.md`.
- **Migrations:** yes — `cellar_entries` table (revision `a321897f6ef7`,
  `down_revision = d54ff3a506b5`). `upgrade()` adds the table with both named
  constraints (`uq_cellar_entries_user_sku`, `ck_cellar_entries_quantity`) and
  one index (`ix_cellar_entries_sku`); `downgrade()` drops index then table.
  Not yet applied to any real database — Victor runs it per spec's AC
  (fresh-DB already covered by CI's `migrate` job; prod-copy run is manual).

## Docs NOT updated (checked, found current)

- `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md` — both describe the DB-as-
  integration-layer pattern and the model/schema/migration workflow
  generically, not as an inventory of tables. Confirmed: `ARCHITECTURE.md`'s
  own example list ("manages `watches`, `users`, `chat_sessions`") already
  omits `tasting_notes`, which shipped in #442 — proof the list is
  illustrative, not exhaustive. No edit needed.
- `README.md` — no model/table inventory to update.
- `docs/specs/` — no `cellar.md` spec exists yet, and none should: no public
  API contract, data flow, or operational detail exists for this subsystem
  until VPA-18 ships the CRUD endpoints. Creating one now would describe a
  contract that doesn't exist yet.
- `CHANGELOG.md` — skipped. Mental test: would a user notice this change? No
  — no endpoint, no UI, nothing reachable. Precedent: `TastingNote` model +
  migration (#442) got no changelog line of its own; only the full "Tasting
  journal" capability (all of #442-446 combined) earned a line at 1.6.0. Same
  pattern applies here — the Cellar changelog line lands when VPA-18-22 ship
  the reachable feature.

## Pipeline friction (for Victor's `/fix` backlog)

- `.claude/agents/orchestrator.md` (lines ~57-65, 120-131) and
  `.claude/commands/feature.md` (line 22) still describe a nested-worktree
  step (`git worktree add ... ~/.claude/worktrees/coupette/<branch>`). This
  session's orchestrator explicitly overrode it — Superset already provides
  worktree isolation, so the pipeline stayed in the Superset-managed worktree
  with no nested worktree created. The playbook doc is stale; a follow-up
  chore should update it (Victor already called this out mid-session as "not
  this PR").
- `.claude/commands/data.md:68` — the reviewer independently flagged this
  line's comment ("downgrade should be a no-op") as aspirational/stale: no
  migration in the repo actually implements a no-op `downgrade()` (this one
  included — it does a real `drop_index`/`drop_table` reversal, the universal
  repo pattern). Worth a `/fix` to align the doc with actual practice, or to
  decide the doc is right and start enforcing it.

## Links

- **PR:** TBD
- **Per-agent pipeline trace:** `.claude/scratchpad/feat-cellar-entry-model/log.md`
- **Related ADRs:** `docs/adrs/0004-telegram-first-auth.md`,
  `docs/adrs/0008-oauth2-security-design.md` (context for the `user_id` FK
  shape decision above)
- **Related session logs (same surface):** none yet — first `core` schema
  session log in the index.
- **Forward pointers:**
  - VPA-18 (Cellar CRUD endpoints) — cannot copy-paste `watches.py`'s
    user-id handling; must resolve the authenticated user's integer `id`.
  - VPA-42 (migrate `Watch`/`TastingNote` `user_id` to `Integer` FK) — closes
    the inconsistency this session deliberately left open.
  - Follow-up chore PR (not filed yet) to amend `.claude/rules/migrations.md`
    and `.claude/agents/migrator.md` with the `revision`/`migrate`
    agent-ownership boundary established this session.
  - Follow-up chore to fix the stale nested-worktree playbook step and the
    `downgrade()` no-op comment in `.claude/commands/data.md` (see Pipeline
    friction above).
