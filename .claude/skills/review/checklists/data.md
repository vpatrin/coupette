# Data checklist

Applies when the diff touches `core/db/`, `backend/repositories/`, or `backend/schemas/` — and in depth with `/review data`. Migration mechanics are in `migrations.md`.

State the production consequence of each finding (full scan, lock, inconsistency). Data loss, corruption, or an irreversible change is a BLOCK; the rest is WARN unless it fails an item below on a hot path.

- **DATA-1** No N+1: a list query followed by per-row queries uses `selectinload`/`joinedload` instead.
- **DATA-2** No unbounded query: anything that can return many rows has a `LIMIT` or pagination.
- **DATA-3** A column used in a hot `WHERE` or `JOIN` has an index (skip tables under ~1k rows); composite index columns are in selectivity order; a suggested index names its exact columns and whether it is unique or partial.
- **DATA-4** Column types fit (`TIMESTAMPTZ` for times, `BigInteger` for ids, `Text` vs `String(n)` deliberate); nullability and defaults are intentional; FKs and unique constraints live on the model.
- **DATA-5** Read-then-write sequences that must be atomic run in one transaction (or use an upsert / row lock).
- **DATA-6** No blocking I/O inside async code paths.
- **DATA-7** Model ↔ schema consistency: `*Out` fields exist on the model, `*In` length limits match column limits, enums and optionality agree.
- **DATA-8** pgvector: the column dimension matches `core/embedding_constants.py`; the distance operator matches the index (`<=>` cosine).
