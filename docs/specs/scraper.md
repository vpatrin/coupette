# Scraper / Data Pipeline

> Three CLI flags (single-responsibility) + monthly HTML scrape. Adobe Live Search for availability + structured wine attributes; HTML scrape for descriptions + prices. Writes the `products` + `stock_events` tables that everything else reads.

## Contract

What the scraper exposes (CLI flags via `python -m scraper`):

| Flag | Runs | What it writes | Scope |
|---|---|---|---|
| `--availability-check` | Daily (2am, systemd timer) | `online_availability`, `store_availability` on `products`; emits `stock_events` on transitions | All categories — online (~4k) + Montreal stores (~9.5k) |
| `--enrich-wines` | One-time (re-run manually) | `taste_tag`, `tasting_profile`, `grape_blend`, `vintage` on wine products | Wine only (~30.9k) |
| `--embed-sync` | After monthly scrape | Recomputes pgvector embeddings where `attribute_hash != embedded_hash` | Wine only (~30.9k initial, ~0–20 incremental) |
| (monthly HTML scrape) | Monthly | New SKU `description` + static fields; marks delisted SKUs | Sitemap diff (~0–20 pages/month) |

**Writer ownership rule:** every column on `products` has exactly one writer. No overlap between CLI flags (see [Writer ownership](#writer-ownership) below).

## How it works

```
One-time setup:
  1. Full HTML scrape     → all products have description (~38k pages)
  2. --enrich-wines       → partitioned Adobe fetch for wine products (~90 queries, ~2 min)
  3. --embed-sync         → initial embedding of ~30.9k wine products

--availability-check (daily ~1 min):
  1a. Adobe inStock=true  → online avail + store lists (~30s, ~4k products)
  1b. Adobe Montreal `in` → store avail for En succursale products (~30s, ~9.5k products)
  2.  Watch diff          → compare prev vs new → StockEvent
  3.  Housekeeping        → purge events >7 days

Monthly:
  1. Sitemap diff         → detect new + delisted SKUs
  2. HTML fetch           → description + static fields for new SKUs only (~0–20 pages)

After monthly scrape:
  --embed-sync            → recompute pgvector embeddings for stale rows (~0–20)
```

Two external dependencies: Adobe Live Search (daily) + SAQ HTML (monthly). No Magento GraphQL, no AJAX.

### Monthly scrape

> Target design, not yet implemented — supersedes the lastmod-based approach. Was tracked in #291, now in Linear.

The diff is computed on the **SKU set**, not on sitemap `lastmod`. SAQ bumps `lastmod` weekly whether or not anything changed, so a lastmod diff re-fetches the whole catalogue for nothing. Comparing SKU sets brings a typical run down from ~50–200 HTML fetches to ~0–20.

Fetch HTML only for new SKUs plus any SKU where `description IS NULL` — the second case backfills rows a previous run failed on.

Two fields the monthly scrape must *not* own:

- **`availability`** — ignored even though the HTML carries it. SAQ pages are CDN-cached 24–48h, so that value is stale by construction. `--availability-check` owns `online_availability`.
- **`price`** — written on first scrape only. SAQ prices are regulated and effectively static; rewriting them monthly is churn with no signal.

Unchanged from the current implementation: sitemap fetch, delist detection, relist, exit codes, error handling.

### Data sources

| Source | What it gives | What it can't | Cost per run |
|---|---|---|---|
| **Adobe Live Search** | 91 attributes/product (tasting, cepage, pastille, stores), `inStock`, `lowStock`, `store_availability_list` | Price, description | ~9 pages for inStock (~30s); ~24 pages for full wine partitions |
| **HTML scrape** | `description`, `alcohol`, `sugar`, `producer`, `classification`, `size`, `price` | Stale availability (CDN-cached 24–48h) | ~0–20 pages/month (new SKUs only) |

### Adobe Live Search API

```
POST https://catalog-service.adobe.io/graphql

Headers (all public — embedded in every SAQ page load):
  x-api-key: 7a7d7422bd784f2481a047e03a73feaf
  Magento-Environment-Id: 2ce24571-9db9-4786-84a9-5f129257ccbb
  Magento-Website-Code: base
  Magento-Store-Code: main_website_store
  Magento-Store-View-Code: fr
```

GraphQL query: `productSearch(phrase: "", filter: [...], page_size: 500, current_page: N)`. Returns `productView { sku, name, inStock, lowStock, url, urlKey, lastModifiedAt, attributes { name, value } }`. `description` and `shortDescription` are **always empty** for SAQ — HTML is the only description source.

**Hard pagination cap: 10,000 products.** `page_size × current_page` errors past 10k. Partition with filters to stay under.

**Type polymorphism quirk:** several attributes return a plain string when 1 value, JSON array when many. Confirmed for `store_availability_list` and `availability_front`. Parser must normalize to always-array.

### Partition strategy (stays under 10k cap)

| Partition | Count | Pages |
|---|---|---|
| `inStock=true` | 4,077 | 9 |
| Montreal stores (`in` filter, 64 consumer stores) | 9,487 | 19 |
| Vin-rouge | 18,885 | needs sub-partition |
| → by country (34 countries, sum exactly 18,885) | each ≤10,807 | varies |
| → France (10,807) by price range | each ≤4,285 | varies |
| vin-blanc, rosé, champagne, porto, saké | each ≤9,410 | 1 query each |

Country discovery is facet-driven (no hardcoded lists). Region facets have a 231-product gap; price ranges close it deterministically (sum = 10,805 vs 10,807; gap = 2 null-price products).

### Wine-only scope (RAG)

Bot + frontend are wine-focused. Of ~38k SAQ products, ~30.9k wine products are enriched + embedded:

| Category | Count |
|---|---|
| `vin-rouge` | 18,885 |
| `vin-blanc` | 9,410 |
| `vin-rose` | 518 |
| `champagne-et-mousseux` | 1,659 |
| `porto-et-vin-fortifie` | 313 |
| `sake` | 140 |
| **Wine total** | **~30,925** |
| Spirits/beer/cider (in DB, not embedded) | ~6,000 |

`vin-nature` and orange wine are cross-tagged within rouge/blanc/rosé — captured automatically.

## Files

| Concern | Where |
|---|---|
| Entry point + command dispatch | `scraper/scraper/__main__.py` |
| CLI commands | `scraper/scraper/commands/{availability,enrich,embed,scrape,stores}.py` |
| Adobe Live Search client | `scraper/scraper/adobe.py` |
| Sitemap fetching | `scraper/scraper/sitemap.py` |
| Robots.txt compliance | `scraper/scraper/robots.py` |
| Product page scraping | `scraper/scraper/products.py` |
| Stores | `scraper/scraper/stores.py` |
| Embedding batch + upsert | `scraper/scraper/embed.py`, `scraper/scraper/db/embeddings.py` |
| Models | `core/db/models/{product,store,watch,stock_event}.py` |
| Tests | `scraper/tests/` |

## Dependencies

- **Adobe Live Search** (`catalog-service.adobe.io/graphql`) — primary data source, public API key
- **SAQ HTML** (CDN-cached) — `description`, prices, display strings
- **PostgreSQL** — `products`, `stores`, `watches`, `stock_events` tables
- **pgvector extension** — for embedding storage (`--embed-sync` writes; backend reads — see [`rag.md`](rag.md))
- **`core/embedding_client.py`** — embedding model wrapper (multilingual-e5-large, 1024-d)

## Cross-cutting concerns

- **Auth:** none (read-only scraping; writes to its own DB)
- **Logging:** `from loguru import logger`, structured placeholders
- **Errors:** Adobe API 4xx/5xx surfaced; HTML 404 marks SKU delisted; rate-limit backoff
- **Observability:** batch-summary log per run (products updated, events emitted, errors); no Prometheus on scraper side
- **Rate limiting:** 2–3s between SAQ HTML requests; Adobe API has no documented rate limit but requests pace ~1.2s/page naturally
- **Legal compliance** — see [`.claude/rules/scraper.md`](../../.claude/rules/scraper.md). **Hard rules:**
  - Sitemap-only URL discovery — never crawl
  - Never fetch disallowed paths (`/catalogsearch/`, `/catalog/product/view/`, filtered URLs, `/checkout/`, `/customer/`, `/wishlist/`)
  - Paraphrase SAQ descriptions, never copy verbatim in user-facing surfaces
  - Always attribute SAQ as data source
  - Transparent User-Agent (bot identification)

### Schema

**New columns on `Product`** (added in Phase 6):

| Column | Writer | Notes |
|---|---|---|
| `taste_tag` | `--enrich-wines` | SAQ taste profile (e.g. "Aromatique et souple") |
| `vintage` | `--enrich-wines` | Millésime (e.g. "2023") |
| `tasting_profile` (JSONB) | `--enrich-wines` | All `portrait_*` attrs from Adobe |
| `grape_blend` (JSONB) | `--enrich-wines` | Structured blend with percentages |
| `online_availability` | `--availability-check` | Renamed from `availability` |
| `store_availability` (JSONB) | `--availability-check` | Array of store IDs carrying the product. GIN index for `@>` containment |
| `attribute_hash` | `--embed-sync` | Hash of embedding-relevant fields |
| `embedded_hash` | `--embed-sync` | Hash at time of last embed |

**Dropped:** `ProductAvailability` table (online absorbed into `Product`; store data into `store_availability` JSONB), `magento_id`, `store_qty`, `store_checked_at`, `color`, `barcode`.

### Writer ownership

| Column(s) | Writer | Frequency |
|---|---|---|
| `online_availability`, `store_availability` | `--availability-check` | Daily |
| `taste_tag`, `tasting_profile`, `grape_blend`, `vintage` | `--enrich-wines` | One-time + on-demand |
| `attribute_hash`, `embedded_hash`, embedding vector | `--embed-sync` | After monthly scrape |
| `description`, `alcohol`, `sugar`, `producer`, `classification`, `size` | Monthly HTML scrape | New SKUs only |
| `price` | Monthly HTML scrape | First scrape only (SAQ prices regulated, rarely change) |
| `name`, `url`, `image`, `category`, `grape`, `region`, etc. | Monthly HTML scrape | First scrape only |

Each column has exactly one writer.

### `tasting_profile` JSONB structure

```json
{
  "acidite": "présente",
  "arome": ["cassis", "prune", "sous-bois", "épices"],
  "bois": "équilibré",
  "bouche": "généreuse",
  "corps": "mi-corsé",
  "sucre": "sec",
  "temp_service": [16, 18],
  "potentiel_garde": "À boire ou à garder 4 ans suivant le millésime"
}
```

Stored as JSONB (not individual columns) because: 10+ portrait fields would bloat the table; read pattern is "load whole profile" not "query by acidite"; easy to extend if Adobe adds attributes.

### Embedding contract (with `rag.md`)

- `attribute_hash` = SHA256 of wine-identity fields: `taste_tag`, `grape_blend`, `region`, `appellation`, `country`, `category`, `grape`, `designation`, `classification`, `portrait_arome`, `portrait_corps`, `portrait_sucre`, `description`
- Excludes transient data: `online_availability`, `store_availability`, `price`, `rating`, `review_count`
- `--embed-sync` recomputes the embedding whenever `attribute_hash != embedded_hash` then sets them equal
- **Embeddable = has Adobe attributes OR description.** Either source has enough semantic signal
- Wine-only — non-wine products stay in DB but aren't embedded
- Attribute sparsity: not all wines have populated `taste_tag` or `portrait_*` — fall back to `description` for semantic signal

## Operational notes

**Env vars:** none required for Adobe (public key). HTML scrape: standard `User-Agent` constant.

**Timing:**
- `--availability-check`: ~1 min daily at 2am UTC (systemd timer)
- `--enrich-wines`: ~2 min one-time (re-run manually if Adobe attributes drift)
- `--embed-sync`: ~30 min for initial 30.9k; ~seconds for incremental
- Monthly HTML scrape: ~0–20 fetches (new SKUs only since sitemap-diff replaced lastmod-diff)

**Adobe API stability concern:** the API key + environment ID are scraped from SAQ's frontend HTML. If SAQ rotates them, the scraper breaks. Mitigation: monitor for 401/403; re-scrape SAQ HTML for updated credentials.

**Montreal MVP for stores:** in-store availability refreshed for ~64 consumer Montreal stores only. Expand by metro area (Quebec City, Laval, etc.) when needed. Don't combine all ~400 stores in one `in` query — would exceed 10k cap.

**`store_availability_list` scope:** Adobe populates this for ALL available products, regardless of `inStock`. A product with `inStock=false` + `availability_front=En succursale` still has store IDs. Store-level filtering works for the full available catalog (~11.5k), not just online-purchasable (~4k).

**Monthly scrape simplification (Phase 6):** `lastmod` is ignored — SAQ updates it weekly for ~80% of catalog regardless of actual changes. SKU-set diff replaces it: new SKUs → fetch HTML; missing SKUs → mark delisted; existing SKUs → skip. Typical run: ~0–20 fetches instead of ~50–200.

**Deprecated paths (do not re-introduce):**
- Magento GraphQL (`POST https://www.saq.com/graphql`) — `magento_id` was only needed for AJAX store locator (dropped); `custom_attributesV2` returns Internal Server Error on SAQ's installation
- AJAX Store Locator (`/fr/store/locator/ajaxlist`) — provided per-store `qty`; replaced by Adobe `store_availability_list` (boolean presence, sufficient for recs/alerts)

## Related

- **ADRs:** [`0002-sitemap-scraping-and-adobe-api.md`](../adrs/0002-sitemap-scraping-and-adobe-api.md), [`0005-rag-pipeline.md`](../adrs/0005-rag-pipeline.md)
- **Agent rules (imperative form):** [`.claude/rules/scraper.md`](../../.claude/rules/scraper.md) — legal constraints + rate-limit rules
- **Related specs:** [`rag.md`](rag.md) (the consumer of embeddings), [`bot.md`](bot.md) (the consumer of `stock_events`)
- **Recent session logs:** look up via [`../session-logs/INDEX.md`](../session-logs/INDEX.md)
