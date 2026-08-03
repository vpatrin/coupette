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
- **Retrieval (backend-owned):** `backend/services/sommelier.py` + `backend/services/recommendations.py` query the embedding column for similarity search, combine with structured filters (region, color, price), pass candidates to Claude Haiku for curation.

## Where things live

| Concern | File |
|---|---|
| Embedding client wrapper | `core/embedding_client.py` |
| Embedding dim constant | `core/embedding_constants.py` |
| Batch embed CLI | `scraper/scraper/commands/embed.py` (`make embed-sync`) |
| pgvector upsert | `scraper/scraper/db/embeddings.py` |
| Retrieval + curation | `backend/services/sommelier.py` |
| Recommendation orchestration | `backend/services/recommendations.py` |
| Intent parsing | `backend/services/intent.py` |

## Hard rules

1. **No SAQ impersonation** in any prompt (also in CLAUDE.md).
2. **Embedding-dim change = catalog-wide re-embedding cost.** Surface the cost (catalog size × cost per embedding) before changing `core/embedding_constants.py` or the embedding model. Wait for explicit go-ahead.
3. **Prompt-caching the static portion.** New system prompts of substance use Anthropic SDK cache control on the static portions.
4. **Token discipline.** Curation is the highest-volume surface. Measure tokens before adding context. Report deltas.

## Eval gate

Changes to: prompts (intent, sommelier, curation) · retrieval logic (similarity threshold, top-k, reranking) · embedding pipeline → require `make eval` + score comparison vs baseline before merge. Use `/eval-pipeline` for iteration.

Refactors / type fixes / log changes → eval gate waived. State so explicitly.

## ADR + constraints

- `docs/adrs/0005-*` — RAG pipeline decision
- 1536-dim embeddings — changing the model means re-embedding the entire catalog
- Retrieval must work for cold-start users (no behavioral signal) — relies on intent + similarity only
