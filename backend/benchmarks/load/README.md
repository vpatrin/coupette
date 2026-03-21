# Load Tests

k6 scripts for load testing Coupette API endpoints against production. Results feed into [benchmarks/](../../../benchmarks/) for trend analysis.

## Prerequisites

```bash
brew install k6
```

## Auth setup

Chat, watch, and store tests need a valid JWT. Add `K6_JWT` to the root `.env` file (gitignored):

```bash
K6_JWT=eyJhbG...
K6_BASE_URL=https://coupette.club  # optional, this is the default
```

Grab the token from DevTools → Application → Local Storage → `access_token`. Tokens expire every 7 days — refresh when tests start returning 401s.

## Scenarios

| Script | Auth | LLM calls | Safe at high VUs | What it tests |
| ------ | ---- | --------- | ---------------- | ------------- |
| `search.js` | No | No | Yes | DB query performance, filters, facets |
| `watches.js` | JWT | No | Yes | Authenticated watch CRUD, DB writes |
| `stores.js` | JWT | No | Yes | Geolocation queries, store preference CRUD |
| `chat.js` | JWT | Yes | **No** — 1-2 VUs only | Full pipeline: intent → embed → retrieve → curate |
| `mixed-workload.js` | JWT | Yes (10%) | Careful | Realistic traffic mix, break-point finder |

## Tier runner scripts

Automated runners that execute all scenarios for a given tier and save timestamped results.

```bash
# Tier 1 baseline — all 4 scenarios at 1 VU
./backend/benchmarks/load/runners/tier1-baseline.sh

# Skip chat to save Claude credits
./backend/benchmarks/load/runners/tier1-baseline.sh --skip-chat
```

Results land in `results/tier1-<ref>-<datetime>/` with per-scenario JSON + summary exports.

## Running individual scripts

```bash
# Single scenario — requires K6_JWT in shell env (tier runners handle this automatically)
k6 run --vus 1 --duration 30s backend/benchmarks/load/search.js

# Ramp to find break point
k6 run --stage 30s:5,1m:20,1m:50,30s:5 backend/benchmarks/load/search.js

# Chat: low VU, fixed iterations (cost control)
k6 run --vus 1 --iterations 3 backend/benchmarks/load/chat.js
```

## Results

All results go in `results/` (gitignored). Tier scripts create subdirectories named `tier<N>-<ref>-<datetime>/`.

Raw results are local artifacts. Analysis and findings go in [benchmarks/](../../../benchmarks/).

## Watch test SKUs

The `watches.js` script uses hardcoded SKUs. If they go stale (delisted), replace with current ones:

```bash
curl -s https://coupette.club/api/products?limit=3 | jq '.items[].sku'
```

## Cost awareness

Each chat iteration costs ~$0.01 in Claude API credits. Do not run `chat.js` or `mixed-workload.js` at high VUs without a cost cap in mind.
