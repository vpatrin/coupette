# Scraper checklist

Applies when the diff touches `scraper/`. Legal constraints — see `rules/scraper.md`.

- **SCR-1** Every new URL fetched comes from an allowlisted SAQ sitemap.
- **SCR-2** No disallowed path is fetched (`/catalogsearch/`, `/catalog/product/view/`, filtered URLs, `/checkout/`, `/customer/`, `/wishlist/`, admin).
- **SCR-3** Fetches reuse the rate-limited client — no fresh `requests.Session()` or `httpx.Client()`.
- **SCR-4** A new fetch path has an explicit rate-limit test, with HTTP mocked at the boundary.
- **SCR-5** SAQ descriptions are paraphrased, never stored verbatim for user-facing use; SAQ is attributed as the data source.
- **SCR-6** The User-Agent identifies the bot.
