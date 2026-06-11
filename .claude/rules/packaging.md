---
paths:
  - "**/pyproject.toml"
  - "**/poetry.lock"
  - "frontend/package.json"
  - "frontend/yarn.lock"
---

# Packaging & Dependencies

> Read whenever editing pyproject.toml, poetry.lock, package.json, or yarn.lock.

## Python (Poetry)

**Four independent Poetry envs:** `core/`, `backend/`, `bot/`, `scraper/` each have their own `pyproject.toml`. `core/` is a path dependency in all others — changes there propagate on next `poetry install`.

- **Adding a direct dep:** `poetry add <pkg>` in the relevant service dir — updates both `pyproject.toml` and `poetry.lock`
- **Bumping a specific dep:** `poetry update <pkg>` — never edit version constraints in `pyproject.toml` by hand for lockfile-managed versions
- **Bumping a transitive dep:** `poetry update <pkg>` — do NOT add it as a direct dep just to pin it; Poetry's solver handles transitive versions
- **Lock only (no version change):** `poetry lock` — since Poetry 2.0 this regenerates the lock from existing constraints without upgrading anything (`--no-update` was removed; the project pins Poetry 2.3.2)
- **Python version:** `>=3.12,<4.0` across all services — do not introduce 3.13+ syntax until the Docker base image is updated

## Security patches

When pip-audit or Trivy flags a transitive dep:
1. Try `poetry update <pkg>` first — if a fix exists, Poetry resolves it
2. If the fix requires a major version of a transitive dep (e.g. starlette 1.x), evaluate the upgrade path before forcing it
3. Add to `.pip-audit-ignore` or `.trivyignore` only when the fix is blocked by a hard dependency constraint — always include a comment explaining why and a reference to the blocking dep

## Frontend (Yarn)

- `yarn add <pkg>` for direct deps, `yarn upgrade <pkg>` for bumping
- Transitive dep version overrides go in `resolutions` in `package.json` — with the `_resolutions_comment` explaining why
- Remove a resolution entry once `yarn audit` passes without it
- `yarn.lock` is committed — always run `yarn install` after editing `package.json`
