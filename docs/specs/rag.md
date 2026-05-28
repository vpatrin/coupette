# RAG & Recommendations

> Hybrid retrieval (pgvector + structured filters) + Claude Haiku curation over ~30.9k SAQ wine products. Powers the recommendation path in chat and the planned new-arrivals digest.

## Contract

What the RAG layer exposes:

| Caller | Surface | What it returns |
|---|---|---|
| `chat.py` (recommendation intent) | `recommendations_service.recommend(...)` | `RecommendationOut`: products + per-product reasons + intent + summary |
| Bot `/recommend` (planned) | `GET /api/recommendations` | Same shape |
| New-arrivals digest (planned) | `recommendations_service.curate_arrivals(...)` | LLM-grouped product summaries |

Always returns **available wines only** — delisted products are filtered. Default scope: "available somewhere" (online OR in stores). For users with a preferred store: filtered to wines available at that store.

## How it works

Hybrid retrieval: extract structured filters first, then semantic search within the filtered set, then Claude curation.

```
User: "un rouge fruité autour de 25$"
                    ↓
1. Parse intent: category=rouge, price_max=30 (buffer above "25$"), available=true
2. SQL: WHERE category = 'Vin rouge' AND price <= 30
         AND delisted_at IS NULL
         AND (online_availability = true
              OR store_availability IS NOT NULL)
         AND (user has preferred store?
              → store_availability @> '["23101"]')
3. pgvector: ORDER BY embedding <=> query_embedding LIMIT 10
4. Pass top 10 candidates with full attributes to Claude
5. Claude selects 3-5 picks with reasoning
```

**Why hybrid:** Price and category are exact constraints — vector similarity shouldn't override "$30" meaning $30. Pre-filtering reduces candidates from ~30.9k wine products to hundreds.

**Top-k = 10.** Enough diversity for Claude without bloating the prompt.

**Bilingual** — embedding model handles FR/EN; Claude Haiku is natively bilingual.

### Data available

**From `products` table (~30.9k wine products):** `name`, `description` (FR marketing text), `category`, `grape`, `region`, `appellation`, `country`, `producer`, `price`, `alcohol`, `sugar`, `rating`, `review_count`, `classification`, `designation`, `online_availability`, `store_availability`. Only wine products are embedded (vin + champagne/mousseux + porto/fortifié + saké); spirits, beer, cider excluded.

**From Adobe Live Search (`--enrich-wines`):** `taste_tag`, `tasting_profile` JSONB (`portrait_*` — body, acidity, aromas, sweetness, wood, serving temp, aging), `vintage`, `grape_blend` (structured blend with percentages).

**From watch history:** Implicit taste signal — available for personalization without explicit preference collection.

### Embedding strategy

Composite text per product:

```
{taste_tag} | {portrait_corps}, {portrait_sucre}, {portrait_acidite}
{grape_blend} | {region}, {appellation}, {country} | {vintage}
Arômes: {portrait_arome}
{description}
```

`taste_tag` and `portrait_*` are gold — they map to how users describe what they want ("bold and dry"). `description` provides semantic richness for occasion matching.

**Not embedded:** price, availability, rating — these go in WHERE clauses. Embedding price would conflate semantic similarity with price proximity.

**Model:** `multilingual-e5-large` (1024-d). Runs on CPU for batch embedding.

**Change detection:** `attribute_hash` + `embedded_hash` on Product. `--embed-sync` (in scraper) recomputes embeddings where hashes differ.

### Intent parsing

Lightweight parser extracts structured filters before the pgvector call:

- Category keywords: rouge, blanc, rosé, bulles, mousseux, porto, saké
- Price signals: "autour de 25$", "moins de 40$", "budget 50$"
- Availability: default "available somewhere"; narrow to "at your store" for users with preferred store

Regex + keyword matching for MVP. No LLM call needed for filter extraction.

### Claude integration

**Pattern: RAG context injection** — retrieve top-k wines, inject as structured text into Claude's prompt, Claude writes the recommendation.

Tool-use (Claude calling APIs directly) adds latency and non-determinism — reserved for future features like `/versus`.

**Prompt structure:**

```
System:
You are a wine recommendation assistant using SAQ catalog data.
Recommend wines ONLY from the catalog below. Never invent a wine or a detail.
If no wine fits, say so — don't hallucinate.
Respond in the same language as the user's question.

Catalog ({n} wines):
[1] {name} — {price}$ — {country}, {region} — {grape}
    {taste_tag} · {portrait_corps}, {portrait_sucre}
    Arômes: {portrait_arome}
    {description_excerpt}
    SKU: {sku}
...

User: {query}
```

**Guardrails:**
1. Prompt constraint: "only from the catalog below" — primary defense
2. Post-response SKU validation: extract SKUs from Claude's output, verify they exist in PostgreSQL. If missing → retry without that SKU
3. Graceful degradation: full RAG → SQL + Claude → SQL only

### Graceful degradation

```
/recommend request
  │
  ├─ pgvector available?
  │     ├─ YES → retrieve top-k → Claude
  │     └─ NO  → SQL top results (by rating, filtered) → Claude
  │
  └─ Claude available?
        ├─ YES → natural language response with reasoning
        └─ NO  → SQL results + "AI unavailable, here are top-rated matches"
```

