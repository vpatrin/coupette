---
paths:
  - "bot/**/*.py"
---

# Telegram Bot

> Single source of truth for bot conventions. Read whenever editing anything in `bot/`.

## Architecture constraint — API-only, no DB

The bot has **no database access**. It calls the backend API via `bot/bot/api_client.py` (httpx). Never import SQLAlchemy, `core.db`, or `AsyncSession` here — that's a hard architectural boundary (see ADR-0003).

## Structure

File map and backend endpoints: [`docs/specs/bot.md`](../../docs/specs/bot.md). Presentation stays in `formatters.py`, keyboards in `keyboards.py`, pre-handler gates in `middleware.py` — handlers stay thin.

## Handler conventions

- One handler function per user action — no multi-purpose handlers
- Handlers receive `(update, context)` — extract user_id from `update.effective_user.id`
- Async everywhere — `async def`, `await` all API calls
- Errors: catch `(BackendUnavailableError, BackendAPIError)` from `bot.api_client`, surface a user-friendly message via `update.message.reply_text` — raw httpx errors never escape `BackendClient`
- Never `context.bot.send_message` when `update.message.reply_text` is available

## API client

- All backend calls through `BackendClient` — never raw `httpx.get/post` in handlers
- Sends the `X-Bot-Secret` header (shared secret, not JWT) — set once in `open()`, not per call
- `BackendClient` wraps httpx failures into `BackendAPIError` / `BackendUnavailableError`; each handler catches them and replies itself — unhandled exceptions fall through to the app-level error handler, which only logs (no user reply)

## Testing

- Mock `BackendClient`, not the DB or httpx directly
- Use `python-telegram-bot`'s test utilities for `Update`/`Context` objects
- No real API calls in tests — handlers must be testable with a mocked client
- See `bot/tests/` for existing patterns

## Env vars

Defined in `bot/bot/config.py` (pydantic-settings). `TELEGRAM_BOT_TOKEN` and `NOTIFICATION_POLL_INTERVAL` are required — startup fails without them. `BACKEND_URL` defaults to `http://localhost:8001` and `BOT_SECRET` defaults to `""` — both must be set explicitly in any deployed environment. An unset `BOT_SECRET` does not fail the **bot's** boot; the backend's production lifespan check in `backend/app.py` is what enforces it.
