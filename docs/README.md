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
- [session-logs/](session-logs/) — pipeline archaeology (per-run)

## Planning

- [roadmap.md](roadmap.md) — phases + cross-cutting work
- [engineering.md](engineering.md) — engineering quality backlog

---

## How docs integrate with the agent pipeline

Each doc has clear consumers. Most are read on-demand by specific agents or `/advisors` rather than auto-loaded.

| Doc | Agents that read it | When |
|---|---|---|
| `roadmap.md` | scoper · `/po` · `/release` · `/roadmap-status` | Most pipeline runs (phase context) |
| `security.md` | auth-specialist · reviewer (auth/user-data diffs) | Auth + API diffs |
| `specs/<x>.md` | matching specialist | When touching subsystem X |
| `architecture.md` | explorer (cross-cutting changes) · humans | First read, big-picture work |
| `development.md` | migrator · new contributors | Migration work, local setup |
| `engineering.md` | `/po` (avoid duplicate work) · `/roadmap-status` | Planning |
| `scaling.md` | `/health` · ops at 3am | Operational events |
| `product-vision.md` | Humans only | Interview / portfolio |
| `adrs/<NNNN>-*.md` | Specialists when starting work on the ADR'd surface | Read once, baseline context |
| `session-logs/INDEX.md` | explorer · scoper | Before recon (find prior work on same surface) |

## Where else docs live (not in `docs/`)

| Location | Purpose |
|---|---|
| [`.claude/rules/*.md`](../.claude/rules/) | Agent-facing imperative rules — auto-load when Claude edits matching files |
| [`.claude/agents/*.md`](../.claude/agents/) | Subagent definitions for the pipeline |
| [`.claude/commands/*.md`](../.claude/commands/) | Slash commands (entry points + advisors) |
| [`.claude/scratchpad/<branch>/`](../.claude/) | Per-pipeline-run ephemeral state (gitignored) |
| [`CLAUDE.md`](../CLAUDE.md) | Project meta + hard rules (loaded every session) |
| [`CHANGELOG.md`](../CHANGELOG.md) | User-facing release notes |

See [`.claude/README.md`](../.claude/README.md) for the agentic pipeline overview.
