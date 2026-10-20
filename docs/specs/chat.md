# Chat

> Multi-turn conversational wine assistant — Claude Haiku for intent classification, pgvector hybrid search for retrieval, Claude for curation. Persists sessions + messages in PostgreSQL.

## Contract

What the chat surface exposes:

| Operation | Endpoint | Notes |
|---|---|---|
| Create session | `POST /api/chat/sessions` | Body carries the first message; title = its first 50 chars. The client then sends that message |
| List sessions | `GET /api/chat/sessions?limit=20&offset=0` | Ordered by `updated_at DESC`; `limit` max 100 |
| Get session | `GET /api/chat/sessions/{session_id}` | Includes full message history |
| Rename session | `PATCH /api/chat/sessions/{session_id}` | Title 1–50 chars |
| Delete session | `DELETE /api/chat/sessions/{session_id}` | Messages go with it (FK `ON DELETE CASCADE`) |
| Send message | `POST /api/chat/sessions/{session_id}/messages` | Returns the assistant message (synchronous) |

Every route depends on `get_current_active_user`, so chat is JWT-only (a bot-secret caller has no user). The service checks ownership: an unknown session → 404, another user's session → 403. Listing filters by the caller's `user_id`.

## How it works

```
User message → save to DB → load session history → classify intent
  ├── recommendation → RAG pipeline → RecommendationOut (JSON) → save → return
  ├── wine_chat     → sommelier service → plain text → save → return
  └── off_topic     → static bilingual message → save → return
```

**Intent routing** — Claude Haiku (temperature 0, `tool_choice=auto`) picks one of three tools; the tool maps to the intent:

| Tool → intent | Trigger | Pipeline |
|---|---|---|
| `search_wines` → `recommendation` | User wants product recommendations | Full RAG: embed → pgvector hybrid search → Claude curation |
| `wine_chat` → `wine_chat` | General wine knowledge — grapes, regions, pairing, history | Sommelier: direct LLM answer, no products |
| `off_topic` → `off_topic` | Non-wine query | Static bilingual `NON_WINE_MESSAGE` |

Fallback behavior:
- No API key or API error → `recommendation` with the raw query as `semantic_query`
- No tool_use block in the response → `wine_chat`

**Multi-turn context** — the user message is saved first, then the history is read back, so it always ends with the current message. History is built from the last `CONTEXT_WINDOW_TURNS × 2` (10) messages as `User: …` / `Assistant: …` lines; a recommendation contributes its summary, any other assistant text its first 200 chars.

| Consumer | What it gets | Purpose |
|---|---|---|
| Intent classifier | Last 4 history lines (the current message included) | Resolve follow-ups ("something lighter") |
| Curation and sommelier | All history lines | Personalize the answer |

**SKU deduplication** — every recommendation in the session is parsed for its SKUs, and those are excluded from the next search, so a wine is never recommended twice in a session.

**Recommendation path** — `recommend()` in `backend/services/recommendations.py` (see [`rag.md`](rag.md)): embed the query, `find_similar()` with the intent filters and excluded SKUs, curation writes one reason per wine plus a summary, then assemble `RecommendationOut`.

## Files

| Concern | Where |
|---|---|
| Orchestration (ownership, history, routing) | `backend/services/chat.py` |
| Intent classifier | `backend/services/intent.py` |
| Sommelier (wine_chat path) | `backend/services/sommelier.py` |
| Recommendations (recommendation path) | `backend/services/recommendations.py` |
| Models (`ChatSession`, `ChatMessage`) | `core/db/models.py` |
| Schemas | `backend/schemas/chat.py`, `backend/schemas/recommendation.py` |

## Dependencies

- **Claude Haiku 4.5** — intent classification and the sommelier
- **RAG pipeline** — see [`rag.md`](rag.md)
- **PostgreSQL** — `chat_sessions`, `chat_messages` tables
- **OpenAI embeddings** (`text-embedding-3-large`) — only on the recommendation path
- **pgvector** — similarity search on the recommendation path

