---
paths:
  - "backend/services/sommelier.py"
  - "backend/services/recommendations.py"
  - "backend/services/intent.py"
  - "backend/services/curation.py"
  - "backend/repositories/recommendations.py"
  - "scraper/scraper/embed.py"
  - "scraper/scraper/db/embeddings.py"
  - "core/embedding_client.py"
  - "core/embedding_constants.py"
---

# RAG & Recommendations

> Read whenever touching retrieval, embeddings, curation, or recommendation prompts.

## Contract (cross-service)

- **Ingestion (scraper-owned):** `scraper/scraper/embed.py` batches product descriptions, calls embedding model via `core/embedding_client.py` (1536 dims, see `core/embedding_constants.py`), upserts to pgvector via `scraper/scraper/db/embeddings.py`.
- **Retrieval (backend-owned):** `backend/services/recommendations.py` + `backend/repositories/recommendations.py` query the embedding column for similarity search, combine with structured filters (region, color, price), pass candidates to Claude Haiku for curation.

## Where things live

| Concern | File |
|---|---|
| Embedding client wrapper | `core/embedding_client.py` |
| Embedding dim constant | `core/embedding_constants.py` |
| Batch embed CLI | `scraper/scraper/commands/embed.py` (`make embed-sync`) |
| pgvector upsert | `scraper/scraper/db/embeddings.py` |
| Retrieval (pgvector query + rerank) | `backend/repositories/recommendations.py` |
| Curation (LLM reasons + summary) | `backend/services/curation.py` |
| Freeform wine chat | `backend/services/sommelier.py` |
| Recommendation orchestration | `backend/services/recommendations.py` |
| Intent parsing | `backend/services/intent.py` |

## Hard rules

1. **No SAQ impersonation** in any prompt (also in CLAUDE.md).
2. **Embedding-dim change = catalog-wide re-embedding cost.** Surface the cost (catalog size × cost per embedding) before changing `core/embedding_constants.py` or the embedding model. Wait for explicit go-ahead.
3. **Prompt-caching the static portion.** Add `cache_control` once a prompt's static prefix (tools + system) exceeds the model's minimum cacheable length (4096 tokens on Haiku 4.5) — below it the marker is a silent no-op. Confirm with `usage.cache_read_input_tokens`.
4. **Token discipline.** Intent parsing is the highest-volume surface (every chat message, largest prompt). Measure tokens before adding context. Report deltas.

## Eval gate

Changes to: prompts (intent, sommelier, curation) · retrieval logic (similarity threshold, top-k, reranking) · embedding pipeline → require `make eval` + score comparison vs baseline before merge. Use `/eval-pipeline` for iteration.

Refactors / type fixes / log changes → eval gate waived. State so explicitly.

## ADR + constraints

- `docs/adrs/0005-*` — RAG pipeline decision
- 1536-dim embeddings — changing the model means re-embedding the entire catalog
- Retrieval must work for cold-start users (no behavioral signal) — relies on intent + similarity only
