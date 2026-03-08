#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Env diff (.env.example vs .env):"
diff -u .env.example .env || true

echo "==> Building images..."
make build

echo "==> Running migrations..."
docker compose run --rm migrate

echo "==> Restarting services..."
docker compose up -d backend bot

echo "==> Health check..."
sleep 3
if curl -sf localhost:8001/health > /dev/null; then
  echo "OK: backend healthy"
else
  echo "ERROR: health check failed"
  exit 1
fi

echo "==> Deploy complete"
