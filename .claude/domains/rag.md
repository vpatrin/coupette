# RAG & Recommendations

> Business context for the retrieval + recommendation pipeline. Read before touching `backend/services/sommelier.py`, `backend/services/recommendations.py`, `scraper/scraper/embed.py`, or `core/embedding_client.py`.

## Contract

- **Ingestion (scraper-owned):** `scraper/scraper/embed.py` batches product descriptions, calls embedding model via `core/embedding_client.py` (1536 dims, see `core/embedding_constants.py`), upserts to pgvector via `scraper/scraper/db/embeddings.py`.
- **Retrieval (backend-owned):** `backend/services/sommelier.py` and `backend/services/recommendations.py` query the embedding column for similarity search, combine with structured filters (region, color, price), then pass candidates to Claude Haiku for curation.

## Where things live

| Concern | File |
|---|---|
| Embedding client wrapper | `core/embedding_client.py` |
| Embedding dimension constant | `core/embedding_constants.py` |
| Batch embed CLI | `scraper/commands/embed.py` (`make embed-sync`) |
| pgvector upsert | `scraper/scraper/db/embeddings.py` |
| Retrieval + curation | `backend/services/sommelier.py` |
| Recommendation orchestration | `backend/services/recommendations.py` |
| Intent parsing (drives query) | `backend/services/intent.py` |

## ADR

See `docs/decisions/0005-*` for the RAG pipeline decision.

## Evaluation

`make eval` runs the Haiku-based intent + curation scoring harness (`backend/benchmarks/eval/`). Use after any prompt or retrieval logic change. See [`/eval-pipeline`](../commands/eval-pipeline.md) advisor for iteration workflow.

## Constraints

- 1536-dim embeddings — changing the model means re-embedding the entire catalog
- Retrieval must work for cold-start users (no behavioral signal) — relies on intent + similarity only
- Curation prompt is the highest-cost surface — measure before adding context
