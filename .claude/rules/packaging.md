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
- **Lock only (no version change):** `poetry lock` — since Poetry 2.0 this regenerates the lock from existing constraints without upgrading anything (`--no-update` was removed; the pinned Poetry version is `ARG POETRY_VERSION` in the service Dockerfiles + CI)
- **Python version:** `>=3.12,<4.0` across all services — don't introduce syntax newer than the Docker base image's Python (see the service Dockerfiles)

## Security patches

When pip-audit or Trivy flags a transitive dep:
1. Try `poetry update <pkg>` first — if a fix exists, Poetry resolves it
2. If the fix requires a major version of a transitive dep (e.g. starlette 1.x), evaluate the upgrade path before forcing it
3. Only when the fix is blocked by a hard dependency constraint, add the CVE to the matching ignore file — `.pip-audit-ignore` for pip-audit findings (Python deps), `.trivyignore` for Trivy findings (Docker images); a CVE flagged by both scanners goes in both. Always include a comment explaining why and a reference to the blocking dep

## Dependabot auto-merge policy

- **semver-patch / minor** — auto-merged unattended via `.github/workflows/dependabot-auto-merge.yml` (arms `gh pr merge --auto --squash` on open). The `/garden` gardener re-arms any that were red on open and only went green after a rebase.
- **semver-major** — never auto-merged. The gardener emits a **decision card** (breaking changes + blast radius + recommendation) in its digest; Victor approves and merges manually with `gh pr merge --squash`. Branch protection can't gate by update-type — it's per-branch and `main` requires no review — so the human gate is the decision card, not a required GitHub review.

## Frontend (Yarn)

- `yarn add <pkg>` for direct deps, `yarn upgrade <pkg>` for bumping
- Transitive dep version overrides go in `resolutions` in `package.json` — with the `_resolutions_comment` explaining why
- Remove a resolution entry once `yarn audit` passes without it
- `yarn.lock` is committed — always run `yarn install` after editing `package.json`

## Frontend security patches (yarn audit)

`yarn audit` surfaces advisories using npm advisory IDs (not CVE numbers). When `audit-frontend` CI fails:

1. Try `yarn upgrade <pkg>` first — if it resolves cleanly and all advisories clear, commit the updated `yarn.lock`. For direct devDependencies, `yarn upgrade` is the correct tool (resolutions don't override direct deps in yarn 1.x).
2. If the fix is blocked (e.g. Dependabot PRs each fix only one of two advisories, causing a circular dependency), add a `resolutions` override to `frontend/package.json` and run `yarn install` to update `yarn.lock`. Use the `_resolutions_comment` pattern already in the file. This is for **transitive** deps only — for direct devDependencies, use `yarn upgrade <pkg>`.
3. Never suppress advisories for packages that ship in the production bundle or process untrusted user input at runtime. Dev-only and Windows-only advisories (build tools, test runners, linters) are safe to suppress for this project.
4. **Do not add `--ignore-advisory` to the `Makefile`** — that flag does not exist in yarn 1.x (classic) and is silently ignored.
5. Remove `resolutions` entries once the patched package version lands in `yarn.lock` naturally.
