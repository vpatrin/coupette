# Telegram Bot

> Proactive alerting bot for ~20 friends in a private group — watches wines for availability changes that SAQ.com doesn't surface, alerts via stock-event polling.

## Contract

What the bot exposes to Telegram users:

| Command | Description | Example |
|---|---|---|
| `/watch <sku or url>` | Get alerts for availability changes | `/watch 10327701` |
| `/unwatch <sku or url>` | Stop watching a wine | `/unwatch 10327701` |
| `/alerts` | List watched wines with inline remove buttons | `/alerts` |
| `/mystores` | Manage preferred SAQ stores (GPS-based) | `/mystores` |
| `/help` | List available commands | `/help` |

Pasting a SAQ product URL in chat triggers a "Watch this?" prompt automatically. Deep links (`t.me/bot?start=watch_{sku}`) trigger watch directly.

What the bot consumes from the backend (HTTP, with `X-Bot-Secret` header):

| Bot feature | API endpoint | Status |
|---|---|---|
| `/watch` | `POST /watches`, `DELETE /watches/{sku}` | Done (#101) |
| `/alerts` | `GET /watches?user_id=` | Done (#101) |
| Product lookup (URL paste) | `GET /products/{sku}` | Done (#34) |
| Stock alerts | `GET /watches/notifications`, `POST /watches/notifications/ack` | Done (#138, #212) |
| Stores | `GET /stores/nearby`, `GET/POST/DELETE /users/{id}/stores` | Done (#232) |

## How it works

The bot is a separate Python service (`bot/`) running 24/7 with python-telegram-bot's JobQueue. It calls the FastAPI backend over HTTP — **no direct database access** (see [ADR 0003](../adrs/0003-bot-as-api-client.md)).

```
Telegram API → Bot service → FastAPI backend → PostgreSQL
```

**Stock-event flow** (event-driven pub/sub via PostgreSQL as the queue):

```
Scraper upsert                        Bot JobQueue (periodic, 6h)
  │                                     │
  │ availability changed?               │ GET /watches/notifications
  │         │                           │         │
  │    INSERT stock_events              │    JOIN stock_events × watches
  │    (sku, available=True/False)      │    WHERE processed_at IS NULL
  │                                     │         │
  │                                     │    Send Telegram messages
  │                                     │         │
  │                                     │    POST /watches/notifications/ack
  │                                     │    (set processed_at = now)
```

The scraper detects availability transitions during upsert (it has both old and new state) and records them as immutable `stock_events`. The bot polls the backend periodically and fans out notifications to watchers.

**Availability model:**

- **Out of stock** — `availability` flips `True → False`
- **Online restock** — `availability` flips `False → True`
- **In-store restock/destock** — stock change at user's preferred stores
- **Delist** — product removed from SAQ catalog entirely (watch auto-removed)

Delisted products are always excluded from the backend API.

## Files

| Concern | Where |
|---|---|
| Entry point | `bot/bot/__main__.py` |
| Handlers | `bot/bot/handlers/` (watch, alerts, mystores, start) |
| Backend HTTP client | `bot/bot/api_client.py` |
| Formatters (message shape) | `bot/bot/formatters.py` |
| Tests | `bot/tests/` (pytest) |

## Dependencies

- **Backend `/api/*`** — every operation goes through the FastAPI backend
- **`X-Bot-Secret` header** on notification endpoints (shared secret, gitignored, lifespan-validated in prod)
- **PostgreSQL `stock_events` table** — owned by scraper (writer), backend (reader for `/watches/notifications`), bot (consumer)
- **python-telegram-bot** library — long-polling client + JobQueue

## Cross-cutting concerns

- **Auth:** none for users (private group, ~20 friends — see [ADR 0004](../adrs/0004-telegram-first-auth.md) for the broader auth strategy). Bot→backend auth via `X-Bot-Secret`.
- **Logging:** `from loguru import logger`, structured placeholders (see [`.claude/rules/backend.md`](../../.claude/rules/backend.md) — same convention).
- **Errors:** failures sending Telegram messages logged + retried by JobQueue on next pass.
- **Observability:** none specific to bot beyond Prometheus on the backend side.
- **Rate limiting:** Telegram's own rate limits respected via python-telegram-bot's built-in queue.

### Schema: `stock_events`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `sku` | FK → products | Which product changed |
| `available` | boolean | New state: `True` = restock, `False` = destock |
| `detected_at` | timestamptz | When scraper detected the change |
| `processed_at` | timestamptz NULL | When bot sent notifications (`NULL` = pending) |

**Design choices:**
- **Restock + destock** — scraper emits both transitions; users get notified in both directions
- **`processed_at` per-event, not per-user** — at 20 users, one event fans out to all watchers in a single pass. A per-user `notifications(event_id, user_id, sent_at)` table would be needed at scale but is over-engineering now
- **Bot polls via JobQueue** — bot runs 24/7 anyway; periodic 6h check is simpler than chaining a systemd unit after the scraper timer
- **Periodic cleanup** — old processed events purged to prevent table bloat (#158)

## Operational notes

- **Env vars:** `TELEGRAM_BOT_TOKEN` (the bot's Telegram API token), `BOT_SECRET` (shared with backend), `BACKEND_URL`
- **Lifespan:** bot runs as a long-polling client; restart with `docker compose restart bot`
- **Failure mode:** if the backend is unreachable, the bot logs the failure and skips that JobQueue cycle — no message loss because `processed_at` stays NULL
- **Not in scope yet:** weekly LLM-curated digest to the group chat (#120); per-user auth (would need real OAuth — not justified at 20 friends)

## Related

- **ADRs:** [`0003-bot-as-api-client.md`](../adrs/0003-bot-as-api-client.md), [`0004-telegram-first-auth.md`](../adrs/0004-telegram-first-auth.md)
- **Agent rules (imperative form):** none yet — bot work falls through the orchestrator to the generic `implementer` agent loading the `.claude/rules/backend.md` rule
- **Recent session logs:** look up via [`../session-logs/INDEX.md`](../session-logs/INDEX.md)
