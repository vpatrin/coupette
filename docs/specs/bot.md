# Telegram Bot

> Invite-only alerting bot — watches wines for availability changes that SAQ.com doesn't surface and sends each watcher a direct message from stock-event polling.

## Contract

What the bot exposes to Telegram users:

| Command | Description | Example |
|---|---|---|
| `/watch <sku or url>` | Get alerts for availability changes | `/watch 10327701` |
| `/unwatch <sku or url>` | Stop watching a wine | `/unwatch 10327701` |
| `/alerts` | List watched wines with inline remove buttons | `/alerts` |
| `/mystores` | Manage preferred SAQ stores (shared location) | `/mystores` |
| `/help` | List available commands | `/help` |
| `/start` | Help text; `start=watch_{sku}` deep link starts a watch | `t.me/CoupetteBot?start=watch_10327701` |
| `/recommend` | Deprecated stub — points to the web chat | `/recommend` |

`/watch` and `/unwatch` parse URLs that start with `https://www.saq.com/fr/`; anything else is sent as a raw SKU. Pasting a SAQ product URL (fr or en) in chat shows the product card with a "Watch this?" prompt. A reply keyboard mirrors `/alerts`, `/mystores`, and `/help`.

What the bot consumes from the backend (HTTP, `X-Bot-Secret` header on every call):

| Bot feature | API endpoint |
|---|---|
| Access check | `GET /api/auth/telegram/check` |
| `/watch`, `/unwatch` | `POST /api/watches`, `DELETE /api/watches/{sku}` |
| `/alerts` | `GET /api/watches` |
| Product lookup (URL paste) | `GET /api/products/{sku}` |
| Stock alerts | `GET /api/watches/notifications`, `PATCH /api/watches/notifications` (ack) |
| Stores | `GET /api/stores/nearby`, `GET/POST /api/stores/preferences`, `DELETE /api/stores/preferences/{saq_store_id}` |

## How it works

The bot is a separate Python service (`bot/`) running 24/7 with python-telegram-bot's JobQueue. It calls the FastAPI backend over HTTP — **no direct database access** (see [ADR 0003](../adrs/0003-bot-as-api-client.md)).

```
Telegram API → Bot service → FastAPI backend → PostgreSQL
```

**Stock-event flow** (event-driven pub/sub via PostgreSQL as the queue):

```
Scraper (availability, scrape)        Bot JobQueue (every NOTIFICATION_POLL_INTERVAL)
  │                                     │
  │ availability changed / delisted?    │ GET /api/watches/notifications
  │         │                           │         │
  │    INSERT stock_events              │    stock_events × watches
  │    (sku, available, store?)         │    (× user_store_preferences for store events)
  │                                     │    WHERE processed_at IS NULL, max 100
  │                                     │         │
  │                                     │    One DM per (user, product, direction)
  │                                     │         │
  │                                     │    PATCH /api/watches/notifications
  │                                     │    (set processed_at = now)
```

The scraper records availability transitions and delists as immutable `stock_events`. The bot polls the backend, groups events per user and product, and sends one direct message per group.

**Known bug (not fixed here):** the `availability` command writes the new availability before it reads the "previous" state, so online and store transitions never produce an event. Only delist events reach users today.

**Availability model:**

- **Out of stock** — `online_availability` flips `True → False`, or a product that was online disappears from the Adobe results
- **Online restock** — `online_availability` flips `False → True`
- **In-store restock/destock** — stock change at one of the user's preferred stores (event carries `saq_store_id`)
- **Delist** — product removed from the SAQ catalog; the backend deletes the watches on ack

**Access:** the `access_gate` middleware checks each Telegram user against `GET /api/auth/telegram/check` (registered, active, Telegram linked) and caches a positive answer for 1 hour. If the backend is unreachable, the gate lets the user through.

**Web-app watches:** watches created in the web app are stored as `user:{id}`. The bot only maps `tg:{telegram_id}` ids to a chat, so it skips (and acks) events for web-app watches.

## Files

| Concern | Where |
|---|---|
| Entry point | `bot/bot/__main__.py` → `create_app()` in `bot/bot/app.py` (handler registration, notification job) |
| Backend HTTP client (the only way to the data) | `bot/bot/api_client.py` |
| Pre-handler gates (access check, per-user rate limit) | `bot/bot/middleware.py` |
| `/alerts` handler | `bot/bot/handlers/watch.py` |

## Dependencies

- **Backend `/api/*`** — every operation goes through the FastAPI backend
- **PostgreSQL `stock_events` table** — scraper writes, backend reads for `/api/watches/notifications`, bot consumes
- **python-telegram-bot** library — long-polling client + JobQueue

## Cross-cutting concerns

- **Auth:** invite-only via the access gate (above). Bot → backend via `X-Bot-Secret`. See [`../SECURITY.md`](../SECURITY.md) → Bot access gate.
- **Logging:** `from loguru import logger`, structured placeholders (see [`.claude/rules/backend.md`](../../.claude/rules/backend.md) — same convention).
- **Errors:** a failed Telegram send is logged and the events are acked anyway (a user who blocked the bot would otherwise be retried forever). A failed ack leaves the batch pending, so it is sent again on the next poll.
- **Observability:** none specific to the bot (no Prometheus).
- **Rate limiting:** inbound only — `rate_limit_gate` drops updates above 3 per second per user. No outbound limiter is configured.

### Schema: `stock_events`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `sku` | FK → products | Which product changed |
| `available` | boolean | New state: `True` = restock, `False` = destock or delist |
| `saq_store_id` | FK → stores, NULL | Store for in-store events; `NULL` = online event |
| `detected_at` | timestamptz | When the scraper detected the change |
| `processed_at` | timestamptz NULL | When the bot acked it (`NULL` = pending) |

**Design choices:**
- **Restock + destock** — the scraper emits both transitions; users get notified in both directions
- **`processed_at` per-event, not per-user** — one event fans out to all watchers in a single pass. A per-user `notifications(event_id, user_id, sent_at)` table would be needed at scale but is over-engineering now
- **Bot polls via JobQueue** — the bot runs 24/7 anyway; polling is simpler than chaining a systemd unit after the scraper timer
- **Retention** — the scraper deletes every event older than `STOCK_EVENT_RETENTION_DAYS` (7), processed or not, after each `availability` and `scrape` run

## Operational notes

- **Env vars** (`bot/bot/config.py`): `TELEGRAM_BOT_TOKEN` and `NOTIFICATION_POLL_INTERVAL` (seconds; 60 dev, 21600 prod) are required. `BACKEND_URL`, `BOT_SECRET`, `BACKEND_TIMEOUT`, `LOG_LEVEL` have defaults.
- **Lifespan:** the bot runs as a long-polling client; restart with `docker compose restart bot`. The first notification poll runs at startup.
- **Failure mode:** if the backend is unreachable, the bot logs the failure and skips that poll — events stay pending (`processed_at` NULL) until the next one, within the 7-day retention.
- **Not in scope yet:** weekly LLM-curated digest (#120).

## Related

- **ADRs:** [`0003-bot-as-api-client.md`](../adrs/0003-bot-as-api-client.md), [`0004-telegram-first-auth.md`](../adrs/0004-telegram-first-auth.md)
- **Agent rules (imperative form):** [`.claude/rules/bot.md`](../../.claude/rules/bot.md)
