# Subsystem specs

Per-subsystem deep dives — how each part of Coupette actually works. Read before editing the subsystem.

For planned features see [`../ROADMAP.md`](../ROADMAP.md). For decisions with rejected alternatives see [`../adrs/`](../adrs/). For per-pipeline-run archaeology see [`../session-logs/`](../session-logs/).

| Spec | Code surface | Subsystem |
|---|---|---|
| [auth](auth.md) | `backend/auth.py` + OAuth services + waitlist | OAuth (Google, GitHub), JWT, Telegram notifications |
| [bot](bot.md) | `bot/` | Alert-only Telegram bot, stock events, store watches |
| [chat](chat.md) | `backend/services/sommelier.py` + frontend | Multi-turn chat, intent routing, context windowing |
| [frontend](frontend.md) | `frontend/src/` | React SPA, chat UI, sidebar, wine cards |
| [rag](rag.md) | `backend/services/recommendations.py` + embed | RAG pipeline, hybrid search, curation |
| [scraper](scraper.md) | `scraper/` | Adobe Live Search API, sitemap-only fetching, embedding sync |

Each spec follows the template at [`_template.md`](_template.md): contract · how it works · files · dependencies · cross-cutting concerns · operational notes · related.

For agent-facing rules on the same surfaces, see [`.claude/rules/`](../../.claude/rules/) (imperative form, auto-loaded by Claude when editing).
