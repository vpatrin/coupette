#!/usr/bin/env bash
# Superset workspace setup — runs once per new workspace, in the worktree root.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- .env ---
# Gitignored, so a fresh worktree has none. Symlink the root repo's, so one edit reaches
# every workspace; per-workspace values go in .env.local (the Makefile includes it last).
# vite.config.ts sets envDir to the repo root, so this single file also feeds VITE_* vars.
env_ok=false
if [ -z "${SUPERSET_ROOT_PATH:-}" ] || [ ! -f "$SUPERSET_ROOT_PATH/.env" ]; then
  echo "⚠️  No .env in \$SUPERSET_ROOT_PATH — link or copy one in manually."
  echo "   .env.example is not a usable substitute (empty JWT_SECRET_KEY and API keys)."
elif [ "$(cd "$SUPERSET_ROOT_PATH" && pwd -P)" = "$(pwd -P)" ]; then
  #! The root checkout: its .env is the link target. ln -sf here would replace it with a
  #! link to itself.
  env_ok=true
elif [ -e .env ] && [ ! -L .env ]; then
  env_ok=true
  echo "⚠️  Kept the existing regular .env. To follow the root one: ln -sf \"\$SUPERSET_ROOT_PATH/.env\" .env"
else
  ln -sfn "$SUPERSET_ROOT_PATH/.env" .env
  env_ok=true
  echo "▶ Linked .env to the root repo's"
fi

git config core.hooksPath .githooks

# --- Dependencies ---
# No `poetry lock` (unlike `make install`) — it would rewrite poetry.lock and
# leave every new workspace with a dirty worktree.
# Poetry venvs are keyed by project path, so each workspace gets its own.
for svc in core backend scraper bot; do
  echo "▶ poetry install — $svc/"
  (cd "$svc" && poetry install)
done

echo "▶ yarn install — frontend/"
(cd frontend && yarn install --frozen-lockfile)

# --- Shared services ---
#! postgres and redis are SHARED across all worktrees: docker-compose.yml pins
#! `name: coupette` and fixed container names, so compose resolves to the same
#! project from any directory. Starting them here is idempotent — it attaches to
#! the existing containers. Stopping them is NOT (see teardown.sh).
#! Gated on .env: the overlay sets POSTGRES_USER/PASSWORD/DB by interpolation from
#! .env, and without it compose would recreate the *shared* container with empty
#! credentials.
db_ok=false
if $env_ok && docker info >/dev/null 2>&1; then
  make start-db && db_ok=true
else
  echo "⚠️  Skipped postgres/redis (no .env, or Docker not running)."
  echo "   Fix both, then: make start-db"
fi

# --- Own database (opt-in) ---
# Superset passes no caller env to setup, so the trigger is a per-branch git config flag,
# set in the root checkout before creating the workspace (docs/DEVELOPMENT.md):
#   git config branch.<branch>.coupetteOwnDb true
# COUPETTE_OWN_DB=1 also works when this script runs by hand.
branch=$(git branch --show-current)
if [ "${COUPETTE_OWN_DB:-}" = 1 ] || [ "$(git config --bool "branch.$branch.coupetteOwnDb" || true)" = true ]; then
  if $db_ok; then
    ./.superset/own-db.sh
  else
    echo "⚠️  Own DB requested but postgres is not up. Fix it, then: make own-db"
  fi
  exit 0
fi

# Migrations are deliberately NOT run here: the DB is shared, so a branch with a
# new migration would migrate every other workspace too. Run `make migrate` by hand,
# or `make own-db` first when this branch adds a migration.
echo "✅ Workspace ready on the shared DB. A branch that adds a migration: make own-db, before any make migrate"
