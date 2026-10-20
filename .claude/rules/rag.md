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

> Read whenever touching retrieval, embeddings, curation, or recommendation prompts. Prompt, retrieval, and embedding changes are the **risky lane** (`rules/linear.md` → Lane).

Pipeline contract, file map, token budget, degradation cascade: [`docs/specs/rag.md`](../../docs/specs/rag.md). ADR: `docs/adrs/0005-*`. Before changing retrieval, read `backend/repositories/recommendations.py` end to end — it holds both the pgvector query and the rerank.

## Hard rules

1. **No SAQ impersonation** in any prompt (also in CLAUDE.md).
2. **Embedding model or dimension change = catalog-wide re-embedding cost.** Surface the cost (catalog size × cost per embedding) before changing `core/embedding_constants.py` or the embedding model. Wait for explicit go-ahead.
3. **Prompt-caching the static portion.** Add `cache_control` once a prompt's static prefix (tools + system) exceeds the model's minimum cacheable length (4096 tokens on Haiku 4.5) — below it the marker is a silent no-op. Confirm with `usage.cache_read_input_tokens`.
4. **Token discipline.** Intent parsing is the highest-volume surface (every chat message, largest prompt). Measure tokens before adding context. Report the delta in the commit body.
5. **Cold start.** Retrieval must work for users with no behavioral signal — intent + similarity only.

## Eval gate

Changes to: prompts (intent, sommelier, curation) · retrieval logic (similarity threshold, top-k, reranking) · embedding pipeline → require `make eval` + score comparison vs baseline before merge; the scores go in the PR's evidence table. Use `/eval-pipeline` for iteration.

Refactors / type fixes / log changes → eval gate waived. State so explicitly.
