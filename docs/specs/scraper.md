# Scraper / Data Pipeline

> Single-responsibility subcommands of `python -m scraper`. Adobe Live Search for availability + structured wine attributes; HTML pages from the sitemap for descriptions, prices, and static fields. Writes the `products`, `stores`, and `stock_events` tables that everything else reads.

## Contract

What the scraper exposes (subcommands of `python -m scraper`; systemd units in `deploy/systemd/`):

| Command | Runs | What it writes | Scope |
|---|---|---|---|
| `scrape` (default) | Weekly, Mon 03:00 (`coupette-scraper`) | Product pages whose sitemap `lastmod` is newer than the row (or new SKUs), skipped when the content hash is unchanged; marks and clears delisted SKUs from the sitemap SKU set; emits delist `stock_events` | All sitemap products |
| `enrich` | Weekly, after `scrape` | `taste_tag`, `tasting_profile`, `grape_blend`, `vintage` | Wine only |
| `embed` | Weekly, after `enrich` | pgvector `embedding` + `last_embedded_hash` where the computed hash changed | Every product with non-empty embedding text |
| `availability` | Daily, 02:00 (`coupette-availability`) | `online_availability`, `store_availability`; emits `stock_events` on transitions for watched products | Online `inStock` + Montreal stores |
| `stores` | Manual (`make scrape-stores`) | `stores` table from the SAQ store locator | All SAQ stores |
| `seed` | Local dev only (`make seed`, called by `make dev`) | Synthetic `stores` + `products` from `scraper/scraper/fixtures/dev_catalog.json`, in one transaction; no embeddings, no network | Skipped when `products` has rows; refused when `ENVIRONMENT=production` |

