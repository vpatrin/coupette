# ADR 0002: Sitemap-First Scraping with Adobe API Enrichment

**Date:** 2026-02-13 (sitemap scraping) · Updated 2026-03-05 (Adobe API pivot)
**Status:** Accepted

## Context

Coupette needs wine catalog data from the SAQ (Société des alcools du Québec). Web scraping is in a legal grey zone in Canada. We need a strategy that is legally defensible, technically reliable, and provides enough product detail for recommendations.

The scraper also needs to run as a production job — we need a scheduling and failure model.

## How it evolved

**Phase 1 — Pure HTML scraping** (Feb 2026). The scraper fetched product URLs from SAQ's public sitemaps (declared in `robots.txt`) and parsed HTML pages for product data. This was the most conservative legal approach — we only fetched URLs the site explicitly published.

Problem: HTML parsing was brittle. SAQ's markup varied across product pages, some attributes were missing from the HTML entirely, and in-store availability was only visible after JavaScript rendered the page — not in the static HTML.

**Phase 2 — Adobe API discovery** (Mar 2026). While debugging availability rendering in the browser, we found SAQ's frontend calls an Adobe Live Search GraphQL endpoint (`livesearch.adobe.io`) to fetch product attributes and real-time stock levels. This is a public API (no auth required) that returns structured data.

**Phase 3 — Hybrid pipeline** (current). Sitemap remains the discovery mechanism (legal basis). Adobe API replaces fragile HTML parsing for enrichment (tasting notes, grape varieties, detailed attributes) and provides store-level availability that HTML couldn't.

## Decision

Hybrid approach with staged commands, each independently runnable:

1. `scrape-products` — sitemap → HTML → base product data → DB
2. `scrape-enrich` — Adobe API → wine attributes, tasting notes → DB
3. `scrape-availability` — Adobe API → store-level stock status → DB
4. `embed-sync` — product text → OpenAI embeddings → pgvector
5. `scrape-stores` — SAQ store directory → DB

One-shot batch job model: scraper runs via systemd timer (weekly for catalog, daily for availability), exits with named codes (`EXIT_OK`/`EXIT_PARTIAL`/`EXIT_FATAL`). Not a long-running daemon — each run is isolated, idempotent, and observable via exit status.

## Rationale

- **Legal defensibility.** SAQ's `robots.txt` explicitly lists sitemap URLs. Fetching only those URLs is the most conservative position. Adobe API is a public endpoint called by SAQ's own frontend — no auth bypass, no rate limit evasion.
- **Reliability.** Structured API responses don't break when SAQ redesigns their HTML. The sitemap still provides the full catalog (~38k SKUs, filtered to ~14k wine post-scrape).
- **Staged pipeline.** Each command can fail independently — enrichment failure doesn't block base scraping. Each stage is resumable and idempotent.
- **Batch over daemon.** A one-shot job with systemd `Persistent=true` is simpler to monitor (exit codes), debug (run manually), and schedule than a long-running process with internal timers. No heartbeat, no connection pool lifecycle, no graceful shutdown logic.

## Ethical constraints (self-imposed)

- Rate limit: minimum 2 seconds between requests
- Transparent User-Agent identification
- Never copy SAQ descriptions verbatim in user-facing output
- Always attribute SAQ as the data source
- Respect all `robots.txt` Disallow rules (`urllib.robotparser`)
- Abort if `robots.txt` is unreachable (fail-safe)

## Consequences

- Two external dependencies (SAQ website + Adobe API) instead of one. If Adobe changes their API, enrichment breaks but base scraping still works.
- Wine-only filtering happens post-scrape — the sitemap contains all categories (spirits, beer, cider).
- Five CLI commands instead of one, requiring coordination (Makefile target `scrape-all` runs them in order).
