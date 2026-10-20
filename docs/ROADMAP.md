# Roadmap

Product phases and cross-cutting work, one entry per capability. Issue-level progress lives in Linear, in each phase's project. Engineering backlog: [ENGINEERING.md](ENGINEERING.md). Platform infrastructure: [infra ROADMAP](https://github.com/vpatrin/infra/blob/main/docs/ROADMAP.md).

---

## Product

### Shipped

- **Phases 0–10** — scaffolding, scraping, data layer, API, Telegram bot, AI layer (RAG + Claude), auth and security, React frontend shell, chat endpoint and interface, intent router.
- **Visual Identity Rework** — a warm premium theme replaced the brutalist one: landing, login, chat, search, watchlist, stores, user menu, and a global wine detail panel. Mockups in `ui/`, screenshots in `ui/screenshots/`.
- **Tasting Journal** (phase 11) — 100-point ratings and tasting notes on SAQ catalog wines, a My Tastings page, "You rated" on search cards, and rating from the wine detail panel. Follow-ups: Linear project *Tasting Journal v2*. Mockups: `ui/journal/`.
- **Cellar** — bottles at home with quantities, a My Cellar page with +1/−1 controls, "In your cellar (×2)" on search cards, and the "Tu l'as bue?" remove flow. Mockups: `ui/cellar/`.
- **Waitlist and admin panel** — a waitlist with admin approval replaced invite codes; Resend sends the approval email.
- **OAuth login** — GitHub and Google with PKCE and signed state, linked accounts, and a Settings page (display name, language, delete account). See [ADR 0008](adrs/0008-oauth2-security-design.md).
- **Bilingual web app** — FR/EN with react-i18next and a language switcher.
- **Collapsible sidebar** — an icon-only 60 px mode with tooltips.
- **Bot alerts-only** — `/recommend` removed: the bot delivers alerts, the web app gives recommendations.

### Next

#### Taste Profile (phase 12)

Linear project: *Taste Profile*. A longitudinal user model built from watches, recommendation feedback, and tasting scores. Reflection-based memory: SQL aggregation for structured signals, Haiku extraction for prose (closed chat sessions, tasting notes), and a nightly Sonnet synthesis behind a debounce queue that writes four profile documents (palate, context, intent, behavior). The profile is injected as a synthetic first message for prompt-cache stability, and shown as a sidebar card after 5+ tastings or 3+ watches. Adventure temperature and cold-start onboarding come after the core pipeline. See [ADR 0007](adrs/0007-sommelier-memory-architecture.md). Mockup: `ui/taste-profile/palais.html`.

#### Weekly Digest

Linear project: *Weekly Digest*. A weekly, personalized summary of new and restocked wines that match the user's taste profile. A job queries the changes since the last run, filters them by profile, and has Claude summarize the top picks. Delivery is a Telegram DM (per user, not the group chat) linking to a digest page with full wine cards.

### Later

- **Passkeys (WebAuthn)** — Face ID, Touch ID, or Windows Hello for returning users; OAuth stays required for registration. Credentials table, registration and login ceremonies, management in Settings.
- **Custom email domain** — `contact@coupette.club` through Proton Mail (MX records on Hetzner DNS), as reply-to for `noreply@coupette.club`.

### Ideas (unscoped)

- Usage and model controls — Sonnet vs Haiku toggle, per-user API cost tracking, monthly limits
- Wine lists — named collections ("BBQ wines"), shareable by public link
- "Drink tonight" — a quick pick from the cellar for tonight's meal
- "My Year in Wine" — an annual recap (wines tasted, average score, top region), shareable
- Chat-driven journal entry — log a tasting in conversation ("just had the Mont-Redon, solid 88")
- Semantic search on your own tasting notes — "wines I liked with steak", pgvector on `tasting_notes`
- Rating aggregator — Vivino and critic scores, fuzzy name matching
- Price comparison vs France — SAQ prices against French retail (Wine-Searcher, Vinatis)
- Chrome extension — a floating "Watch" button on SAQ product pages
- OG share card — a branded 1200×630 social preview image (#640)
- Bilingual bot — per-user language and bilingual responses (#134, #151–#153)
- Wine tech sheets — enrichment beyond the SAQ catalog (fiches techniques, critic notes)
- Data retention policy — TTL for chat sessions, user data lifecycle, GDPR-adjacent posture
- Settings — notification preferences and data export
- Notification panel — in-app availability alerts (Telegram-only today)
- Progressive Web App — installable, offline shell, Web Push (`vite-plugin-pwa`); could replace Telegram for web-only users

---

## Cross-cutting

### UX

- Sidebar restructure — grouped nav (Discover / My Wines / My Stores) that scales with new phases
- Product card action overflow — an expandable row for 3+ actions (Watch visible, tasting and cellar on expand)
- Dark / light mode toggle — dark-only today; Tailwind `dark:` variant, `prefers-color-scheme` as the default
- Infinite scroll — on search results and the journal, with TanStack Query's `useInfiniteQuery` and an `IntersectionObserver` sentinel

### DevOps & CD pipeline

Shipped: weekly DB backups with 30-day retention, Trivy scans in CI, build + scan + push to GHCR and automated deploy on tag push, a GitHub Release with the changelog, a production environment scoped to `main` and `v*` tags with environment-scoped secrets, and an `on-main` CD job that rejects commits not on main (VPA-53). Process: [DEVELOPMENT.md](DEVELOPMENT.md#deploy). Open platform work lives in the [infra ROADMAP](https://github.com/vpatrin/infra/blob/main/docs/ROADMAP.md); the engineering backlog lives in [ENGINEERING.md](ENGINEERING.md#backlog).
