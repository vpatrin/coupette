# Backend

> Business context for the FastAPI backend. Read before touching anything in `backend/`.

## Layout

```
backend/
├── api/             # Route handlers (13 routers, one per resource)
├── services/        # Business logic (17 files; sommelier, recommendations, intent, auth, oauth, ...)
├── repositories/    # Data access — async SQLAlchemy queries
├── schemas/         # Pydantic *In / *Out models (separate from SQLAlchemy)
├── auth.py          # JWT decode + verify_auth / verify_admin / require_bot_secret
├── errors.py        # Centralized exception handlers
├── config.py        # Backend-specific settings (cross-service settings live in core/)
└── tests/           # 21 pytest files, conftest.py with DB isolation autouse fixtures
```

## Conventions

- **Async all the way.** `AsyncSession` from SQLAlchemy 2.0. Routes are `async def`. Don't introduce sync DB calls.
- **Dependency injection everywhere.** Use `Depends(get_db)`, `Depends(verify_auth)`, `Depends(get_caller_user_id)`. Never instantiate sessions or auth checks inline.
- **Repository pattern.** Route → service → repository. Routes never query the DB directly. Services never raise HTTPException (they raise domain exceptions; errors.py translates).
- **Schemas separate from models.** `backend/schemas/` (Pydantic, API contract) is independent of `core/` (SQLAlchemy, persistence). One model maps to many schemas.
- **Lifespan validation.** In production mode, missing secrets fail-fast at startup. Add new secrets to the lifespan check.
- **Middleware stack.** SlowAPI (rate limit), CORS, Prometheus metrics. Add new middleware at the bottom of the stack unless ordering matters.

## Cross-references

- [`patterns/api-patterns.md`](../patterns/api-patterns.md) — route/service/repo split details (TBD; create when first useful)
- [`patterns/pydantic-patterns.md`](../patterns/pydantic-patterns.md) — schema naming
- [`patterns/testing-patterns.md`](../patterns/testing-patterns.md) — test conventions
- [`domains/auth.md`](./auth.md) — auth-specific rules
- [`domains/rag.md`](./rag.md) — sommelier + recommendations services
- [`domains/database.md`](./database.md) — prod DB queries
