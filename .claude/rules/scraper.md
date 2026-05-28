---
paths:
  - "scraper/**/*.py"
---

# Scraper — LEGAL CONSTRAINTS

> Single source of truth for SAQ scraping rules. Read whenever editing anything in `scraper/`.

SAQ scraping is a legal grey zone in Canada. Approach chosen: sitemap-first (most defensible). SAQ robots.txt is explicit about allowed/disallowed: <https://www.saq.com/robots.txt>

## Hard rules (non-negotiable)

1. **Sitemap-only fetching.** Any new URL fetched MUST come from one of the official SAQ sitemaps below. If a change implies fetching anything else, STOP and surface to Victor before writing code.
2. **Never fetch disallowed paths:** `/catalogsearch/` · `/catalog/product/view/` · filtered URLs (`?price`, `?availability`, `?appellation`, etc.) · `/checkout/` · `/customer/` · `/wishlist/` · any admin paths.
3. **Rate limit.** 2-3 second minimum interval between requests. Reuse the existing rate-limited client — never instantiate `requests.Session()` or `httpx.Client()` fresh.
4. **Paraphrase SAQ descriptions, never copy verbatim.** Always attribute SAQ as data source.
5. **Transparent User-Agent.** Identify the bot.

## Sitemap allowlist (the entry points)

- <https://www.saq.com/media/sitemaps/fr/sitemap_product.xml>
- <https://www.saq.com/media/sitemaps/fr/sitemap_category.xml>
- <https://www.saq.com/media/sitemaps/fr/sitemap_toppicks.xml>

## Architecture

- Commands live in `scraper/scraper/commands/<name>.py`, dispatched from `__main__.py`
- New CLI command → new file in `commands/`, register in `__main__.py`, add a Make target if interactively run
- Embedding ingestion in `scraper/scraper/embed.py` + `scraper/scraper/db/embeddings.py` — coordinate with `backend/services/sommelier.py` if the contract changes
