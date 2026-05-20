---
paths:
  - "core/db/models/**/*.py"
  - "core/alembic/**"
---

# Migrations (auto-loaded)

Full context: [`patterns/migration-patterns.md`](../patterns/migration-patterns.md), [`domains/database.md`](../domains/database.md).

## Hard rules

1. **Model is the source of truth.** Indexes, constraints, columns — all defined on the SQLAlchemy model in `core/`. Migrations are patches for existing databases, not the schema definition.
2. **NEVER write migration files manually.** Always use `make revision msg="<descriptive>"`. Victor runs this with a running DB; Claude only modifies the model.
3. **Forward-only.** Never write a downgrade fixup; write a new migration to correct mistakes.
4. **Risky changes need two steps:** NOT NULL on existing column? Add nullable + backfill, then alter. Large-table index? `CREATE INDEX CONCURRENTLY` via `postgresql_concurrently=True`.

## When you modify a model

Suggest the exact `make revision msg="..."` command for Victor. Don't run it yourself.
