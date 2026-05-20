---
paths:
  - "backend/services/sommelier.py"
  - "backend/services/intent.py"
  - "backend/services/recommendations.py"
---

# LLM (Claude API usage)

> Read whenever editing prompts, tuning context, or adding a new LLM-backed surface.

## Model

Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — the only model in use. Chosen for cost + latency.

## Surfaces

| Surface | File | Purpose |
|---|---|---|
| Intent parsing | `backend/services/intent.py` | NL → structured query (color, region, price, food pairing) |
| Curation / recommendation | `backend/services/sommelier.py` | Rank + explain candidate wines from RAG retrieval |

## Hard rule — SAQ impersonation (also in CLAUDE.md)

Never write user-facing text implying affiliation with SAQ. Applies to system prompts, message content, error strings — anything reaching a user.

- ❌ "I'm a sommelier for the SAQ"
- ✅ "I'm a wine recommendation assistant using SAQ catalog data"

## Cost discipline

- Curation prompt is the highest-volume surface. Measure tokens before adding context.
- Use prompt caching (`anthropic` SDK) for the static portions of system prompts.
- Track per-request token usage in logs.

## Evaluation

`make eval` runs intent + curation scoring. Run after any prompt change. See `/eval-pipeline` skill.

## When to consult `/ai` vs `/eval-pipeline`

- `/ai` for design decisions (new LLM surface, retrieval architecture, prompt strategy)
- `/eval-pipeline` for score tuning on existing surfaces
