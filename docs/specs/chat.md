# Chat

> Multi-turn conversational wine assistant — Claude Haiku for intent classification, pgvector hybrid search for retrieval, Claude for curation. Persists sessions + messages in PostgreSQL.

## Contract

What the chat surface exposes:

| Operation | Endpoint | Notes |
|---|---|---|
| Create session | `POST /api/chat/sessions` | Title = first 50 chars of first message |
| List sessions | `GET /api/chat/sessions?limit=20&offset=0` | Ordered by `updated_at DESC` |
| Get session | `GET /api/chat/sessions/{id}` | Includes full message history |
| Rename session | `PATCH /api/chat/sessions/{id}` | Title max 50 chars |
| Delete session | `DELETE /api/chat/sessions/{id}` | Cascades to messages |
| Send message | `POST /api/chat/sessions/{id}/messages` | Returns assistant response (synchronous) |

All operations check session ownership (`user_id` match) via `Depends(verify_auth)`.

## How it works

```
User message → save to DB → extract multi-turn context → classify intent
  ├── recommendation → RAG pipeline → RecommendationOut (JSON) → save → return
  ├── wine_chat     → sommelier service → plain text → save → return
  └── off_topic     → static bilingual message → save → return
```

**Intent routing** — Claude Haiku classifies each message into one of three intents via tool_use:

| Intent | Trigger | Pipeline |
|---|---|---|
| `search_wines` (recommendation) | User wants product recommendations | Full RAG: embed → pgvector hybrid search → Claude curation |
| `wine_chat` (sommelier) | General wine knowledge — grapes, regions, pairing, history | Direct LLM response (2-4 paragraphs, no products) |
| `off_topic` | Non-wine query | Static bilingual "I'm a wine assistant — I can't help with that." |

Fallback behavior:
- API error → treat as `recommendation` with raw query
- No tool_use block in response → treat as `wine_chat`

**Multi-turn context** — sliding window of `CONTEXT_WINDOW_TURNS` (5) pairs = 10 messages max. Two windows for two purposes:

| Window | Size | Used for |
|---|---|---|
| Last 2 turns (4 messages) | Small | Intent parsing — resolves follow-ups ("something lighter") |
| Full sliding window (10 messages) | Large | Recommendation curation — personalizes explanations |

**SKU deduplication** — all assistant messages in the session are scanned to extract previously recommended SKUs. These are excluded from subsequent searches so the same wine is never recommended twice in a session.

**Recommendation pipeline integration** (when intent is `recommendation`):

1. **Embed** query via OpenAI `text-embedding-3-large`
2. **Search** via `find_similar()` — pgvector hybrid search with intent filters
3. **Curate** via Claude — generates per-product reasons + summary
4. **Assemble** `RecommendationOut` with products, reasons, intent, summary

Conversation history (full window) passed to curation for personalized explanations. Excluded SKUs passed to search to avoid repeats.

## Files

| Concern | Where |
|---|---|
| Chat API routes | `backend/api/chat.py` |
| Session repository | `backend/repositories/chat_sessions.py` |
| Message repository | `backend/repositories/chat_messages.py` |
| Intent classifier | `backend/services/intent.py` |
| Sommelier service (wine_chat path) | `backend/services/sommelier.py` |
| Recommendations service (search_wines path) | `backend/services/recommendations.py` |
| Chat session model | `core/db/models/chat_session.py` |
| Chat message model | `core/db/models/chat_message.py` |
| Schemas | `backend/schemas/chat.py`, `backend/schemas/recommendations.py` |
| Tests | `backend/tests/test_chat_*.py`, `test_intent_*.py` |

## Dependencies

- **`backend/services/intent.py`** — uses Claude Haiku via tool_use for classification
- **`backend/services/recommendations.py`** — full RAG pipeline (see [`rag.md`](rag.md))
- **`backend/services/sommelier.py`** — wine_chat persona prompt + Claude conversation
- **PostgreSQL** — `chat_sessions`, `chat_messages` tables
- **OpenAI embeddings** (`text-embedding-3-large`) — only on recommendation path
- **pgvector** — similarity search on the recommendation path

## Cross-cutting concerns

- **Auth:** every chat route uses `Depends(verify_auth)`; session ownership checked in the repository
- **Logging:** intent classification + RAG pipeline calls structured-logged via loguru
- **Errors:** intent classification failures fall back to `recommendation`; LLM API errors surface as 502
- **Observability:** Prometheus metrics on `intent_classifications`, `recommendation_pipeline_errors`, `llm_call_duration`, `llm_tokens` (see `backend/metrics.py`)
- **Rate limiting:** SlowAPI on the message-send endpoint

### Message storage

Messages stored in `chat_messages` table, indexed on `(session_id, created_at)`.

| Field | Type | Notes |
|---|---|---|
| `role` | str | `"user"` or `"assistant"` |
| `content` | text | Plain text (user/sommelier) or JSON (recommendations) |

**Serialization:** recommendation responses are stored as `RecommendationOut.model_dump_json()`. On retrieval, the API attempts `model_validate_json()` and falls back to raw text if deserialization fails (handles schema evolution).

**Empty sessions:** conversation history coerced to `None` (not empty string) for fresh sessions.

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

**Config constants:**

| Constant | Value | Purpose |
|---|---|---|
| `CONTEXT_WINDOW_TURNS` | 5 | Sliding window size (pairs) |
| `MAX_CHAT_MESSAGE_LENGTH` | 2000 | Input validation |
| `SESSION_TITLE_MAX_LENGTH` | 50 | Auto-generated title limit |
| `HAIKU_TEMPERATURE` | 0.3 | Intent parsing temperature |
| `DEFAULT_RECOMMENDATION_LIMIT` | 5 | Max products per recommendation |
| `NON_WINE_MESSAGE` | bilingual string | Off-topic / fallback response |

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
