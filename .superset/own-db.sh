#!/usr/bin/env bash
# Own database for this workspace: coupette_<branch> on the shared coupette-postgres,
# selected through .env.local, then migrated and seeded. Idempotent: a re-run reuses the DB.
# Run by setup.sh when the workspace opts in, or by hand: make own-db.
set -euo pipefail

cd "$(dirname "$0")/.."

PG=coupette-postgres
#! teardown.sh drops the DB only when .env.local carries this exact line.
MARKER="# own DB, written by .superset/own-db.sh (teardown.sh drops it)"

die() { echo "❌ $*" >&2; exit 1; }

#! Linked worktrees have a .git file; the root checkout has a .git directory. The root
#! keeps the shared DB: its .env is the one every workspace links to.
[ -f .git ] || die "own DB is for workspaces only, not the root checkout"

if [ -f .env.local ] && grep -qxF "$MARKER" .env.local; then
  db=$(sed -n 's/^DB_NAME=//p' .env.local)
else
  [ ! -e .env.local ] || die ".env.local exists and was not written by own-db.sh: merge it by hand"
  branch=$(git branch --show-current)
  [ -n "$branch" ] || die "detached HEAD: check out a branch first"
  # Branches are unique per worktree, so the name is too. Identifiers cap at 63 bytes.
  db=$(printf 'coupette_%s' "$branch" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_' '_' | cut -c1-63)
fi
[[ "$db" =~ ^coupette_[a-z0-9_]+$ ]] || die "unexpected DB name in .env.local: $db"

docker exec "$PG" pg_isready -q 2>/dev/null || die "$PG is not running: make start-db"
# psql runs inside the container as POSTGRES_USER, so no .env parsing here.
pg_sql() { docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -qtA'; }
if [ "$(echo "SELECT 1 FROM pg_database WHERE datname = '$db'" | pg_sql)" = 1 ]; then
  echo "▶ $db already exists, reusing it"
else
  echo "CREATE DATABASE \"$db\"" | pg_sql
  echo "▶ Created $db on $PG"
fi

if [ ! -f .env.local ]; then
  # Blank DATABASE_URL: core settings prefer it over DB_*, so a URL in the root .env would win.
  printf '%s\nDB_NAME=%s\nDATABASE_URL=\n' "$MARKER" "$db" >.env.local
  echo "▶ Wrote .env.local (DB_NAME=$db)"
fi

# Command-line values beat every include, so this can never migrate the shared DB.
make migrate seed DB_NAME="$db" DATABASE_URL=
echo "✅ This workspace uses its own DB: $db. Shared DB untouched."
