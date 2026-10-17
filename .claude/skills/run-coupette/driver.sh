#!/usr/bin/env bash
# Coupette run driver: the full stack (backend :8001 + frontend :5173) on a throwaway
# Postgres and Redis, seeded with the synthetic catalog. Never touches the shared
# coupette-postgres / coupette-redis containers or the shared DB.
#
#   driver.sh up | status | token | api <path> | browse <path> [steps…] | logs | down
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
SKILL_DIR=.claude/skills/run-coupette
RUN_DIR="${COUPETTE_RUN_DIR:-/tmp/coupette-run}"
PG=coupette-run-pg
REDIS=coupette-run-redis
PG_PORT=5434
REDIS_PORT=6380
ADMIN_EMAIL=dev-admin@coupette.test
PW_VERSION=1.63.0
PW_PREFIX="$HOME/.cache/coupette-run/node"

die() { echo "❌ $*" >&2; exit 1; }
listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# Make command-line overrides beat the root .env that the Makefile includes and exports.
# Plain env vars would lose: `-include .env` reassigns them inside make.
overrides() {
  OVR=(
    DB_HOST=localhost "DB_PORT=$PG_PORT" DB_USER=coupette DB_PASSWORD=coupette DB_NAME=coupette
    DATABASE_URL= "REDIS_URL=redis://localhost:$REDIS_PORT/0" ENVIRONMENT=development
    "ADMIN_EMAIL=$ADMIN_EMAIL" "JWT_SECRET_KEY=$(cat "$RUN_DIR/jwt.key")"
    # Dev login is opt-in (off in the root .env); FRONTEND_URL beats the .env's tunnel URL.
    DEV_LOGIN_ENABLED=true FRONTEND_URL=http://localhost:5173
    # A dev-login admin can approve waitlist entries, which sends mail: no email key here.
    RESEND_API_KEY=
  )
}

wait_for() { # <seconds> <command…>
  local secs=$1; shift
  for _ in $(seq 1 "$secs"); do "$@" >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}

cmd_up() {
  for p in 8001 5173 "$PG_PORT" "$REDIS_PORT"; do
    listening "$p" && die "port $p is busy (another workspace running the app? \`$SKILL_DIR/driver.sh down\` or stop it there)"
  done
  mkdir -p "$RUN_DIR/shots"
  # Per-run signing key, kept outside the repo.
  python3 -c 'import secrets; print(secrets.token_urlsafe(32))' >"$RUN_DIR/jwt.key"
  overrides

  docker rm -f "$PG" "$REDIS" >/dev/null 2>&1 || true
  docker run -d --name "$PG" -e POSTGRES_USER=coupette -e POSTGRES_PASSWORD=coupette \
    -e POSTGRES_DB=coupette -p "127.0.0.1:$PG_PORT:5432" pgvector/pgvector:pg16 >/dev/null
  docker run -d --name "$REDIS" -p "127.0.0.1:$REDIS_PORT:6379" redis:8-bookworm \
    redis-server --save "" --appendonly no >/dev/null
  # TCP, not the socket: the image's init server listens on the socket only, then restarts.
  wait_for 60 docker exec "$PG" pg_isready -h 127.0.0.1 -U coupette || die "throwaway postgres never became ready"
  echo "▶ throwaway postgres :$PG_PORT and redis :$REDIS_PORT up"

  make -s migrate seed "${OVR[@]}" >"$RUN_DIR/setup.log" 2>&1 || { tail -30 "$RUN_DIR/setup.log"; die "migrate/seed failed (log: $RUN_DIR/setup.log)"; }
  grep -E "Seeded|skipping seed" "$RUN_DIR/setup.log" | sed 's/^.*| //'

  # Own process group per server, so `down` can signal make → poetry → uvicorn / node at once.
  set -m
  nohup make dev-backend "${OVR[@]}" >"$RUN_DIR/backend.log" 2>&1 &
  echo $! >"$RUN_DIR/backend.pgid"
  # Loopback only: vite.config.ts sets host: true, which would put dev-login on the LAN.
  nohup bash -c 'cd frontend && exec yarn dev --host 127.0.0.1' >"$RUN_DIR/frontend.log" 2>&1 &
  echo $! >"$RUN_DIR/frontend.pgid"
  set +m

  wait_for 90 curl -sf http://localhost:8001/health || { tail -30 "$RUN_DIR/backend.log"; die "backend not healthy"; }
  wait_for 60 curl -sf -o /dev/null http://localhost:5173 || { tail -30 "$RUN_DIR/frontend.log"; die "frontend not serving"; }
  # Log in once through the real dev-login route; `token` reuses it (the route is rate limited).
  curl -sf -X POST http://localhost:5173/api/auth/dev-login -H 'Content-Type: application/json' \
    -d "{\"email\": \"$ADMIN_EMAIL\"}" |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])' >"$RUN_DIR/token" ||
    { tail -30 "$RUN_DIR/backend.log"; die "dev login failed"; }
  echo "✅ ready: http://localhost:5173 (api via the same origin, /api/*). Logs: $RUN_DIR/*.log"
}

cmd_status() {
  for p in 8001 5173 "$PG_PORT" "$REDIS_PORT"; do
    if listening "$p"; then echo "port $p: listening"; else echo "port $p: free"; fi
  done
  curl -sf http://localhost:8001/health && echo || echo "backend: not answering"
}

cmd_token() {
  [ -s "$RUN_DIR/token" ] || die "no run in progress: \`$SKILL_DIR/driver.sh up\` first"
  cat "$RUN_DIR/token"
}

cmd_api() {
  [ $# -ge 1 ] || die "usage: driver.sh api <path> (e.g. /api/products?limit=3)"
  curl -sS -H "Authorization: Bearer $(cmd_token)" "http://localhost:5173$1"
  echo
}

cmd_browse() {
  [ $# -ge 1 ] || die "usage: driver.sh browse <path> [--fill <label>=<text>] [--click <text>] [--wait <text>] [--goto <path>] [--shot <name>]"
  if [ ! -d "$PW_PREFIX/node_modules/playwright-core" ]; then
    echo "▶ installing playwright-core@$PW_VERSION into $PW_PREFIX (one time; drives the installed Google Chrome)"
    npm install --prefix "$PW_PREFIX" --no-audit --no-fund --silent "playwright-core@$PW_VERSION"
  fi
  TOKEN=$(cmd_token) PW_PREFIX="$PW_PREFIX" SHOTS="$RUN_DIR/shots" node "$SKILL_DIR/browse.mjs" "$@"
}

cmd_logs() { tail -n 40 "$RUN_DIR"/backend.log "$RUN_DIR"/frontend.log; }

cmd_down() {
  for f in "$RUN_DIR"/backend.pgid "$RUN_DIR"/frontend.pgid; do
    [ -f "$f" ] && { kill -TERM -"$(cat "$f")" 2>/dev/null || true; rm -f "$f"; }
  done
  # Fallback: anything still holding the ports (an orphaned uvicorn reloader or vite).
  sleep 1
  for p in 8001 5173; do lsof -ti "tcp:$p" -sTCP:LISTEN | xargs kill 2>/dev/null || true; done
  docker rm -f "$PG" "$REDIS" >/dev/null 2>&1 || true
  rm -f "$RUN_DIR/token"
  echo "✅ stopped servers, removed $PG and $REDIS"
}

case "${1:-}" in
  up | status | token | api | browse | logs | down) c=$1; shift; "cmd_$c" "$@" ;;
  *) die "usage: driver.sh up | status | token | api <path> | browse <path> [steps…] | logs | down" ;;
esac
