# Scraper

> Business and legal context for the SAQ scraper. Read before editing anything in `scraper/` or adding new fetch logic.

SAQ scraping is in a legal grey zone in Canada.
Approach chosen: sitemap-first (most defensible legally).

SAQ robots.txt is explicit about what is allowed and disallowed.
Full robots.txt: https://www.saq.com/robots.txt

Rules derived from robots.txt:
- ONLY fetch URLs from official SAQ sitemaps (explicitly listed in robots.txt)
- NEVER scrape /catalogsearch/ (Disallowed)
- NEVER scrape /catalog/product/view/ (Disallowed)
- NEVER scrape filtered URLs (?price, ?availability, ?appellation, etc.)
- NEVER scrape /checkout/, /customer/, /wishlist/ or any admin paths

Sitemap URLs (explicitly listed in robots.txt — this is our entry point):
- https://www.saq.com/media/sitemaps/fr/sitemap_product.xml
- https://www.saq.com/media/sitemaps/fr/sitemap_category.xml
- https://www.saq.com/media/sitemaps/fr/sitemap_toppicks.xml

Ethical scraping rules:
- Rate limit: minimum 2-3 seconds between requests
- User-Agent: transparent bot identification
- Paraphrase SAQ descriptions, never copy verbatim
- Always attribute SAQ as data source
