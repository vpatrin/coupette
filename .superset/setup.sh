#!/usr/bin/env bash
# Superset workspace setup — runs once per new workspace, in the worktree root.
set -euo pipefail

cd "$(dirname "$0")/.."

# --- .env ---
# Gitignored, so a fresh worktree has none. Copy from the root repo.
# vite.config.ts sets envDir to the repo root, so this single file also feeds VITE_* vars.
env_ok=false
if [ -n "${SUPERSET_ROOT_PATH:-}" ] && [ -f "$SUPERSET_ROOT_PATH/.env" ]; then
  cp "$SUPERSET_ROOT_PATH/.env" .env
  env_ok=true
  echo "▶ Copied .env from root repo"
else
  echo "⚠️  No .env in \$SUPERSET_ROOT_PATH — copy one in manually."
  echo "   .env.example is not a usable substitute (empty JWT_SECRET_KEY and API keys)."
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
if $env_ok && docker info >/dev/null 2>&1; then
  docker network inspect internal >/dev/null 2>&1 || docker network create internal || true
  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis
else
  echo "⚠️  Skipped postgres/redis (no .env, or Docker not running)."
  echo "   Fix both, then: make start-db"
fi

# Migrations are deliberately NOT run here: the DB is shared, so a branch with a
# new migration would migrate every other workspace too. Run `make migrate` by hand.
echo "✅ Workspace ready. Run migrations manually if this branch needs them: make migrate"
