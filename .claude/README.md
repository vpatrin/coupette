# `.claude/` — Agentic Workflow

A multi-agent pipeline for Coupette, inspired by Anthropic's orchestrator-worker pattern. Solo-dev sized: 13 agents, 4 entry commands, 8 domain docs, 5 pattern docs.

## Directory map

```
.claude/
├── agents/          Pipeline subagents (invoked by the orchestrator)
├── commands/        Slash commands (invoked by Victor)
├── domains/         Business context per surface (read by agents on demand)
├── patterns/        Code conventions per code type (read by agents on demand)
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
| `/qa` | QA engineer — coverage + behavioral bugs |
| `/security` | Appsec — threat model |
| `/data` | DBA / data engineer — schema, queries, migrations |
| `/ai` | AI/ML architect — prompts, retrieval, RAG design |
| `/ux` | UX designer — spec + audit |
| `/plan` | Senior PM — phase planning, breakdown |
| `/roadmap-status` | Program manager — progress + cleanup |
| `/health` | CTO — periodic project health |
| `/eval-pipeline` | ML engineer — RAG score tuning |
| `/prompt` | Prompt engineer — audit / draft slash commands |

### Actions

| Command | Purpose |
|---|---|
| `/pr` | Create PR for the current branch |
| `/tag` | Prepare release tag + changelog |

## Pipeline

```
/feature add wine pairing endpoint
  ↓
Orchestrator spawns Scoper → spec at docs/specs/_drafts/<date>-<slug>.md
  ↓  (Victor reviews, says proceed)
Orchestrator: git worktree add ~/.claude/worktrees/coupette/<branch>
  ↓  (every subsequent subagent runs in the worktree)
Explorer → recon brief
Migrator → only if spec says Needs migration: yes
Specialist (or generic Implementer) → does the work
  ↓  (Victor reviews diff, says proceed)
Test-Writer ∥ Reviewer (parallel via two Agent calls in one message)
  Reviewer reads .claude/commands/<advisor>.md and applies them itself
Documenter (BLOCKING) → changelog + session log + ADR if applicable
PR-Creator → invokes /pr
  ↓
Orchestrator: git worktree remove
```

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

Backend and bot fall through to the generic `implementer` + `domains/backend.md`.

## Context layer

### Domains (business context per surface)

Read by agents based on which surface the change touches.

`auth.md` · `backend.md` · `database.md` · `deploy.md` · `frontend.md` · `llm.md` · `rag.md` · `scraper.md`

### Patterns (code conventions per code type)

Read by agents based on what kind of code they're writing.

`testing-patterns.md` · `migration-patterns.md` · `i18n-patterns.md` · `frontend-component-patterns.md` · `pydantic-patterns.md`

## Worktree convention

All pipeline runs use `~/.claude/worktrees/coupette/<branch>`. The orchestrator creates it after spec approval and removes it after the PR lands. Diffs can be viewed in VSCode by opening that path, or in any external diff viewer.

## Session logs

The documenter writes durable session logs to `docs/session-logs/<date>-<slug>.md` for non-trivial work. See [`docs/session-logs/README.md`](../docs/session-logs/README.md) for when to write vs skip.

## Design references

- Anthropic orchestrator-worker pattern: https://www.anthropic.com/engineering/multi-agent-research-system
- Claude Code subagents: https://docs.claude.com (search "sub-agents")
- Anthropic prompt engineering best practices: https://docs.claude.com (search "prompt engineering")

## Maintenance

- Adding a new specialist → write `.claude/agents/<name>-specialist.md` with a sharp `description` field. Update `orchestrator.md` routing if needed.
- Adding a new domain → write `.claude/domains/<name>.md` + add to `CLAUDE.md` "Where things live" table.
- Adding a new pattern → write `.claude/patterns/<name>-patterns.md` + add to `CLAUDE.md` table.
- Removing an advisor → delete `.claude/commands/<name>.md`. The reviewer's "advisor self-audit" list in `agents/reviewer.md` references file paths, so prune those too.
