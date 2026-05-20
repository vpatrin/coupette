# Pydantic Patterns

> Auto-load when editing anything in `backend/schemas/` or adding new request/response models.

## Schema naming

- `*Out` for responses (e.g. `StoreOut`, `WineOut`)
- `*In` for request bodies (e.g. `WatchIn`, `LoginIn`)
- Avoid `*Response` / `*Create` — standardize on `*Out` / `*In` across all schemas

## Conventions

- Schemas live in `backend/schemas/`, separate from SQLAlchemy models in `core/`
- Schemas describe the API contract, not the domain — they're not 1:1 with DB models
- Field validation goes on the schema, not the route handler
- For complex shared field constraints (max length, format), extract to a reusable `Annotated[type, Field(...)]`