## Cross-cutting concerns

- **Auth:** JWT via `get_current_active_user` on every route; ownership checked in the service
- **Logging:** loguru — warnings and errors on LLM failures, intent at DEBUG; the recommendation path also writes a `recommendation_logs` row (see [`rag.md`](rag.md))
- **Errors:** no LLM failure maps to an error status. Intent failures fall back (above); a curation failure returns the products with empty reasons; a sommelier failure returns a fixed English "I'm having trouble connecting right now…" message, saved as the reply. An embedding (OpenAI) failure is re-raised and returns 500
- **Observability:** Prometheus `intent_classifications`, `recommendation_pipeline_errors`, `llm_call_duration`, `llm_tokens` (see `backend/metrics.py`)
- **Rate limiting:** SlowAPI `RATE_LIMIT_LLM` (20/min) on send-message

### Message storage

Messages stored in `chat_messages` table, indexed on `(session_id, created_at)`.

| Field | Type | Notes |
|---|---|---|
| `role` | str | `"user"` or `"assistant"` |
| `content` | text | Plain text (user/sommelier) or JSON (recommendations) |

**Serialization:** recommendation responses are stored as `RecommendationOut.model_dump_json()`. On retrieval, the API attempts `model_validate_json()` and falls back to raw text if deserialization fails (handles schema evolution).

### Intent classifier — extracted filters (search_wines)

When Claude classifies as `search_wines`, it extracts structured filters:

| Filter | Type | Example |
|---|---|---|
| `categories` | list[str] | `["Vin rouge"]` |
| `min_price`, `max_price` | Decimal | `20.00`, `30.00` |
| `country` | str, nullable | `"France"` |
| `semantic_query` | str | `"bold tannic red for grilled steak"` |
| `exclude_grapes` | list[str] | `["Merlot"]` |

Key prompt rules:
- Always infer categories from context (food → wine type)
- Price heuristics: "autour de 25$" → ±20%, "moins de 30$" → max only
- `semantic_query` must include grape names (embeddings use them)
- `exclude_grapes` populated on fatigue cues ("tanné de", "tired of")

## Operational notes

**Config:**

| Name | Value | Where | Purpose |
|---|---|---|---|
| `CONTEXT_WINDOW_TURNS` | 5 | `backend/config.py` | History window (pairs) |
| `DEFAULT_RECOMMENDATION_LIMIT` | 5 | `backend/config.py` | Products per recommendation |
| `NON_WINE_MESSAGE` | bilingual string | `backend/config.py` | Off-topic response |
| `MAX_CHAT_MESSAGE_LENGTH` | 2000 | `backend/schemas/chat.py` | Input validation |
| `SESSION_TITLE_MAX_LENGTH` | 50 | `backend/schemas/chat.py` | Session title limit |
| `HAIKU_TEMPERATURE` | 0.3 (env) | `backend/config.py` | Curation and sommelier temperature; `make eval` sets 0. Intent always uses 0 |

**Conversation starters** (frontend only, on empty chat):
- "A bold red under $30"
- "What pairs with lamb?"
- "What's the difference between Syrah and Shiraz?"
- "Explore wines from Argentina"

Rendered as clickable prompt chips; on click, submitted as a regular message.

**Design constraints:**
- **Synchronous responses** — no SSE streaming. The full pipeline completes before the API returns. Frontend shows "Thinking..." while waiting.

## Related

- **ADRs:** [`0005-rag-pipeline.md`](../adrs/0005-rag-pipeline.md), [`0007-sommelier-memory-architecture.md`](../adrs/0007-sommelier-memory-architecture.md)
- **Agent rules (imperative form):** [`.claude/rules/rag.md`](../../.claude/rules/rag.md), [`.claude/rules/llm.md`](../../.claude/rules/llm.md)
- **Related specs:** [`rag.md`](rag.md) (the retrieval pipeline this calls)
- **Recent session logs:** look up via [`../session-logs/INDEX.md`](../session-logs/INDEX.md)
