# LLM

> Business context for Claude API usage. Read before editing prompts, tuning context, or adding a new LLM-backed surface.

## Model

Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — the only model in use. Chosen for cost + latency. Sommelier curation and intent parsing both run on Haiku.

## Surfaces

| Surface | File | Purpose |
|---|---|---|
| Intent parsing | `backend/services/intent.py` | Natural language → structured query (color, region, price band, food pairing) |
| Curation / recommendation | `backend/services/sommelier.py` | Rank + explain candidate wines from RAG retrieval |
| (planned / under review) | — | See `docs/decisions/` for upcoming LLM surfaces |

## Hard rule — SAQ impersonation (also in CLAUDE.md)

Never write user-facing text that implies affiliation with SAQ. Applies to system prompts, message content, error strings, anything reaching a user.

- ❌ "I'm a sommelier for the SAQ"
- ✅ "I'm a wine recommendation assistant using SAQ catalog data"

## Cost discipline

- Curation prompt is the highest-volume surface. Measure tokens before adding context.
- Use prompt caching (`anthropic` SDK supports it) for the static portions of system prompts.
- Track per-request token usage in logs.

## Evaluation

`make eval` runs intent + curation scoring. Run after any prompt change. See `/eval-pipeline` advisor.

## When to consult the AI advisor

For design decisions (new LLM surface, retrieval architecture, prompt strategy) call `/ai`. For score tuning on existing surfaces call `/eval-pipeline`.
