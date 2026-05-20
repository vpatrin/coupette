---
paths:
  - "backend/**/*.py"
---

# Backend (auto-loaded)

Full context: [`domains/backend.md`](../domains/backend.md), [`patterns/pydantic-patterns.md`](../patterns/pydantic-patterns.md).

## Critical reminders

- **Async only.** `AsyncSession` from SQLAlchemy 2.0. Routes are `async def`. Never introduce sync DB calls (`from sqlalchemy.orm import Session` is wrong).
- **Dependency injection.** Use `Depends(get_db)`, `Depends(verify_auth)`, `Depends(verify_admin)`, `Depends(get_caller_user_id)`. Never instantiate sessions or auth checks inline.
- **Route → service → repository.** Routes never query the DB directly. Services raise domain exceptions (`NotFoundError`, `ConflictError`, etc.), not `HTTPException` — `backend/errors.py` translates.
- **Schemas:** `*In` for requests, `*Out` for responses. Never `*Request` / `*Create` / `*Response`. Live in `backend/schemas/`, separate from `core/` SQLAlchemy models.
- **New secret?** Add to the production lifespan validation in `backend/main.py` so missing config fails fast.
- **Logging:** `from loguru import logger`. Structured placeholders: `logger.info("event: id={} user={}", id, user)` — never f-strings.
- **Auth-protected route?** Check both the per-route `Depends(...)` AND the `app.include_router(..., dependencies=[...])` mount site — protection may be applied at the router level.
