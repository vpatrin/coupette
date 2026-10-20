#!/usr/bin/env bash
# Superset workspace teardown — runs when the workspace is deleted.
set -euo pipefail

cd "$(dirname "$0")/.."

#! Do NOT add `docker compose down` / `make stop-db` here.
#! postgres and redis are shared: compose pins `name: coupette` with fixed
#! container names, so stopping them from one workspace kills the database for
#! the root repo and every other worktree.

# Poetry venvs live in the global cache, keyed by project path — these belong to
# this workspace only and would otherwise accumulate forever.
for svc in core backend scraper bot; do
  (cd "$svc" && poetry env remove --all >/dev/null 2>&1) || true
done

# Own DB (.superset/own-db.sh): drop it only when own-db.sh wrote .env.local, and never
# the shared DB named in the root .env.
MARKER="# own DB, written by .superset/own-db.sh (teardown.sh drops it)"
if [ -f .env.local ] && grep -qxF "$MARKER" .env.local; then
  db=$(sed -n 's/^DB_NAME=//p' .env.local)
  shared=$(sed -n 's/^DB_NAME=//p' .env 2>/dev/null || true)
  if [[ "$db" =~ ^coupette_[a-z0-9_]+$ ]] && [ "$db" != "$shared" ]; then
    # WITH (FORCE) ends the sessions a still-running backend holds.
    if echo "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" |
      docker exec -i coupette-postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q'; then
      echo "▶ Dropped $db"
    else
      echo "⚠️  Could not drop $db (is coupette-postgres running?). Drop it by hand."
    fi
  else
    echo "⚠️  Refused to drop \"$db\" from .env.local: not an own-DB name."
  fi
fi
rm -f .env.local

echo "✅ Workspace venvs removed. Shared postgres/redis left running."
