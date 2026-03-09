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

## 5. Re-ranking

**File:** `backend/repositories/recommendations.py`
**What:** `_rerank()` — MMR-style greedy selection balancing relevance (embedding rank) with
diversity (penalizes same producer, taste_tag, grape, region, country)
**Parameters:** `_DIVERSITY_LAMBDA` (0.5), `_DIVERSITY_POOL` (4x over-fetch)
**Impact:** Broke the curation ceiling (3.1→3.5) by ensuring diverse selections
**When to change:** When curation or coherence scores stagnate despite good relevance
**Risk:** Low — only reorders existing candidates, doesn't change what gets fetched

## 6. Retrieval Tuning

**File:** `backend/repositories/recommendations.py`
**What:** Fine-tune `_DIVERSITY_LAMBDA`, attribute weights in `_redundancy_penalty`, `_DIVERSITY_POOL`
**Impact:** Controls the relevance-vs-diversity trade-off in re-ranking
**When to change:** After curation changes are measured — if retrieval-quality dimensions (relevance,
diversity) still lag while presentation scores improved
**Risk:** Low — only reorders candidates, easy to A/B test via eval
**Key knobs:**
- `_DIVERSITY_LAMBDA` (0.5) — higher = more diversity, lower = more relevance
- Producer weight (1.5), grape weight (1.0), taste_tag (1.0), region (1.0), category (0.75), country (0.5)
- `_DIVERSITY_POOL` (4x) — over-fetch multiplier before re-ranking

## 7. Result Count

**File:** `backend/config.py`
**What:** `DEFAULT_RECOMMENDATION_LIMIT` (currently 5)
**Impact:** More results = more chances for coherence, but dilutes average curation quality
**When to change:** When coherence scores are consistently low

## 8. Rubric Tuning

**File:** `backend/eval/data/rubric.json`
**What:** The scoring criteria and weights the judge uses
**Impact:** Changes what "good" means — adjusting weights shifts optimization priorities
**When to change:** When you realize a dimension matters more/less than expected
**Risk:** None — doesn't change the pipeline, only the measurement

## Eval CLI

```bash
make eval                                    # train split, 1 run, temp=0 (default)
make eval SPLIT=holdout                      # holdout split only
make eval SPLIT=all                          # all 19 queries
make eval QUERY=4                            # single query (ignores split)
make eval JUDGE_RUNS=2 JUDGE_TEMP=1.0        # multi-run with variance
make eval PIPELINE_RUNS=2                    # run full pipeline twice, report mean ± std
```

### Query splits

19 queries split into 13 train / 6 holdout (set in `queries.json` via `"split"` field).
Holdout IDs: 1, 6, 10, 12, 16, 19 — rotated after Cycle 4 to prevent overfitting to a fixed split.

**Rotation policy:** rotate every 3 cycles, or earlier if train-holdout gap exceeds 0.4.
To rotate: swap 6 train queries (diverse tags) into holdout, move current holdout to train.

### Judge settings

- **temp=0** (default): near-deterministic scoring. Score changes = your changes, not noise.
- **temp=1.0**: realistic variance. Use for final validation.
- **judge_runs=1** (default): single judge call. Fast.
- **judge_runs=2**: two calls, scores averaged per dimension. Justification kept from the run closest to the mean.

### Output

- Console: scorecard with per-dimension averages, tag-stratified averages, low-score details
- JSON: `backend/eval/results/eval_<timestamp>.json` — summary fields at top, bulky query_scores last
- Diff mode: auto-compares with the most recent previous result file

## `/eval-pipeline` flow

The `/eval-pipeline` skill automates the optimize → measure → decide loop:

1. Run `make eval` (train split, temp=0, 1 run) — baseline
2. Analyze: bottom-quartile queries, tag averages, judge justifications
3. Pick ONE lever from this doc, change it
4. Re-run `make eval`, compare scores
5. If improved → keep. If regressed → revert
6. Repeat for up to **5 iterations** (or until target reached / plateau detected)
7. **Holdout validation**: `make eval SPLIT=holdout JUDGE_RUNS=2 JUDGE_TEMP=1.0`
   - If holdout is >0.5 below train → likely overfit, flag it

### Overfitting guardrails

