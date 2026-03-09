# Pipeline Optimization Levers

When improving the RAG recommendation pipeline based on eval results, these are the files
and parameters you can change. Each lever has different impact and risk.

## 1. Intent Prompt (highest impact)

**File:** `backend/services/intent.py`
**What:** `_SYSTEM_PROMPT` — the system prompt sent to Claude Haiku for intent extraction
**Impact:** Controls how user queries are parsed into structured filters (categories, price, country)
**When to change:** Low relevance scores, wrong categories being extracted, price ranges off
**Risk:** Low — prompt changes are easy to revert and eval catches regressions

## 2. Tool Schema

**File:** `backend/services/intent.py`
**What:** `_TOOLS` — the tool definition that constrains Haiku's output structure
**Impact:** Adding fields (e.g. `grape_varieties`, `occasion`) gives the parser more expressiveness
**When to change:** When the parser can't express what the user asked for
**Risk:** Medium — new fields require matching changes in the retrieval query

## 3. Embedding Text Composition

**File:** `scraper/src/embed.py`
**What:** `compose_embedding_text()` — builds the text string that gets embedded per product
**Impact:** What the embedding captures determines semantic search quality
**When to change:** Low relevance on taste/style queries despite correct intent parsing
**Risk:** High — requires re-embedding all products (`make embed-sync`), ~30 min + API cost

## 4. Retrieval Query

**File:** `backend/repositories/recommendations.py`
**What:** `find_similar()` — SQL + pgvector query with filters and similarity ranking
**Impact:** Controls filtering logic, result count, and ranking strategy
**When to change:** Correct intent + good embeddings but wrong products returned
**Risk:** Low — query changes are instant, no re-embedding needed

## 5. Re-ranking (does not exist yet)

**Where it would go:** `backend/services/recommendations.py` after `find_similar()` returns
**What:** Post-retrieval scoring that factors in quality signals beyond vector distance
**Impact:** Could improve curation/coherence scores without changing embeddings
**When to add:** When relevance is good but curation/value scores are low

## 6. Result Count

**File:** `backend/config.py`
**What:** `DEFAULT_RECOMMENDATION_LIMIT` (currently 5)
**Impact:** More results = more chances for coherence, but dilutes average curation quality
**When to change:** When coherence scores are consistently low

## 7. Rubric Tuning

**File:** `backend/eval/data/rubric.json`
**What:** The scoring criteria and weights the judge uses
**Impact:** Changes what "good" means — adjusting weights shifts optimization priorities
**When to change:** When you realize a dimension matters more/less than expected
**Risk:** None — doesn't change the pipeline, only the measurement

## Optimization Strategy

1. Read eval results JSON — sort queries by overall score, focus on bottom quartile
2. Read judge justifications to identify root cause
3. Change ONE lever at a time
4. Re-run eval (full or `--query` for specific failures)
5. Compare scores — keep if improved, revert if regressed

## Future: Eval Tracing (v2)

Currently the eval output includes a timestamp but no version info. For proper MLOps
traceability, the `EvalReport` schema should be extended with:

- **pipeline_version** — git commit SHA (which version of the code produced these results)
- **dataset_version** — SHA256 of `queries.json` (which test set was used)
- **rubric_version** — SHA256 of `rubric.json` (which scoring criteria were applied)
- **eval_script_version** — git commit SHA of the eval code itself

This enables comparing runs across code versions, not just timestamps. Also enables
CI quality gates that compare against a committed baseline.

Additional tracing to consider:

- **Cost tracking** — Haiku tokens + OpenAI embed tokens + Sonnet judge tokens per run
- **Latency** — per-query pipeline time vs judge time
- **Baseline file** — committed `baseline.json` that CI compares against
