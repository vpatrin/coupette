#!/usr/bin/env bash
# Tier 1 baseline — establishes latency baselines at minimal load (1 VU).
# Runs all scenarios sequentially, saves raw JSON results.
#
# Usage:
#   ./backend/benchmarks/load/runners/tier1-baseline.sh
#   ./backend/benchmarks/load/runners/tier1-baseline.sh --skip-chat
#   ./backend/benchmarks/load/runners/tier1-baseline.sh --virtual-users 5
#
# JWT: loaded from root .env (K6_JWT=...).
#      Tokens expire every 7 days — refresh from DevTools → Local Storage → access_token.
#
# Results: backend/benchmarks/load/results/tier1-<tag-or-hash>-<datetime>/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOAD_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
RESULTS_BASE="${LOAD_DIR}/results"

# Load only K6_* vars from root .env (avoid leaking app secrets into k6's environment)
ENV_FILE="${REPO_ROOT}/.env"
if [ -f "${ENV_FILE}" ]; then
  while IFS='=' read -r key value; do
    export "$key=$value"
  done < <(grep '^K6_' "${ENV_FILE}" | sed 's/#.*//' | grep -v '^\s*$')
fi

# Identify current version: tag if on a tagged commit, otherwise short hash
TAG=$(git describe --tags --exact-match 2>/dev/null || true)
HASH=$(git rev-parse --short HEAD)
REF="${TAG:-${HASH}}"
DATETIME=$(date +%Y-%m-%d-%H%M)
RUN_DIR="${RESULTS_BASE}/tier1-${REF}-${DATETIME}"

SKIP_CHAT=false
VUS=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-chat) SKIP_CHAT=true; shift ;;
    --virtual-users) VUS="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# Validate JWT for authenticated scenarios
if [ -z "${K6_JWT:-}" ]; then
  echo "Error: K6_JWT not set."
  echo "Add it to ${ENV_FILE}:"
  echo "  K6_JWT=eyJhbG..."
  echo "(Grab from DevTools → Application → Local Storage → access_token)"
  exit 1
fi

# Warn if working tree is dirty — baseline may not match the commit
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  echo "WARNING: uncommitted changes — baseline may not reflect commit ${REF}"
  echo ""
fi

mkdir -p "${RUN_DIR}"

echo "=== Tier 1 Baseline ==="
echo "Ref:     ${REF}"
echo "Date:    ${DATETIME}"
echo "VUs:     ${VUS}"
echo "Output:  ${RUN_DIR}"
echo ""

# Duration-based scenarios
SCENARIOS=(search stores watches)
STEP=0
TOTAL=$(( ${#SCENARIOS[@]} + 1 ))

for scenario in "${SCENARIOS[@]}"; do
  STEP=$((STEP + 1))
  echo "[${STEP}/${TOTAL}] ${scenario} (${VUS} VU, 30s)..."
  k6 run --vus "${VUS}" --duration 30s \
    --out "json=${RUN_DIR}/${scenario}.json" \
    --summary-export="${RUN_DIR}/${scenario}-summary.json" \
    "${LOAD_DIR}/${scenario}.js"
  echo ""
done

# Chat — LLM-bound, fixed iterations to control cost
STEP=$((STEP + 1))
if [ "$SKIP_CHAT" = true ]; then
  echo "[${STEP}/${TOTAL}] chat — SKIPPED (--skip-chat)"
else
  echo "[${STEP}/${TOTAL}] chat (${VUS} VU, 3 iterations, ~\$0.03)..."
  k6 run --vus "${VUS}" --iterations 3 \
    --out "json=${RUN_DIR}/chat.json" \
    --summary-export="${RUN_DIR}/chat-summary.json" \
    "${LOAD_DIR}/chat.js"
fi

echo ""
echo "=== Done ==="
echo "Results: ${RUN_DIR}"
echo "Summary files: *-summary.json (k6 built-in export)"
