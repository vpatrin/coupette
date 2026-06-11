# `.claude/` — Agentic Workflow

A multi-agent pipeline for Coupette, inspired by Anthropic's orchestrator-worker pattern. Solo-dev sized: 13 agents, 4 entry commands, 12 path-scoped rules docs.

## Directory map

```
.claude/
├── agents/          Pipeline subagents (invoked by the orchestrator)
├── commands/        Slash commands (invoked by Victor)
├── rules/           Path-scoped context — auto-loaded by Claude when editing
│                    matching files (main session) AND explicitly Read by
│                    subagents in the pipeline. Single source of truth.
├── skills/          Skills with supporting files (e.g. eval-pipeline)
└── settings.local.json
```

## Slash commands

### Pipeline entries (user-invoked)

| Command | Purpose |
|---|---|
| `/feature <desc>` | Drive a new feature through the full pipeline |
| `/fix <desc>` | Same pipeline, framed for bugs |
| `/document` | Run the documenter standalone (docs + session log + ADR) |
| `/po <desc>` | Break a feature into GitHub issues (stories + tasks) |

### Advisors (review personas)

| Command | Role |
|---|---|
| `/review` | Tech lead — code quality, AI smell, DoD |
| `/security` | Appsec — threat model |
| `/data` | DBA / data engineer — schema, queries, migrations |
| `/ai` | AI/ML architect — prompts, retrieval, RAG design |
| `/ux` | UX designer — spec + audit |
| `/roadmap-status` | Program manager — progress + cleanup |
| `/health` | CTO — periodic project health |
| `/eval-pipeline` | ML engineer — RAG score tuning |

### Actions

| Command | Purpose |
|---|---|
| `/pr` | Create PR for the current branch |
| `/release` | Orchestrated release: verify roadmap + changelog gaps, prep CHANGELOG, draft deploy issue, hand Victor one ordered batch of git + gh commands (tag push triggers CD) |

## Pipeline

```
/feature add wine pairing endpoint
  ↓
Orchestrator spawns Scoper → spec at .claude/scratchpad/<branch>/spec.md
  ↓  (Victor reviews, says proceed)
Orchestrator: git worktree add ~/.claude/worktrees/coupette/<branch>
              + initializes .claude/scratchpad/<branch>/log.md in the MAIN repo
              (Working notes + Stage results)
  ↓  (every subsequent subagent cd's into the worktree per its handoff prompt,
       reads spec.md + log.md via the absolute scratchpad paths it was given,
       appends its Result block to Stage results on completion)
Explorer → recon brief + reads prior session logs for the touched surface
Migrator → only if spec says Needs migration: yes
Specialist (or generic Implementer) → does the work (Plan → Execute → Verify)
  ↓  (Victor reviews diff, says proceed)
Test-Writer → Reviewer (sequential — reviewer checks the tests + diff coverage)
  Reviewer reads .claude/commands/<advisor>.md and applies them itself
Documenter (BLOCKING) → consumes spec.md + log.md → writes session log
              + changelog + ADR if applicable
PR-Creator → applies .claude/commands/pr.md
  ↓
Orchestrator: git worktree remove (scratchpad dir lives in the main repo and persists
              for retrospection, gitignored, manual cleanup via `make clean-scratchpad`)
```

## Three layers of memory

| Artifact | Lives in | Lifetime | Audience |
|---|---|---|---|
| **Spec** | `.claude/scratchpad/<branch>/spec.md` (main repo, not the worktree) | Local, gitignored — persists until manually cleaned | Pipeline input (scoper writes, agents read) |
| **Pipeline log** | `.claude/scratchpad/<branch>/log.md` (main repo, not the worktree) | Same — local, gitignored, persists | All subagents (primary trace) |
| **Session log** | `docs/session-logs/` | Permanent (committed) | Future-you + future AI agents |

The scratchpad is for optimization (tight context, survives compaction). The session log is for archaeology (decisions, dead ends, rejected alternatives — like ADRs but per-session). Full pipeline runs always produce a session log; the trivial-case shortcut in `/feature`/`/fix` and standalone work use judgment.

## Agents

### Pipeline workers

| Agent | Role | Edits code? |
|---|---|---|
| `orchestrator` | Routes, manages handoffs | No |
| `scoper` | Request → spec | Spec file only |
| `explorer` | Read-only recon brief | No |
| `migrator` | Model change + suggests `make revision` | Models only |
| `implementer` | Generic code writer (fallback) | Yes |
| `test-writer` | Tests for the change | Tests only |
| `reviewer` | BLOCK / WARN / APPROVE | No |
| `documenter` | Docs + session log + ADR (mandatory) | Docs only |
| `pr-creator` | Final ship via `/pr` | No |

### Specialists (preferred over `implementer` when surface matches)

| Specialist | Surface |
|---|---|
| `frontend-specialist` | `frontend/src/` — React 19 + TS + Tailwind + shadcn + i18n |
| `rag-specialist` | Sommelier, recommendations, intent, embedding pipeline |
| `auth-specialist` | JWT, OAuth (Google + GitHub), waitlist, bot secret |
| `scraper-specialist` | `scraper/` — sitemap-only fetching, legal compliance |

Backend and bot fall through to the generic `implementer` + `.claude/rules/backend.md` / `.claude/rules/bot.md`.

## Context layer (`.claude/rules/`)

One folder, single source of truth. Each file has `paths:` frontmatter so it auto-loads in main-session work when matching files are touched. Subagents Read them explicitly per their system prompts.

`auth.md` · `backend.md` · `bot.md` · `deploy.md` · `docs.md` · `frontend.md` · `llm.md` · `migrations.md` · `packaging.md` · `rag.md` · `scraper.md` · `testing.md`

(Reviewer's project-specific invariants are inlined in `agents/reviewer.md` — they're reviewer-only and shouldn't auto-load into other sessions.)

## Worktree convention

All pipeline runs use `~/.claude/worktrees/coupette/<branch>`. The orchestrator creates it after spec approval and removes it after the PR lands. Diffs can be viewed in VSCode by opening that path, or in any external diff viewer.

## Session logs

The documenter writes durable session logs to `docs/session-logs/<date>-<slug>.md` for non-trivial work. See [`docs/session-logs/README.md`](../docs/session-logs/README.md) for when to write vs skip.

## Design references

- Anthropic orchestrator-worker pattern: <https://www.anthropic.com/engineering/multi-agent-research-system>
- Claude Code subagents: <https://docs.claude.com/en/docs/claude-code/sub-agents>
- Anthropic prompt engineering best practices: <https://docs.claude.com> (search "prompt engineering")

## Maintenance

- Adding a new specialist → write `.claude/agents/<name>-specialist.md` with a sharp `description` field. Update `orchestrator.md` routing if needed.
- Adding a new rule → write `.claude/rules/<name>.md` with `paths:` frontmatter scoping where it auto-loads. Add to `CLAUDE.md` "Where things live" table.
- Removing an advisor → delete `.claude/commands/<name>.md`. The reviewer's advisor-checks list (in `agents/reviewer.md`) references those file paths, so prune there too.
