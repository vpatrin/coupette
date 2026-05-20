# Database

> Business context for anything touching PostgreSQL on the VPS. Read before editing models, queries, or running prod commands.

Single PostgreSQL instance on the VPS.
Container: `shared-postgres` · DB: `saq_sommelier` · User: `saq_sommelier`

Other databases on the same instance (do NOT touch):

- umami
- url_shortener

Prod query example:

```bash
sudo docker exec shared-postgres psql -U saq_sommelier -d saq_sommelier -c "SELECT ..."
```

For migration rules see [`.claude/patterns/migration-patterns.md`](../patterns/migration-patterns.md).
For backend repository patterns see [`.claude/patterns/db-patterns.md`](../patterns/db-patterns.md) (TBD).