**Writers:** each column has one intended writer (see [Writer ownership](#writer-ownership)). Two exceptions: `scrape` rewrites every page field on a content change, `online_availability` and `price` included; `seed` writes whole rows, but only into an empty table in local dev.

## How it works

```
Daily (02:00) — availability:
  1a. Adobe inStock=true  → online avail + store lists
  1b. Adobe Montreal `in` → store avail for En succursale products
  2.  Watch diff          → compare prev vs new → StockEvent
  3.  Housekeeping        → delete events older than 7 days

Weekly (Mon 03:00) — scrape → enrich → embed:
  1. Sitemap              → SKU set diff marks delisted / relisted; lastmod picks pages to fetch
  2. HTML fetch           → page fields; unchanged content hash → no write
  3. enrich               → partitioned Adobe fetch for wine products
  4. embed                → recompute embeddings for rows whose hash changed
```

**Known bug (not fixed here):** `availability` writes the new availability (step 1) before step 2 reads the "previous" state from the DB, so step 2 never sees a transition. Delist events from `scrape` still fire.

Two external dependencies: Adobe Live Search (daily + weekly) and SAQ HTML (weekly). The `stores` command also calls the SAQ store-locator endpoint. No Magento GraphQL.

### Weekly scrape — target design

> Target design, not yet implemented — supersedes the lastmod-based approach. Was tracked in #291, now in Linear.

The diff is computed on the **SKU set**, not on sitemap `lastmod`. SAQ bumps `lastmod` weekly whether or not anything changed, so a lastmod diff re-fetches much of the catalogue for nothing (the content hash then skips the DB write, not the fetch). Comparing SKU sets brings a typical run down from ~50–200 HTML fetches to ~0–20.

Fetch HTML only for new SKUs plus any SKU where `description IS NULL` — the second case backfills rows a previous run failed on.

Two fields the scrape must *not* own:

- **`online_availability`** — ignored even though the HTML carries it. SAQ pages are CDN-cached 24–48h, so that value is stale by construction. `availability` owns it.
- **`price`** — written on first scrape only. SAQ prices are regulated and effectively static; rewriting them is churn with no signal.

Unchanged from the current implementation: sitemap fetch, delist detection, relist, exit codes, error handling.

### Data sources

| Source | What it gives | What it can't | Cost per run |
|---|---|---|---|
| **Adobe Live Search** | 91 attributes/product (tasting, cepage, pastille, stores), `inStock`, `store_availability_list` | Price, description | ~9 pages for inStock (~30s); ~24 pages for full wine partitions |
| **HTML scrape** | `description`, `alcohol`, `sugar`, `producer`, `classification`, `size`, `price`, `rating`, JSON-LD availability | Fresh availability (CDN-cached 24–48h) | Pages with a newer `lastmod` |

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

GraphQL query: `productSearch(phrase: "", filter: [...], page_size: 500, current_page: N)`. The scraper requests `productView { sku, name, inStock, url, attributes { name, value } }`. `description` and `shortDescription` are **always empty** for SAQ — HTML is the only description source.

**Hard pagination cap: 10,000 products.** `page_size × current_page` errors past 10k. Partition with filters to stay under.

**Type polymorphism quirk:** several attributes return a plain string when 1 value, JSON array when many. Confirmed for `store_availability_list` and `availability_front`. The parser normalizes to always-array.

### Partition strategy (stays under 10k cap)

| Partition | Count | Pages |
|---|---|---|
| `inStock=true` | 4,077 | 9 |
| Montreal stores (`in` filter, 64 consumer stores) | 9,487 | 19 |
| Vin-rouge | 18,885 | needs sub-partition |
| → by country (34 countries, sum exactly 18,885) | each ≤10,807 | varies |
| → France (10,807) by price range | each ≤4,285 | varies |
| vin-blanc, rosé, champagne, porto, saké | each ≤9,410 | 1 query each |

Country discovery is facet-driven (no hardcoded lists). Price ranges (hardcoded) sub-partition a country only when it exceeds 10k. Region facets have a 231-product gap; price ranges close it deterministically (sum = 10,805 vs 10,807; gap = 2 null-price products).

### Wine scope

Of ~38k SAQ products, ~30.9k are wine products. `enrich` covers only these; `embed` covers every product with non-empty text, and retrieval restricts to wine at query time (see [`rag.md`](rag.md)).

| Category | Count |
|---|---|
| `vin-rouge` | 18,885 |
| `vin-blanc` | 9,410 |
| `vin-rose` | 518 |
| `champagne-et-mousseux` | 1,659 |
| `porto-et-vin-fortifie` | 313 |
| `sake` | 140 |
| **Wine total** | **~30,925** |
| Spirits/beer/cider | ~6,000 |

`vin-nature` and orange wine are cross-tagged within rouge/blanc/rosé — captured automatically.

## Files

| Concern | Where |
|---|---|
| Entry point + subcommand dispatch | `scraper/scraper/__main__.py` → `scraper/scraper/commands/` |
| Embedding text + change hash | `scraper/scraper/embed.py` |
| Embedding row selection + write (also `enrich`'s writer) | `scraper/scraper/db/embeddings.py` |
| OpenAI batching (shared with the backend) | `core/embedding_client.py` |
| Dev seed fixture | `scraper/scraper/fixtures/dev_catalog.json` |
| Models | `core/db/models.py` |
| Production schedules | `deploy/systemd/coupette-{scraper,availability}.{service,timer}` |

## Dependencies

- **Adobe Live Search** (`catalog-service.adobe.io/graphql`) — primary data source, public API key
- **SAQ HTML** (CDN-cached) — `description`, prices, display strings
- **PostgreSQL** — `products`, `stores`, `watches`, `user_store_preferences`, `stock_events` tables
- **pgvector extension** — for embedding storage (`embed` writes; backend reads — see [`rag.md`](rag.md))
- **`core/embedding_client.py`** — embedding model wrapper (OpenAI `text-embedding-3-large`, 1536-d)

## Cross-cutting concerns

- **Auth:** none (read-only scraping; writes to its own DB)
- **Logging:** `from loguru import logger`, structured placeholders; one summary line per run
- **Errors:** an HTML 404 counts as `not_found` (a stale sitemap entry); delisting comes from the sitemap SKU diff. No retry or backoff — a failed page is retried on the next run
- **Observability:** run summary logs; systemd `ExecStartPost` pings an external push monitor; no Prometheus
- **Rate limiting:** a fixed `RATE_LIMIT_SECONDS` (2s) sleep between SAQ requests (pages, sitemaps, store locator) and between Adobe pages
- **Legal compliance** (sitemap-only fetching, disallowed paths, paraphrasing, attribution, User-Agent): [`.claude/rules/scraper.md`](../../.claude/rules/scraper.md).

### Writer ownership

| Column(s) | Writer | Frequency |
|---|---|---|
| `online_availability`, `store_availability` (JSONB array of store IDs, GIN index for `@>`) | `availability` | Daily |
| `taste_tag`, `tasting_profile` (JSONB), `grape_blend` (JSONB, blend with percentages), `vintage` | `enrich` | Weekly |
| `embedding`, `last_embedded_hash` | `embed` | Weekly |
| `description`, `alcohol`, `sugar`, `producer`, `classification`, `size`, `price`, `rating`, `name`, `url`, `image`, `category`, `grape`, `region`, … and `last_scraped_hash` | `scrape` | Weekly, on a content change |
| `delisted_at` | `scrape` (sitemap SKU diff) | Weekly |

`scrape` also writes `online_availability` from the page's JSON-LD on a content change. It runs one hour after the daily `availability`, so on Mondays a changed page can overwrite Adobe's value until the next day.

### `tasting_profile` JSONB structure

Seven `portrait_*` attributes from Adobe (`acidite`, `arome`, `bois`, `bouche`, `corps`, `sucre`, `potentiel_garde`) plus `temp_service`:

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

- The change hash is a SHA-256 computed at sync time (not stored per field) over `model=<model>:dim=<dims>` plus `taste_tag`, `grape_blend`, `grape`, `producer`, `region`, `appellation`, `country`, `category`, `designation`, `classification`, `vintage`, `description`, and `tasting_profile` `corps`, `sucre`, `acidite`, `arome`
- Excludes transient data: `online_availability`, `store_availability`, `price`, `rating`, `review_count`
- `embed` re-embeds a row when its computed hash differs from `last_embedded_hash` (or that is NULL), then stores the new hash. A model or dimension change therefore re-embeds everything
- **Embeddable = the composite text is non-empty** (category alone is enough)
- Attribute sparsity: not all wines have `taste_tag` or `portrait_*` — the description carries the semantic signal then

## Operational notes

**Env vars:** none required for Adobe (public key, overridable in `scraper/scraper/config.py`). `embed` exits fatally without `OPENAI_API_KEY`.

**Timing:**
- `availability`: ~1 min daily
- `enrich`: ~2 min (~90 Adobe queries)
- `embed`: ~30 min for the full catalog; seconds for an incremental run

**Adobe API stability concern:** the API key + environment ID are scraped from SAQ's frontend HTML. If SAQ rotates them, the scraper breaks. Mitigation: monitor for 401/403; re-scrape SAQ HTML for updated credentials.

**Montreal MVP for stores:** in-store availability covers the Montreal consumer stores in the `stores` table (city "Montréal", excluding SAQ Restauration); `availability` aborts if none are found. Expand by metro area when needed. Don't combine all ~400 stores in one `in` query — it would exceed the 10k cap.

**`store_availability_list` scope:** Adobe populates this for ALL available products, regardless of `inStock`. A product with `inStock=false` + `availability_front=En succursale` still has store IDs. Store-level filtering works for the full available catalog (~11.5k), not just online-purchasable (~4k).

**Deprecated path (do not re-introduce):** Magento GraphQL (`POST https://www.saq.com/graphql`) — `custom_attributesV2` returns Internal Server Error on SAQ's installation. Per-store quantities from the store locator were also dropped: Adobe's `store_availability_list` (presence only) is enough for recommendations and alerts.

## Related

- **ADRs:** [`0002-sitemap-scraping-and-adobe-api.md`](../adrs/0002-sitemap-scraping-and-adobe-api.md), [`0005-rag-pipeline.md`](../adrs/0005-rag-pipeline.md)
- **Agent rules (imperative form):** [`.claude/rules/scraper.md`](../../.claude/rules/scraper.md) — legal constraints + rate-limit rules
- **Related specs:** [`rag.md`](rag.md) (the consumer of embeddings), [`bot.md`](bot.md) (the consumer of `stock_events`)
