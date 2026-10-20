# Coupette Docs

## Start here

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design in 1 page
- [DEVELOPMENT.md](DEVELOPMENT.md) — local setup, dev workflow
- [PRODUCT_VISION.md](PRODUCT_VISION.md) — what we're building, why

## Subsystem deep dives

- [specs/](specs/) — per-subsystem (auth, chat, rag, scraper, bot, frontend)
- Each spec uses the [template](specs/_template.md)

## Operations

- [SECURITY.md](SECURITY.md) — threat model, controls, posture
- [SCALING.md](SCALING.md) — operational scaling notes

## Decisions & history

- [adrs/](adrs/) — significant technical decisions (rare, formal)
- [session-logs/](session-logs/) — past pipeline runs (history; no new logs — decisions now live in tickets and PR bodies)

## Planning

- [ROADMAP.md](ROADMAP.md) — phases + cross-cutting work
- [ENGINEERING.md](ENGINEERING.md) — engineering targets and backlog

---

## How docs integrate with Claude

Each doc has clear consumers. Most are read on demand rather than auto-loaded.

| Doc | Who reads it | When |
|---|---|---|
| `ROADMAP.md` | `/breakdown` · `/release` · `/status` | Planning (phase context) |
| `SECURITY.md` | `/feature` (risky lane) · reviewer (auth/user-data diffs) | Auth + API diffs |
| `specs/<x>.md` | `/feature` recon (linked from the matching rule) | When touching subsystem X |
| `ARCHITECTURE.md` | `/feature` recon (cross-cutting changes) · humans | First read, big-picture work |
| `DEVELOPMENT.md` | `/feature` (migrations) · new contributors | Migration work, local setup |
| `ENGINEERING.md` | `/breakdown` (avoid duplicate work) · `/status` | Planning |
| `SCALING.md` | `/status --health` · ops at 3am | Operational events |
| `PRODUCT_VISION.md` | Humans only | Interview / portfolio |
| `adrs/<NNNN>-*.md` | `/feature` when the touched rule links one | Read once, baseline context |

## Where else docs live (not in `docs/`)

| Location | Purpose |
|---|---|
| [`.claude/rules/*.md`](../.claude/rules/) | Agent-facing imperative rules — auto-load when Claude edits matching files |
| [`.claude/agents/*.md`](../.claude/agents/) | Subagents: `red-test-writer`, `reviewer`, `gardener` |
| [`.claude/skills/`](../.claude/skills/) | Skills (`/feature`, `/review`, `/pr`, …) |
| [`CLAUDE.md`](../CLAUDE.md) | Project meta + hard rules (loaded every session) |
| [`CHANGELOG.md`](../CHANGELOG.md) | User-facing release notes |

See [`.claude/README.md`](../.claude/README.md) for the `/feature` flow.
