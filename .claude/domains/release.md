# Release & Versioning

> Read when cutting a tag, updating the changelog, or running `/tag`.

Single product version via git tags. No version bumps in `pyproject.toml`.

- **Semver**: PATCH for fixes, MINOR for new user-facing capabilities, MAJOR when it matters (not now)
- **Tag on main at deploy time**: `git tag v1.0.1 && git push --tags`
- **CHANGELOG.md** at root, [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format

## Changelog workflow

- Every PR that changes deployed behavior: add one line under `[Unreleased]` in the right category (part of `/pr` flow)
- Internal-only changes (CI, refactors, tests, docs, dependabot) stay out
- At deploy time: promote `[Unreleased]` → `[x.y.z] - YYYY-MM-DD`, add fresh `[Unreleased]`
- Mental test: would a user notice the change? Yes → changelog. No → skip.

Categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## Deploy issue template

Every version tag + deploy requires a dedicated GitHub issue with: pre-deploy checks, env var changes, infra prerequisites, migration order, post-deploy bootstrap, systemd updates, verification, rollback plan. See #347 as the template.
