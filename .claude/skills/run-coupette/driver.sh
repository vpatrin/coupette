#!/usr/bin/env bash
# Coupette run driver: the full stack (backend + frontend) on this worktree's throwaway
# Postgres and Redis from exp-docker, seeded with the synthetic catalog. Ports derive from
# the exp-docker slot (ops/CONTRACTS.md §3), so worktrees run side by side and never take
# main's 8001 / 5173. No docker calls: the crew's sandbox blocks the Docker socket.
#
#   driver.sh up | status | token | api <METHOD> <path> [json] | browse <path> [steps…] | logs | down
set -euo pipefail

TOP=$(git rev-parse --show-toplevel)
cd "$TOP"
SKILL_DIR=.claude/skills/run-coupette
EXP_DOCKER="$HOME/.agent-harness/bin/exp-docker"
# One run dir per worktree; the id matches exp-docker's container names.
RUN_ID=$(printf %s "$TOP" | shasum -a 256 | cut -c1-8)
RUN_DIR="${COUPETTE_RUN_DIR:-$HOME/.cache/coupette-run/runs/$RUN_ID}"
ADMIN_EMAIL=dev-admin@coupette.test
PW_VERSION=1.63.0
PW_PREFIX="$HOME/.cache/coupette-run/node"

die() { echo "❌ $*" >&2; exit 1; }
listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# Protocol probes, not a bare connect: Docker's port proxy accepts before the server inside
# listens, and the pgvector init server answers on its Unix socket only, then restarts.
pg_ready() { # SSLRequest: a live Postgres answers one byte, S or N
  python3 - "$1" 2>/dev/null <<'PY'
import socket, struct, sys
with socket.create_connection(("127.0.0.1", int(sys.argv[1])), timeout=2) as s:
    s.sendall(struct.pack("!ii", 8, 80877103))
    sys.exit(s.recv(1) not in (b"S", b"N"))
PY
}
redis_ready() {
  python3 - "$1" 2>/dev/null <<'PY'
import socket, sys
with socket.create_connection(("127.0.0.1", int(sys.argv[1])), timeout=2) as s:
    s.sendall(b"PING\r\n")
    sys.exit(not s.recv(16).startswith(b"+PONG"))
PY
}

# KEY=VALUE lines from exp-docker: known keys only, never sourced.
load_env() { # <file>
  local key value
  while IFS='=' read -r key value; do
    case "$key" in
      DB_HOST | DB_PORT | DB_USER | DB_PASSWORD | DB_NAME | REDIS_URL) printf -v "$key" '%s' "$value" ;;
    esac
  done <"$1"
}

