---
paths:
  - "backend/services/sommelier.py"
  - "backend/services/intent.py"
  - "backend/services/recommendations.py"
  - "backend/services/curation.py"
---

# LLM (Claude API usage)

> Read whenever editing prompts, tuning context, or adding a new LLM-backed surface.

## Model

Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) for all runtime surfaces. Chosen for cost + latency. The eval judge (`backend/benchmarks/eval/judge.py`) pins its own model separately — not a runtime surface.

## Surfaces

| Surface | File | Purpose |
|---|---|---|
| Intent parsing | `backend/services/intent.py` | NL → structured query (color, region, price, food pairing) |
| Sommelier | `backend/services/sommelier.py` | Freeform wine Q&A (`wine_chat` intent) — no retrieval, no product names |
| Curation | `backend/services/curation.py` | Per-wine reasons + summary for a retrieved recommendation set |

## Hard rule — SAQ impersonation (also in CLAUDE.md)

Never write user-facing text implying affiliation with SAQ. Applies to system prompts, message content, error strings — anything reaching a user.

- ❌ "I'm a sommelier for the SAQ"
- ✅ "I'm a wine recommendation assistant using SAQ catalog data"

## Cost discipline

- Intent parsing is the highest-volume surface: it runs on every chat message and carries the largest prompt. Measure tokens before adding context to any prompt.
- Prompt caching only works once the static prefix (tools + system) exceeds the model's minimum cacheable length — 4096 tokens on Haiku 4.5; today's prompts are below it. Add `cache_control` when a prompt crosses that line and confirm `usage.cache_read_input_tokens` > 0.
- Track per-request token usage in logs.

## Evaluation

`make eval` runs intent + curation scoring. Run after any prompt change. See `/eval-pipeline` skill.

## When to use `/review ai` vs `/eval-pipeline`

- `/review ai` for design review (new LLM surface, retrieval architecture, prompt strategy)
- `/eval-pipeline` for score tuning on existing surfaces
