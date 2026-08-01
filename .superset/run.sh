#!/usr/bin/env bash
# Dev servers — backend (8001) + frontend (5173). Ctrl-C stops both.
set -euo pipefail

cd "$(dirname "$0")/.."

#! Ports are fixed, not per-workspace: .env sets BACKEND_URL=http://localhost:8001
#! and the Google/GitHub OAuth redirect URIs are registered against it.
#! Only one workspace can run the app at a time.

#! The bot is not started here — two instances polling the same
#! TELEGRAM_BOT_TOKEN make Telegram return 409. Start it manually: make dev-bot

# `set -m` puts each background job in its own process group, so killing the
# group reaches the grandchildren (make -> poetry -> uvicorn / node). Without it
# the script shares the caller's process group and would signal Superset itself.
set -m
pids=()
trap 'trap - EXIT; for p in "${pids[@]}"; do kill -TERM -"$p" 2>/dev/null || true; done' EXIT INT TERM

make dev-backend & pids+=($!)
make dev-frontend & pids+=($!)
wait