# Slot n = (DB_PORT - 5434) / 10; backend 8101 + 10n, frontend 5273 + 10n.
slot_ports() {
  [[ "${DB_PORT:-}" =~ ^[0-9]+$ ]] && [ "$DB_PORT" -ge 5434 ] && [ $(((DB_PORT - 5434) % 10)) -eq 0 ] ||
    die "DB_PORT '${DB_PORT:-}' is not an exp-docker slot port (5434 + 10n)"
  SLOT=$(((DB_PORT - 5434) / 10))
  BACKEND_PORT=$((8101 + 10 * SLOT))
  FRONTEND_PORT=$((5273 + 10 * SLOT))
  REDIS_PORT=${REDIS_URL:?REDIS_URL missing}
  REDIS_PORT=${REDIS_PORT##*:}
  REDIS_PORT=${REDIS_PORT%%/*}
}

need_run() {
  [ -s "$RUN_DIR/env" ] || die "no run in progress: \`$SKILL_DIR/driver.sh up\` first"
  load_env "$RUN_DIR/env"
  slot_ports
}

# Make command-line overrides beat the root .env and .env.local that the Makefile includes
# and exports. Plain env vars would lose: `-include .env` reassigns them inside make.
overrides() {
  OVR=(
    "DB_HOST=$DB_HOST" "DB_PORT=$DB_PORT" "DB_USER=$DB_USER" "DB_PASSWORD=$DB_PASSWORD" "DB_NAME=$DB_NAME"
    DATABASE_URL= "REDIS_URL=$REDIS_URL" ENVIRONMENT=development "BACKEND_PORT=$BACKEND_PORT"
    "ADMIN_EMAIL=$ADMIN_EMAIL" "JWT_SECRET_KEY=$(cat "$RUN_DIR/jwt.key")"
    # Dev login is opt-in (off in the root .env); FRONTEND_URL beats the .env's tunnel URL.
    DEV_LOGIN_ENABLED=true "FRONTEND_URL=http://localhost:$FRONTEND_PORT"
    # A dev-login admin can approve waitlist entries, which sends mail: no email key here.
    RESEND_API_KEY=
  )
}

wait_for() { # <seconds> <command…>
  local secs=$1
  shift
  for _ in $(seq 1 "$secs"); do "$@" >/dev/null 2>&1 && return 0; sleep 1; done
  return 1
}

cmd_up() {
  [ -s "$RUN_DIR/backend.pgid" ] && die "a run is in progress here: \`$SKILL_DIR/driver.sh down\` first"
  mkdir -p "$RUN_DIR/shots"
  # A sandboxed process can't reach Docker, so the DB comes from `exp-docker db up`, run as its
  # own command before this one; it writes .env.local (ops/CONTRACTS.md §2).
  [ -s .env.local ] || die "no .env.local: run \`$EXP_DOCKER db up\` as its own command, then \`$SKILL_DIR/driver.sh up\`"
  grep -E '^(DB_|REDIS_URL=)' .env.local >"$RUN_DIR/db.env"
  load_env "$RUN_DIR/db.env"
  slot_ports
  for p in "$BACKEND_PORT" "$FRONTEND_PORT"; do
    listening "$p" && die "port $p is busy (slot $SLOT): stop whatever holds it"
  done
  wait_for 60 pg_ready "$DB_PORT" || die "throwaway postgres :$DB_PORT never became ready"
  wait_for 30 redis_ready "$REDIS_PORT" || die "throwaway redis :$REDIS_PORT never became ready"
  echo "▶ throwaway postgres :$DB_PORT and redis :$REDIS_PORT ready (slot $SLOT)"
  cp "$RUN_DIR/db.env" "$RUN_DIR/env"
  # Per-run signing key, kept outside the repo.
  python3 -c 'import secrets; print(secrets.token_urlsafe(32))' >"$RUN_DIR/jwt.key"
  overrides

  make -s migrate seed embed-sync "${OVR[@]}" >"$RUN_DIR/setup.log" 2>&1 || { tail -30 "$RUN_DIR/setup.log"; die "migrate/seed/embed failed (log: $RUN_DIR/setup.log)"; }
  grep -E "Seeded|skipping seed" "$RUN_DIR/setup.log" | sed 's/^.*| //'

  # Own process group per server, so `down` can signal make → poetry → uvicorn / node at once.
  set -m
  nohup make dev-backend "${OVR[@]}" >"$RUN_DIR/backend.log" 2>&1 &
  echo $! >"$RUN_DIR/backend.pgid"
  # Loopback only: vite.config.ts sets host: true, which would put dev-login on the LAN.
  # --strictPort: fail rather than drift onto another worktree's port.
  nohup env "BACKEND_PORT=$BACKEND_PORT" "FRONTEND_PORT=$FRONTEND_PORT" \
    bash -c 'cd frontend && exec yarn dev --host 127.0.0.1 --strictPort' >"$RUN_DIR/frontend.log" 2>&1 &
  echo $! >"$RUN_DIR/frontend.pgid"
  set +m

  wait_for 90 curl -sf "http://127.0.0.1:$BACKEND_PORT/health" || { tail -30 "$RUN_DIR/backend.log"; die "backend not healthy"; }
  wait_for 60 curl -sf -o /dev/null "http://localhost:$FRONTEND_PORT" || { tail -30 "$RUN_DIR/frontend.log"; die "frontend not serving"; }
  # Log in once through the real dev-login route; `token` reuses it (the route is rate limited).
  curl -sf -X POST "http://localhost:$FRONTEND_PORT/api/auth/dev-login" -H 'Content-Type: application/json' \
    -d "{\"email\": \"$ADMIN_EMAIL\"}" |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])' >"$RUN_DIR/token" ||
    { tail -30 "$RUN_DIR/backend.log"; die "dev login failed"; }
  echo "✅ ready: frontend http://localhost:$FRONTEND_PORT · backend http://127.0.0.1:$BACKEND_PORT · logs $RUN_DIR/*.log"
}

cmd_status() {
  [ -s "$RUN_DIR/env" ] || { echo "no run in progress (run dir $RUN_DIR)"; return 0; }
  need_run
  echo "slot $SLOT, run dir $RUN_DIR"
  for p in "$BACKEND_PORT" "$FRONTEND_PORT" "$DB_PORT" "$REDIS_PORT"; do
    if listening "$p"; then echo "port $p: listening"; else echo "port $p: free"; fi
  done
  curl -sf "http://127.0.0.1:$BACKEND_PORT/health" && echo || echo "backend: not answering"
}

cmd_token() {
  [ -s "$RUN_DIR/token" ] || die "no run in progress: \`$SKILL_DIR/driver.sh up\` first"
  cat "$RUN_DIR/token"
}

cmd_api() {
  [ $# -ge 2 ] && [[ "$1" =~ ^(GET|POST|PUT|PATCH|DELETE)$ ]] && [[ "$2" == /* ]] ||
    die "usage: driver.sh api <GET|POST|PUT|PATCH|DELETE> <path> [json] (e.g. api GET '/api/products?limit=3')"
  need_run
  local code token args
  token=$(cmd_token)
  args=(-sS -o "$RUN_DIR/api.body" -w '%{http_code}' -X "$1" -H "Authorization: Bearer $token")
  if [ $# -ge 3 ]; then args+=(-H 'Content-Type: application/json' --data-raw "$3"); fi
  code=$(curl "${args[@]}" "http://127.0.0.1:$BACKEND_PORT$2") || die "backend not answering on :$BACKEND_PORT"
  echo "HTTP $code"
  cat "$RUN_DIR/api.body"
  echo
}

cmd_browse() {
  [ $# -ge 1 ] || die "usage: driver.sh browse <path> [--fill <label>=<text>] [--click <text>] [--wait <text>] [--goto <path>] [--shot <name>]"
  need_run
  if [ ! -d "$PW_PREFIX/node_modules/playwright-core" ]; then
    echo "▶ installing playwright-core@$PW_VERSION into $PW_PREFIX (one time; drives the installed Google Chrome)"
    npm install --prefix "$PW_PREFIX" --no-audit --no-fund --silent "playwright-core@$PW_VERSION"
  fi
  local token
  token=$(cmd_token)
  TOKEN=$token PW_PREFIX="$PW_PREFIX" SHOTS="$RUN_DIR/shots" BASE_URL="http://localhost:$FRONTEND_PORT" \
    node "$SKILL_DIR/browse.mjs" "$@"
}

cmd_logs() { tail -n 40 "$RUN_DIR"/backend.log "$RUN_DIR"/frontend.log; }

cmd_down() {
  for f in "$RUN_DIR"/backend.pgid "$RUN_DIR"/frontend.pgid; do
    [ -f "$f" ] && { kill -TERM -"$(cat "$f")" 2>/dev/null || true; rm -f "$f"; }
  done
  if [ -s "$RUN_DIR/env" ]; then
    need_run
    # Fallback: anything still holding this run's ports (an orphaned uvicorn reloader or vite).
    sleep 1
    for p in "$BACKEND_PORT" "$FRONTEND_PORT"; do lsof -ti "tcp:$p" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true; done
  fi
  rm -f "$RUN_DIR/token" "$RUN_DIR/env"
  echo "✅ stopped the servers. Postgres and Redis keep running: \`$EXP_DOCKER db down\` as its own command removes them."
}

case "${1:-}" in
  up | status | token | api | browse | logs | down) c=$1; shift; "cmd_$c" "$@" ;;
  *) die "usage: driver.sh up | status | token | api <METHOD> <path> [json] | browse <path> [steps…] | logs | down" ;;
esac
