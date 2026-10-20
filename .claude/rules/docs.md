---
paths:
  - "docs/**/*.md"
  - "README.md"
  - "CHANGELOG.md"
---

# Documentation and ADRs

> Read whenever editing docs or the README.

## Documentation rules

- README is the table of contents — one-line descriptions linking to `docs/`. Details live in one place only.
- Each doc has a single owner topic — no duplication across files
- Cross-reference with relative links, don't copy content
- Keep docs concise — if it's long, split it
- Update docs when architecture changes, not as a standalone task
- README lists all docs with a one-liner

## Where plans live

Product direction, features and their tickets live in Linear (team EXP), not in `docs/`. The crew's running state lives in `ops/` (`STATUS.md`, the journal, `tasks.jsonl`). `ops/inherited/` is Victor's past bets: only the strategist reads it (its README says how).

## ADRs (`docs/adrs/`)

Format: Context, Options, Decision, Rationale, Consequences. `NNNN-short-description.md`, 30-50 lines. Capture *why*, not *how*. Expect 5–15 a year.

**Write one only when all 4 tests pass** — otherwise the decision goes in the commit body and the journal's Decisions line. A stack change always needs one (charter rule 7).

1. Real alternatives existed and were considered — a framework convention is not a decision.
2. Hard to reverse or expensive to change later: schema shape, public API contract, dependency choice, retrieval architecture, auth strategy. Not internal refactors, naming, or one-off tuning.
3. A future contributor would ask "why X?" and reading the code doesn't answer it.
4. Throughput: more than 4 ADRs in the last 30 days means the bar is too low.

**Amending:** an accepted ADR is immutable except for typos, links, clarifying examples, and status (`Superseded by [NNNN](NNNN-x.md)` on the old one). A changed decision is a new ADR.

## Keeping docs current

The builder updates docs in the same PR as the behavior change. A spec that no longer matches the code is an Important review finding: other agents plan from it.

Every doc in `docs/` has one update trigger, listed here and nowhere else. A doc with no trigger gets merged into another one or deleted.

| Doc (under `docs/` unless noted) | Update trigger |
|---|---|
| `README.md` | A doc is added, removed, or renamed |
| `ARCHITECTURE.md` | A new container or subsystem |
| `adrs/` | The 4-test ADR gate passes |
| `specs/` | A contract changes |
| `SECURITY.md` | An auth or risky-lane change |
| `DEVELOPMENT.md` | A dev tooling change |
| `SCALING.md` | A tier changes |
| `ops/journal/` (repo root) | Every ticket (the worker appends its entry) |
| `ops/STATUS.md` (repo root) | Every wake (the lead, never committed) |
| `ops/inherited/` (repo root) | None: frozen past bets |

A folder's `README.md` and template follow the folder's trigger.

- `docs/specs/<subsystem>.md` — a contract here means a public contract, data flow, operational gotcha (env var, secret, ordering), or file map. Edit only the affected sections; if more than ~30% of a spec is stale, say so in the journal's Friction line; the lead files an `improvement` ticket to rewrite it.
- `.claude/rules/*.md` — when a convention changes. Rules hold instructions and link to specs; they never restate them.
- When a change makes a fixed behavior conditional (shared → shared by default), grep `.claude/skills .claude/rules docs` for sentences that still state the old behavior as a fact.

## No releases

`exp/agentic` never ships: no git tags, no version bumps, no deploy issues. `CHANGELOG.md` is the main lane's release history; the crew leaves it alone. What changed is in the journal and the PRs.

## Decisions, not session logs

Decisions live in the ticket (before code), then in the body of the commit that made each one (during code), then in the journal entry's Decisions line. Squash commits stay title-only and their `(#NNN)` links to the PR.
