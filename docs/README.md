# Coupette Docs

## Start here

- [architecture.md](architecture.md) — system design in 1 page
- [development.md](development.md) — local setup, dev workflow
- [product-vision.md](product-vision.md) — what we're building, why

## Subsystem deep dives

- [specs/](specs/) — per-subsystem (auth, chat, rag, scraper, bot, frontend)
- Each spec uses the [template](specs/_template.md)

## Operations

- [security.md](security.md) — threat model, controls, posture
- [scaling.md](scaling.md) — operational scaling notes

## Decisions & history

- [adrs/](adrs/) — significant technical decisions (rare, formal)
- [session-logs/](session-logs/) — past pipeline runs (history; no new logs — decisions now live in tickets and PR bodies)

## Planning

- [roadmap.md](roadmap.md) — phases + cross-cutting work
- [engineering.md](engineering.md) — engineering quality backlog

---

## How docs integrate with Claude

Each doc has clear consumers. Most are read on demand rather than auto-loaded.

| Doc | Who reads it | When |
|---|---|---|
| `roadmap.md` | `/breakdown` · `/release` · `/status` | Planning (phase context) |
| `security.md` | `/feature` (risky lane) · reviewer (auth/user-data diffs) | Auth + API diffs |
| `specs/<x>.md` | `/feature` recon (linked from the matching rule) | When touching subsystem X |
| `architecture.md` | `/feature` recon (cross-cutting changes) · humans | First read, big-picture work |
| `development.md` | `/feature` (migrations) · new contributors | Migration work, local setup |
| `engineering.md` | `/breakdown` (avoid duplicate work) · `/status` | Planning |
| `scaling.md` | `/status --health` · ops at 3am | Operational events |
| `product-vision.md` | Humans only | Interview / portfolio |
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
