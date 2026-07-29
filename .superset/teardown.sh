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

echo "✅ Workspace venvs removed. Shared postgres/redis left running."
