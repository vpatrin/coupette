---
paths:
  - "scraper/**/*.py"
---

# Scraper (auto-loaded) — LEGAL CONSTRAINTS

Full context: [`domains/scraper.md`](../domains/scraper.md).

## Hard rules (non-negotiable)

1. **Sitemap-only fetching.** Any new URL fetched MUST come from one of the official SAQ sitemaps in `domains/scraper.md`. If the change implies fetching anything else, STOP and surface to Victor before writing code.
2. **Never fetch disallowed paths:** `/catalogsearch/`, `/catalog/product/view/`, filtered URLs (`?price`, `?availability`, etc.), `/checkout/`, `/customer/`, `/wishlist/`, admin paths.
3. **Rate limit.** 2-3 second minimum interval. Reuse the existing rate-limited client — never instantiate `requests.Session()` or `httpx.Client()` fresh.
4. **Paraphrase SAQ descriptions, never copy verbatim.** Always attribute SAQ as data source.
5. **Transparent User-Agent.** Identify the bot.

## Architecture

- Commands live in `scraper/scraper/commands/<name>.py`, dispatched from `__main__.py`
- New CLI command → new file in `commands/`, register in `__main__.py`, add Make target if interactive
- Embedding ingestion in `scraper/scraper/embed.py` + `scraper/scraper/db/embeddings.py` — coordinate with backend/services/sommelier.py if contract changes
