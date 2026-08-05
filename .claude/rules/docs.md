---
paths:
  - "docs/**/*.md"
  - "README.md"
  - "CHANGELOG.md"
---

# Documentation, ADRs, Release

> Read whenever editing docs, README, CHANGELOG, or preparing a release.

## Documentation rules

- README is the table of contents — one-line descriptions linking to `docs/`. Details live in one place only.
- Each doc has a single owner topic — no duplication across files
- Cross-reference with relative links, don't copy content
- Keep docs concise — if it's long, split it
- Update docs when architecture changes, not as a standalone task
- README lists all docs with a one-liner

## Documentation boundaries (avoid mis-filing)

| Document | Repo | Scope |
|---|---|---|
| `docs/ROADMAP.md` | coupette | Product phases + cross-cutting UX/CD pipeline |
| `docs/ENGINEERING.md` backlog | coupette | App-level engineering quality |
| `docs/ROADMAP.md` | infra | Platform infrastructure |

User-noticeable change → coupette ROADMAP. Builds-better-not-user-visible → ENGINEERING. VPS / shared services → infra ROADMAP.

## ADRs (`docs/adrs/`)

Format: Context, Options, Decision, Rationale, Consequences. `NNNN-short-description.md`, 30-50 lines. Capture *why*, not *how*.

**Write an ADR for:**
- Choosing between real alternatives
- Decisions that are hard to reverse
- Decisions that need explaining to a future contributor

**Skip an ADR for:**
- Framework conventions
- Tooling with no meaningful alternative
- Implementation details that live in code comments

## Versioning + Release

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

Every version tag + deploy requires a dedicated Linear issue (team `Vpatrin`, labels `devops` + `chore`) with: pre-deploy checks, env var changes, infra prerequisites, migration order, post-deploy bootstrap, systemd updates, verification, rollback plan. The full body template lives in `.claude/commands/release.md` (step 5); historical GitHub issue #347 was the original reference.

## Session logs

Lifecycle and skip rules live in [`docs/session-logs/README.md`](../../docs/session-logs/README.md). The documenter agent writes one per pipeline run automatically; standalone `/document` uses judgment.

## Roadmap maintenance

When work completes a capability tracked in `docs/ROADMAP.md`, mark it `[x]` with the issue/PR ref. Only add new items for meaningful capabilities — roadmaps are strategic, not operational. This check is part of the `/pr` flow.
