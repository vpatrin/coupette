# Deprecate the bot's `/recommend` command

**Type:** feature
**Surfaces:** bot
**Needs migration:** no
**Branch:** feat/bot-deprecate-recommend

## Goal

The Telegram bot exposes `/recommend <query>` which runs the full recommendation pipeline inside chat. We're consolidating the recommendation UX into the web app, where chat sessions, history, and richer interactions live. The bot keeps a stub handler so anyone typing `/recommend` (or tapping the legacy menu button, if kept) gets a short, friendly message pointing them to coupette.club instead of a "command not found" silence. The backend `/recommendations` endpoint is unaffected — the web app still uses it.

## Acceptance criteria

- [ ] Invoking `/recommend` (with or without arguments) replies with a short deprecation message that includes a clickable link to `https://coupette.club/chat`
- [ ] The deprecation message uses the name "Coupette" and contains no SAQ affiliation phrasing
- [ ] `/help` and `/start` output no longer advertise `/recommend` as an available command
- [ ] The `🤖 Recommend` reply-keyboard button no longer appears in `MAIN_MENU` (see open question if we keep it as a soft redirect)
- [ ] No bot handler calls `BackendClient.recommend()` anymore
- [ ] Existing `tests/test_recommend.py` is rewritten to assert the deprecation copy + link; `tests/test_start.py` is updated so `/recommend` is no longer expected in help text
- [ ] CI green (lint, format, tests) for the `bot/` service

## Out of scope

- Removing or changing the backend `POST /api/recommendations` endpoint (web app depends on it)
- Frontend changes (the destination page already exists at `/chat`)
- Telegram BotFather command-list update (Victor will do this manually after deploy)
- DB migration (none needed)

## Surfaces touched

| Path | Change kind |
|---|---|
| `bot/bot/handlers/recommend.py` | replace handler body with deprecation reply (or delete file — see open question) |
| `bot/bot/handlers/start.py` | drop the Recommend block from `HELP_TEXT` |
| `bot/bot/keyboards.py` | remove `MENU_RECOMMEND` button from `MAIN_MENU` (pending open question) |
| `bot/bot/app.py` | remove or repoint the `CMD_RECOMMEND` + `MENU_RECOMMEND` handler registrations |
| `bot/bot/config.py` | remove `MENU_RECOMMEND` (and `CMD_RECOMMEND` if handler is deleted) |
| `bot/tests/test_recommend.py` | rewrite to cover the deprecation message |
| `bot/tests/test_start.py` | update help-text assertions |
| `bot/bot/api_client.py`, `bot/bot/formatters.py`, `bot/tests/test_api_client.py`, `bot/tests/test_formatters.py` | optional cleanup of now-dead `recommend()` / `format_recommendations()` — pending open question |

## Open questions

- Keep the `🤖 Recommend` menu button as a soft redirect to the deprecation message, or remove it from the keyboard entirely? (Default suggestion: remove — cleaner, and the deprecation message stays reachable via `/recommend`.)
- Delete the now-unused `BackendClient.recommend()`, `format_recommendations()`, and their tests, or leave them as the web/backend still uses the same payload shape? (Default suggestion: delete from `bot/` — backend has its own tests; the bot shouldn't carry dead client code.)
- Confirm the destination URL. Default: `https://coupette.club/chat` (the web app's chat entrypoint). Alternative: `https://coupette.club` (landing).

## Risks

- Users with the old reply keyboard cached on their device may still see `🤖 Recommend` until Telegram refreshes it on next `/start` — message handler should still route gracefully if we keep it; if removed, taps fall through to the URL-paste regex with no harm.
- BotFather command list will be out of sync until Victor updates it — `/recommend` will still autocomplete in clients but now returns the deprecation message (acceptable).