## Files

| Concern | Where |
|---|---|
| Embedding client wrapper | `core/embedding_client.py` |
| Embedding dim constant | `core/embedding_constants.py` |
| Batch embed CLI | `scraper/commands/embed.py` (`make embed-sync`) |
| pgvector upsert | `scraper/scraper/db/embeddings.py` |
| Recommendation orchestration | `backend/services/recommendations.py` |
| Sommelier service (curation + wine_chat persona) | `backend/services/sommelier.py` |
| Intent parsing | `backend/services/intent.py` |
| Repository (pgvector query) | `backend/repositories/recommendations.py` |
| Tests | `backend/tests/test_recommendations*.py` |
| Eval framework | `backend/benchmarks/eval/` |
| Eval levers | `backend/benchmarks/eval/levers.md` |
| Eval queries / rubric | `backend/benchmarks/eval/data/{queries,rubric}.json` |

## Dependencies

- **pgvector extension** in PostgreSQL — vector storage + similarity ops
- **`multilingual-e5-large`** (1024-d) — embedding model, runs CPU batch
- **Claude Haiku 4.5** — curation + (optional) intent parsing
- **Scraper-owned ingestion** — `scraper/scraper/embed.py` writes embeddings; backend only reads
- **OpenAI `text-embedding-3-large`** — used by `chat.py` for query embeddings (note: catalog uses e5; query uses OpenAI — historical mismatch worth flagging)

## Cross-cutting concerns

- **Auth:** every `/api/recommendations*` route uses `Depends(verify_auth)`
- **Logging:** structured loguru — intent classification, retrieval candidate count, Claude latency, token usage
- **Errors:** graceful degradation cascades through 3 levels (above); always returns something useful
- **Observability:** Prometheus — `recommendation_duration`, `recommendation_candidates`, `llm_call_duration`, `llm_tokens`, `llm_errors`, `intent_classifications`, `recommendation_pipeline_errors`
- **Rate limiting:** SlowAPI on the `/api/recommendations` endpoint
- **Cost:** ~$0.002 per recommendation call at Haiku pricing (~$12/month at 20 users × 10 queries/day). `CLAUDE_DAILY_BUDGET_USD` cap + Telegram DM alert at 80% prevents runaway

### Token budget (per call, top-k=10)

| Component | Tokens |
|---|---|
| System prompt | ~200 |
| 10 wine cards | ~500 |
| 3-turn history | ~300 |
| User query | ~50 |
| **Total input** | **~1,050** |
| Claude output | ~300 |

### Memory footprint

~30.9k × 1024 dims × 4 bytes = **~126 MB** in pgvector. Well within the 4GB VPS budget.

## Operational notes

**Env vars:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (for query embeddings), `CLAUDE_DAILY_BUDGET_USD`

**Embedding lifecycle:**
- Initial population: `make embed-sync` after first catalog ingest
- Update: `make embed-sync` runs after monthly scrape — `--availability-check` does NOT touch embeddings
- Re-embed all: change `multilingual-e5-large` model name or composite text format → all `embedded_hash` ≠ `attribute_hash` → full recompute on next `make embed-sync` (~30 min)

**Hard rules (from [`.claude/rules/rag.md`](../../.claude/rules/rag.md)):**
1. No SAQ impersonation in prompts/messages/errors
2. Embedding-dim or model change → surface re-embedding cost before proceeding
3. Prompt caching on static portions of system prompts
4. Eval gate (`make eval`) required before merging prompt or retrieval changes

**Eval framework** — see `backend/benchmarks/eval/`. LLM-as-judge (Sonnet evaluates Haiku's output against rubric):
- 20 MW-quality benchmark queries
- 5 weighted scoring dimensions
- Sonnet judge scores 1-5 per dimension
- Per-query + weighted averages + diff vs previous run
- Iterate via `/eval-pipeline` skill (one lever at a time, holdout validation, no overfit)

**Scope constraints:**
- **Wine-scoped** — only wine products embedded (vin, champagne/mousseux, porto/fortifié, saké)
- **Montreal MVP** — in-store availability for Montreal stores only (~64 consumer stores)
- **Bilingual** — FR/EN handled natively by embedding model + Claude

**Known mismatch:** catalog embedded with `multilingual-e5-large` (1024-d); query in chat embedded with OpenAI `text-embedding-3-large` (3072-d). Worth aligning — vector spaces don't compose. Flag for an ADR if/when addressed.

## Related

- **ADRs:** [`0005-rag-pipeline.md`](../adrs/0005-rag-pipeline.md), [`0007-sommelier-memory-architecture.md`](../adrs/0007-sommelier-memory-architecture.md)
- **Agent rules (imperative form):** [`.claude/rules/rag.md`](../../.claude/rules/rag.md), [`.claude/rules/llm.md`](../../.claude/rules/llm.md)
- **Related specs:** [`chat.md`](chat.md) (the consumer), [`scraper.md`](scraper.md) (the ingestion path)
- **Eval iteration skill:** [`/eval-pipeline`](../../.claude/skills/eval-pipeline/SKILL.md)
- **Recent session logs:** look up via [`../session-logs/INDEX.md`](../session-logs/INDEX.md)
