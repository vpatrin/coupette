---
paths:
  - "backend/services/sommelier.py"
  - "backend/services/recommendations.py"
  - "backend/services/intent.py"
  - "backend/repositories/recommendations.py"
  - "scraper/scraper/embed.py"
  - "scraper/scraper/db/embeddings.py"
  - "core/embedding_client.py"
  - "core/embedding_constants.py"
---

# RAG / Recommendations (auto-loaded)

Full context: [`domains/rag.md`](../domains/rag.md), [`domains/llm.md`](../domains/llm.md), `docs/decisions/0005-*`.

## Hard rules

1. **No SAQ impersonation in any prompt.** Applies to system prompts, message content, error strings — every user-reachable surface. ❌ "I'm a sommelier for the SAQ" ✅ "I'm a wine recommendation assistant using SAQ catalog data".
2. **Embedding-dim change = catalog-wide re-embedding.** Surface the cost (catalog size × cost per embedding) before changing `core/embedding_constants.py` or the embedding model. Wait for Victor's go-ahead.
3. **Prompt-caching the static portion.** Any new system prompt of substance uses Anthropic SDK cache control on the static portions.
4. **Token discipline.** Curation prompt is the highest-volume surface. Measure tokens before adding context. Report deltas.

## Eval gate

Any change to:
- Prompts (intent, sommelier, curation)
- Retrieval logic (similarity threshold, top-k, reranking)
- Embedding pipeline

Requires `make eval` and score comparison vs baseline before merge. Use `/eval-pipeline` for iteration.

## Non-prompt, non-retrieval changes (refactor, type fix, log)

Eval gate is waived. State so explicitly.
