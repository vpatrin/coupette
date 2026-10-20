# Coupette Docs

## Start here

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design in 1 page
- [DEVELOPMENT.md](DEVELOPMENT.md) — local setup, dev workflow

## Subsystem deep dives

- [specs/](specs/) — per-subsystem (auth, chat, rag, scraper, bot, frontend)
- Each spec uses the [template](specs/_template.md)

## Operations

- [SECURITY.md](SECURITY.md) — threat model, controls, posture
- [SCALING.md](SCALING.md) — operational scaling notes

## Decisions

- [adrs/](adrs/) — significant technical decisions (rare, formal)

## Planning

Product direction, features and their tickets live in Linear (team EXP). The crew's state lives in [`../ops/`](../ops/): `STATUS.md`, the journal, and the contracts between its parts.

---

## How docs integrate with Claude

Each doc has clear consumers. Most are read on demand rather than auto-loaded.

| Doc | Who reads it | When |
|---|---|---|
| `SECURITY.md` | worker on the risky lane · `/security-review` context | Auth + API diffs |
| `specs/<x>.md` | planner (linked from the matching rule) | When touching subsystem X |
| `ARCHITECTURE.md` | planner (cross-cutting changes) · strategist's stack review | Big-picture work |
| `DEVELOPMENT.md` | planner (dev tooling background) | Local setup; in the exp lane, `ops/CONTRACTS.md` §2 and `rules/migrations.md` win |
| `SCALING.md` | planner on performance work | Operational events |
| `adrs/<NNNN>-*.md` | planner when the touched rule links one | Read once, baseline context |

## Where else docs live (not in `docs/`)

| Location | Purpose |
|---|---|
| [`.claude/rules/*.md`](../.claude/rules/) | Agent-facing imperative rules — auto-load when Claude edits matching files |
| [`.claude/agents/*.md`](../.claude/agents/) | Subagents: `strategist`, `web-reader`, `planner`, `red-test-writer`, `builder`, `solo-builder`, `qa` |
| [`.claude/skills/`](../.claude/skills/) | Skills (`/lead`, `/worker`, `/verify`, `/pr`, …) |
| [`CLAUDE.md`](../CLAUDE.md) | Project meta + hard rules (loaded every session) |
| [`CHANGELOG.md`](../CHANGELOG.md) | Release history of the main lane |

See [`.claude/README.md`](../.claude/README.md) for the crew's flow.