- **Train/holdout split**: iterate on train only, validate on holdout at the end
- **Deterministic judging**: temp=0 during iteration prevents score noise from masking overfitting
- **Tag-stratified scores**: catch improvements concentrated in 1 tag while others regress
- **Distributed improvements**: if a score jump comes from 1 query while 3 others dropped, that's a red flag
- **No surgical rules**: prompt changes should help 3+ unseen queries, not map 1:1 to a test query

## Lessons learned

Structural insights from past `/eval-pipeline` cycles. Read these before iterating to avoid
repeating dead ends. Only record strategy-level patterns, never query-specific fixes.

### Cycle 1 (2026-03-08) — baseline 3.37 → 3.51

- **exclude_grapes rule worked** (+0.14): adding rule 6 to the intent prompt with explicit cues
  ("tanné de", "tired of") and examples made Haiku populate the field. Broad improvement across
  fatigue, style, and reference tags.
- **Multi-intent instruction ignored**: adding "include ALL mentioned categories" for dual requests
  ("rosé pis un blanc") had zero effect — Haiku still returns only one type. This is also an
  architectural limitation: single result set can't split two wine types meaningfully.
- **max_per_producer=1 is too aggressive**: forcing unique producers pushes worse-matching wines
  into results, hurting coherence and curation. Keep at 2.
- **Prompt instability**: even small prompt changes cause unpredictable regressions in unrelated
  queries (e.g. adding food-pairing examples caused country='null' string bug on Q7). Keep
  prompt changes minimal and targeted.
- **Curation is bottlenecked by re-ranking**: embedding similarity returns semantically close wines
  but not diverse/curated ones. Re-ranking (Lever 5) is the next high-impact lever to build.
- **Adversarial queries are structurally capped**: categories=[] falls back to wine scope, so
  beer→sake is expected. Needs a "graceful decline" path, not prompt tuning.
- **Holdout gap was 0.41** (train 3.51 vs holdout 3.10) — under 0.5 threshold, no overfitting.

### Cycle 2 (2026-03-08) — baseline 3.45 → 3.63

- **Excluding price=0 products worked** (+0.18): products with no price were a systemic drag across
  many queries — judge consistently penalized "unavailable" or "missing pricing". Filtering them
  unconditionally in `find_similar()` lifted value (+0.3) and curation (+0.3).
- **Diversity pool 5x hurts**: increasing `_DIVERSITY_POOL` from 3 to 5 pulls worse-matching wines
  from further in the embedding space. More candidates ≠ better diversity. Keep at 3.
- **Judge variance at temp=0**: same code scored 3.51 (Cycle 1) and 3.45 (Cycle 2). ~0.06 is the
  noise floor — don't chase improvements smaller than this.
- **Pipeline at local optimum for prompt/retrieval**: remaining weak queries (méchoui→Bordeaux,
  fromages→Quebec, beer→sake, multi-intent) are structural. Next high-impact lever is re-ranking
  (Lever 5) or embedding text (Lever 3, expensive).
- **Holdout gap was 0.20** (train 3.63 vs holdout 3.43) — strong generalization.

### Cycle 3 (2026-03-08) — baseline 3.50 → 3.63

- **MMR-style re-ranking worked** (+0.13): replaced `_diversify_by_producer` with greedy
  relevance-vs-redundancy selection. λ=0.5 is the sweet spot. Broke the curation ceiling
  (3.1→3.5) by penalizing same taste_tag/grape/region/producer/country overlap.
- **λ=0.3 is too weak**: top embedding results dominate, re-ranker barely changes order.
- **λ=0.5 is optimal**: good balance between relevance and diversity.
- **Pool=6 doesn't help over pool=4**: more candidates ≠ better re-ranking. Keep at 4.
- **taste_tag weight=2.0 over-penalizes**: pushes less relevant wines in. Keep taste_tag at 1.0.
- **Pipeline ceiling at ~3.63**: prompt, retrieval, and re-ranking levers exhausted. Next
  step requires embedding text changes (Lever 3, expensive) or architectural changes
  (multi-shot intent). Graceful non-wine decline shipped in Cycle 4.
- **Holdout gap was 0.29** (train 3.63 vs holdout 3.34) — no overfitting.

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
