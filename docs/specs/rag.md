# RAG & Recommendations

> Hybrid retrieval (structured filters + pgvector) with a diversity rerank, then Claude Haiku writes the reasons. Powers the recommendation path in chat and `POST /api/recommendations`.

## Contract

What the RAG layer exposes:

| Caller | Surface | What it returns |
|---|---|---|
| Chat (`recommendation` intent) | `recommend(db, query, *, user_id, exclude_skus, conversation_history, available_online=True, in_store=None, intent)` in `backend/services/recommendations.py` | `RecommendationOut`: products + one reason each + intent + summary + `log_id` |
| HTTP | `POST /api/recommendations`, body `RecommendationIn` (`query`, `user_id`, `available_online`, `in_store`) | Same shape |

Always excludes delisted products. Default scope: **available online** (`available_online=True`). `in_store` narrows to one store when the caller passes it. Chat passes neither, so chat recommends online-available wines only.

## How it works

Extract structured filters first, then semantic search within the filtered set, then a diversity rerank, then Claude curation.

```
User: "un rouge fruité autour de 25$"
                    ↓
1. Intent (Haiku tool_use, see chat.md): categories=["Vin rouge"], price ≈ 20–30,
   semantic_query="fruité, souple, … Gamay, Grenache"
2. Embed semantic_query (text-embedding-3-large, 1536-d)
3. SQL: delisted_at IS NULL AND embedding IS NOT NULL AND price > 0
        AND category IN (...)        -- any wine category when the intent has none
        AND country / price range    -- when extracted
        AND grape NOT ILIKE <excluded grapes>
        AND sku NOT IN <already recommended in this session>
        AND online_availability IS TRUE          -- default
        AND store_availability @> '["<store>"]'  -- only with in_store
4. pgvector: ORDER BY embedding <=> query_embedding LIMIT 25 (5 × DEFAULT_RECOMMENDATION_LIMIT)
5. MMR-style rerank → 5 wines (penalizes a shared producer, taste tag, origin)
6. Claude (forced `explain` tool) writes one reason per wine + a summary
7. Write a recommendation_logs row (intent, SKUs, per-stage latency)
```

**Why hybrid:** price and category are exact constraints — vector similarity shouldn't override "$30" meaning $30. Pre-filtering shrinks the candidate set before the vector sort.

**Bilingual** — the embedding model handles FR/EN; Claude Haiku is natively bilingual.

### Embedding strategy

Composite text per product, built by `build_embedding_text()` in `scraper/scraper/embed.py`:

```
{category} | {taste_tag} | {corps}, {sucre}, {acidite}
{producer} | {grape_blend or grape} | {region}, {appellation}, {designation}, {classification}, {country} | {vintage}
Arômes: {arome}
{description}
```

`taste_tag` and the `tasting_profile` fields map to how users describe what they want ("bold and dry"). `description` provides semantic richness for occasion matching.

**Not embedded:** price, availability, rating — these go in WHERE clauses. Embedding price would conflate semantic similarity with price proximity.

**Scope:** `embed` embeds every product with non-empty text; retrieval restricts to wine categories at query time (`_WINE_PREFIXES` in `backend/repositories/recommendations.py`).

**Model:** OpenAI `text-embedding-3-large`, truncated to 1536 dims (`core/embedding_constants.py`). Catalog and query embeddings both go through `core/embedding_client.py`.

