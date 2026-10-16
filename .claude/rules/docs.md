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

Format: Context, Options, Decision, Rationale, Consequences. `NNNN-short-description.md`, 30-50 lines. Capture *why*, not *how*. Expect 5–15 a year.

**Write one only when all 4 tests pass** — otherwise the decision goes in the PR's Decisions section:

1. Real alternatives existed and were considered — a framework convention is not a decision.
2. Hard to reverse or expensive to change later: schema shape, public API contract, dependency choice, retrieval architecture, auth strategy. Not internal refactors, naming, or one-off tuning.
3. A future contributor would ask "why X?" and reading the code doesn't answer it.
4. Throughput: more than 4 ADRs in the last 30 days means the bar is too low.

**Amending:** an accepted ADR is immutable except for typos, links, clarifying examples, and status (`Superseded by [NNNN](NNNN-x.md)` on the old one). A changed decision is a new ADR.

## Keeping docs current

The coding session updates docs in the same PR as the behavior change; the reviewer blocks on a stale doc, rule, or spec.

- `docs/specs/<subsystem>.md` — when a public contract, data flow, operational gotcha (env var, secret, ordering), or file map changes. Edit only the affected sections; if more than ~30% of a spec is stale, flag it in the PR instead of rewriting it.
- `.claude/rules/*.md` — when a convention changes. Rules hold instructions and link to specs; they never restate them.
- `CHANGELOG.md` and `docs/ROADMAP.md` — see below.

## Versioning + Release

Single product version via git tags. No version bumps in `pyproject.toml`.

- **Semver**: PATCH for fixes, MINOR for new user-facing capabilities, MAJOR when it matters (not now)
- **Tag on main at deploy time:** Victor runs it; `/release` prints the exact commands. Cadence: after each shipped feature or milestone.
- **CHANGELOG.md** at root, [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format

## Changelog workflow

- Every PR that changes deployed behavior: add one line under `[Unreleased]` in the right category (part of `/pr` flow)
- Internal-only changes (CI, refactors, tests, docs, dependabot) stay out
- At deploy time: promote `[Unreleased]` → `[x.y.z] - YYYY-MM-DD`, add fresh `[Unreleased]`
- Mental test: would a user notice the change? Yes → changelog. No → skip.

Categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

## Deploy issue template

Every version tag + deploy requires a dedicated Linear issue (team `Vpatrin`, labels `devops` + `chore`) with: pre-deploy checks, env var changes, infra prerequisites, migration order, post-deploy bootstrap, systemd updates, verification, rollback plan. The full body template lives in `.claude/skills/release/SKILL.md` (step 5).

## Decisions, not session logs

No new session logs. Decisions live in the ticket (before code), then in the body of the commit that made each one (during code); `/pr` compiles them into the PR's Decisions section. Squash commits stay title-only and their `(#NNN)` links to the PR. The logs in `docs/session-logs/` stay as history.

## Roadmap maintenance

When work completes a capability tracked in `docs/ROADMAP.md`, mark it `[x]` with the issue/PR ref. Only add new items for meaningful capabilities — roadmaps are strategic, not operational. `/pr` checks it.
