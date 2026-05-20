# Migration Patterns

> Auto-load when editing models in `core/`, when an Alembic migration is needed, or when adding/changing DB schema.

- Model is the source of truth — indexes, constraints, columns all defined on the model
- Migrations are patches for existing databases, not the primary schema definition
- Forward-only in production — never run `downgrade()`, write a new migration to fix mistakes
- NEVER write migration files manually — always use `make revision msg="description"` (requires running DB)
- When a migration is needed, always suggest the exact `make revision msg="..."` command with a descriptive message
- Victor generates and reviews migrations; Claude only modifies the model
- See [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md#migrations) for full practices

## Workflow

1. Modify the SQLAlchemy model in `core/`
2. Suggest the `make revision msg="<descriptive>"` command for Victor to run
3. After Victor reviews the generated migration, it lands in `core/alembic/versions/`
4. Migration is applied per the deployment issue (see CLAUDE.md → Deployment)

## Common pitfalls

- Adding NOT NULL to an existing column without a default: write the migration in two steps (add nullable + backfill, then alter to NOT NULL)
- Adding an index on a large table: use `CREATE INDEX CONCURRENTLY` (Alembic supports `postgresql_concurrently=True`)
- Renaming a column: emit `ALTER TABLE ... RENAME COLUMN` rather than drop+add
