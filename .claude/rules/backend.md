---
paths:
  - "backend/**/*.py"
---

# Backend

> Single source of truth for FastAPI conventions, Pydantic schema naming, dependency injection. Read whenever editing anything in `backend/`.

## Layout

```
backend/
├── api/             # Route handlers (13 routers, one per resource)
├── services/        # Business logic (sommelier, recommendations, intent, auth, oauth, ...)
├── repositories/    # Data access — async SQLAlchemy queries
├── schemas/         # Pydantic *In / *Out models (separate from SQLAlchemy)
├── auth.py          # JWT decode + verify_auth / verify_admin / require_bot_secret
├── errors.py        # Centralized exception handlers
├── config.py        # Backend-specific settings (cross-service settings live in core/)
└── tests/           # pytest, conftest.py with DB isolation autouse fixtures
```

## Conventions

- **Async all the way.** `AsyncSession` from SQLAlchemy 2.0. Routes are `async def`. Don't introduce sync DB calls — `from sqlalchemy.orm import Session` is wrong here.
- **Dependency injection everywhere.** Use `Depends(get_db)`, `Depends(verify_auth)`, `Depends(verify_admin)`, `Depends(get_caller_user_id)`. Never instantiate sessions or auth checks inline.
- **Route → service → repository.** Routes never query the DB directly. Services raise domain exceptions (`NotFoundError`, `ConflictError`, etc.), not `HTTPException` — `backend/errors.py` translates.
- **Schemas separate from models.** `backend/schemas/` (Pydantic, API contract) is independent of `core/` (SQLAlchemy, persistence). One model maps to many schemas.
- **Lifespan validation.** Production mode fails fast if any secret is missing. Add new secrets to the lifespan check in `backend/main.py`.
- **Middleware stack.** SlowAPI (rate limit), CORS, Prometheus metrics. Add new middleware at the bottom unless ordering matters.

## Pydantic schema naming

- `*Out` for responses (e.g. `StoreOut`, `WineOut`)
- `*In` for request bodies (e.g. `WatchIn`, `LoginIn`)
- Never `*Request` / `*Create` / `*Response` — standardize on `*Out` / `*In`
- Field validation goes on the schema, not the route handler
- Complex shared field constraints (max length, format) → reusable `Annotated[type, Field(...)]`

## Logging

- `from loguru import logger` (universal, no `import logging`)
- Structured placeholders: `logger.info("event: id={} user={}", id, user)` — never f-strings
- Token values, OAuth `access_token`, JWT, bot secret NEVER appear as a log argument or in a formatted string

## Database

- DB container: `shared-postgres` · DB: `saq_sommelier` · User: `saq_sommelier`
- Other DBs on same instance (do NOT touch): `umami`, `url_shortener`
- Prod query: `sudo docker exec shared-postgres psql -U saq_sommelier -d saq_sommelier -c "SELECT ..."`
