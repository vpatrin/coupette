---
paths:
  - "core/db/models/**/*.py"
  - "core/alembic/**"
---

# Migrations

> Read whenever modifying SQLAlchemy models in `core/` or anything under Alembic.

## Hard rules

1. **Model is the source of truth.** Indexes, constraints, columns — all defined on the SQLAlchemy model in `core/`. Migrations are patches for existing databases, not the schema definition.
2. **NEVER write migration files manually.** Always use `make revision msg="<descriptive>"`. Requires a running DB. Victor generates and reviews migrations; Claude only modifies the model.
3. **Forward-only in production.** Never run `downgrade()`. Write a new migration to fix mistakes.
4. **Risky changes need two steps:**
   - NOT NULL on existing column? Add nullable + backfill, then alter to NOT NULL
   - Large-table index? Use `postgresql_concurrently=True` for `CREATE INDEX CONCURRENTLY`
   - Renaming a column? `ALTER TABLE ... RENAME COLUMN`, not drop+add

## Workflow

1. Modify the SQLAlchemy model in `core/`
2. Suggest the exact `make revision msg="..."` command for Victor to run
3. Migration lands in `core/alembic/versions/` after Victor reviews
4. Applied per the deployment issue (see CLAUDE.md → Hard Rules → Deployment)

See `docs/DEVELOPMENT.md#migrations` for full practices.