**Change detection:** `embed` compares a hash computed at sync time with `Product.last_embedded_hash`. The hash covers the model, the dimensions, and the embedded fields, but not the text template — see [`scraper.md`](scraper.md#embedding-contract-with-ragmd).

### Claude integration

**Pattern: RAG context injection** — retrieve the wines, inject them as structured text, Claude writes the explanation. The prompt and the wine line format live in `backend/services/curation.py`: the system prompt sets the rules (answer in the user's language, one specific sentence per wine, a 1–2 sentence summary), and the user message carries the history, the query, and one line per wine (name, grape, region, country, price, taste tag).

Claude selects nothing: it explains the 5 wines retrieval picked. Reasons map to products by position; a short or long list is padded or truncated to match.

**Failure behavior:** no API key or a Claude API error → the products come back with empty reasons and an empty summary. An embedding (OpenAI) error is re-raised and the request fails.

## Files

| Concern | Where |
|---|---|
| Recommendation orchestration | `backend/services/recommendations.py` |
| Retrieval query + rerank (read end to end before changing retrieval) | `backend/repositories/recommendations.py` |
| Curation prompt | `backend/services/curation.py` |
| Embedding client + dimension | `core/embedding_client.py`, `core/embedding_constants.py` |
| Embedding text + change hash (scraper side) | `scraper/scraper/embed.py` |
| Eval framework | `backend/benchmarks/eval/` (levers: `backend/benchmarks/eval/levers.md`; data: `backend/benchmarks/eval/data/{queries,rubric}.json`) |

## Dependencies

- **pgvector extension** in PostgreSQL — vector storage + similarity ops
- **OpenAI `text-embedding-3-large`** (1536-d) — embedding model for catalog and queries
- **Claude Haiku 4.5** — intent (see [`chat.md`](chat.md)) and curation
- **Scraper-owned ingestion** — `python -m scraper embed` writes embeddings; the backend only reads

## Cross-cutting concerns

- **Auth:** `POST /api/recommendations` sits behind the global `verify_auth` (JWT or bot secret)
- **Logging:** one `recommendation_logs` row per call (intent, returned SKUs, per-stage `latency_ms`); loguru for warnings and errors
- **Errors:** see Failure behavior above; the pipeline counts failures in `recommendation_pipeline_errors`
- **Observability:** Prometheus — `recommendation_duration`, `recommendation_candidates`, `llm_call_duration`, `llm_tokens`, `llm_errors`, `intent_classifications`, `recommendation_pipeline_errors`
- **Rate limiting:** SlowAPI `RATE_LIMIT_LLM` (20/min) on `POST /api/recommendations`
- **Cost:** ~$0.002 per recommendation call at Haiku pricing (estimate). No budget cap or spend alert exists

### Token budget

Curation input = system prompt + up to 10 history messages + the query + 5 wine lines; output capped at `max_tokens=512` (intent: 256). Measure before adding context ([`.claude/rules/rag.md`](../../.claude/rules/rag.md) hard rule 4); `llm_tokens` counts real usage.

### Memory footprint

~38k products × 1536 dims × 4 bytes ≈ **~235 MB** in pgvector. Well within the 4GB VPS budget.

## Operational notes

**Env vars:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (for query embeddings), `HAIKU_TEMPERATURE`

**Embedding lifecycle:**
- Production: systemd runs `scrape` → `enrich` → `embed` weekly (see [`scraper.md`](scraper.md)); `availability` does NOT touch embeddings
- Local: `make embed-sync` after a scrape (the synthetic seed has no embeddings)
- Re-embed all: change the embedding model or dimensions (`core/embedding_constants.py`) → every hash changes → full recompute on the next `embed` (~30 min). Editing the text template alone re-embeds nothing

**Hard rules** (SAQ impersonation, re-embedding cost, prompt caching, token discipline, eval gate): [`.claude/rules/rag.md`](../../.claude/rules/rag.md).

**Eval framework** — see `backend/benchmarks/eval/`. LLM-as-judge (Sonnet scores Haiku's output against the rubric):
- 19 benchmark queries: 13 train (the default split) + 6 holdout
- 5 weighted scoring dimensions, judge scores 1–5 per dimension
- Per-query + weighted averages + diff vs previous run
- `make eval` runs `recommend()` end to end with `available_online=False`, so it scores a wider candidate pool than chat uses
- Iterate via `/eval-pipeline` skill (one lever at a time, holdout validation, no overfit)

**Scope constraints:**
- **Wine-scoped** — retrieval only returns wine categories (vin, champagne/mousseux, porto/fortifié, saké)
- **Montreal MVP** — in-store availability for Montreal stores only
- **Bilingual** — FR/EN handled natively by embedding model + Claude

## Related

- **ADRs:** [`0005-rag-pipeline.md`](../adrs/0005-rag-pipeline.md), [`0007-sommelier-memory-architecture.md`](../adrs/0007-sommelier-memory-architecture.md)
- **Agent rules (imperative form):** [`.claude/rules/rag.md`](../../.claude/rules/rag.md), [`.claude/rules/llm.md`](../../.claude/rules/llm.md)
- **Related specs:** [`chat.md`](chat.md) (the consumer), [`scraper.md`](scraper.md) (the ingestion path)
- **Eval iteration skill:** [`/eval-pipeline`](../../.claude/skills/eval-pipeline/SKILL.md)
- **Recent session logs:** look up via [`../session-logs/INDEX.md`](../session-logs/INDEX.md)
