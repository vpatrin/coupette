# `.claude/` — how Claude Code builds Coupette

Coupette is a wine discovery app (FastAPI, React, PostgreSQL + pgvector, Claude for curation) built by one developer. This directory is the harness Claude Code works in. The goal: **one human decision per feature** — approve the ticket, merge the PR — without dropping any production safeguard.

It replaced a 13-agent pipeline (~3,800 lines, ~9 human stops per feature) in October 2026. The rewrite kept every check that protects production and removed every hand-off that didn't.

## The flow

```
Linear ticket — falsifiable ACs, edge case that will bite, e2e line, lane   ← Victor approves
  │
  ▼  one Claude session per ticket, in its own git worktree
recon → plan naming the interfaces ──(risky lane: Victor reviews the plan)
  │
  ▼  red-test-writer — fresh context, sees only ACs + interfaces
one failing test per AC → main session re-runs them → "red" commit
  │
  ▼  main session
code until green · coverage tests to ≥80% of the diff · docs in the same PR
decisions → commit bodies · push only when green
Stop hook: lint + tests (+ frontend build) of touched services must pass
  │
  ▼  reviewer — fresh context, xhigh effort on the risky lane
checklist IDs · TDD diff vs the red commit · diff coverage re-run · evidence · stale docs
BLOCK → one fix loop → still BLOCK → Victor
  │
  ▼
PR: AC → evidence table · Decisions · Review line · Harness friction    → Victor merges
```

**Lanes.** *Default*: no human gate between ticket and merge, except a genuinely non-obvious choice. *Risky* (auth, migrations, RAG prompts and retrieval): adds a plan checkpoint, the reviewer's in-depth security pass or `make eval`, and a longer Decisions section.

## Design principles

| Principle | In practice | Source |
|---|---|---|
| One writer per feature | The main session owns every code change; subagents return tests or verdicts, never parallel edits | Cognition — "actions carry implicit decisions"; "just use a single-threaded linear agent" |
| The test author is not the code author | `red-test-writer` writes the tests from the ACs alone; the coder may not weaken them | Anthropic best practices — "have one Claude write tests, then another write code to pass them" |
| Deterministic where it must never fail | Git invariants and the lint/test gate are hooks; everything else is instructions | Anthropic best practices — "hooks are deterministic"; HumanLayer — "never send an LLM to do a linter's job" |
| Context is a budget | Rules load by path, skills by name, specs on demand | Anthropic — context is "a critical but finite resource"; Agent Skills' progressive disclosure |
| Gates proportional to risk | Two lanes instead of one heavy process for everything | Ours, in the spirit of *Building effective agents*: add complexity "only when it demonstrably improves outcomes" |

## Components

Provenance: **Anthropic** (official doc or engineering post) · **Adapted** (changed, and why) · **Practitioner** · **Ours** (and why).

### Skills — `skills/`

| Skill | Purpose | Provenance |
|---|---|---|
| [`feature`](skills/feature/SKILL.md) | The flow above, from ticket to PR | **Adapted** from best practices' Explore → Plan → Implement → Commit, its interview step, and "`/clear` after two failed corrections". **Ours**: lanes, the red commit, the AC → evidence table |
| [`review`](skills/review/SKILL.md) | Runs the `reviewer` agent in a forked context; `/review security\|data\|ai` for an in-depth audit, `--full` for the repo | **Anthropic** skill `context: fork`. **Ours**: checklists with stable IDs, replacing standalone security, data, and AI advisors |
| [`pr`](skills/pr/SKILL.md) | Opens the PR: CHANGELOG and ROADMAP checks, AC → evidence table, Decisions compiled from commit bodies | **Ours** |
| [`coordinate`](skills/coordinate/SKILL.md) | The main workspace dispatches one `/feature` worker per ticket, relays blocks to Victor, verifies CI and evidence; never edits code. Typed only (`disable-model-invocation`) | **Adapted** from Superset's `orchestrate` skill (transport, worker envelopes). **Ours**: the ticket as a lossless handoff to a full session (Cognition: share full context), state rebuilt from Linear, Superset, and GitHub instead of a scratchpad |
| [`adr`](skills/adr/SKILL.md) | Drafts an ADR only when a 4-test gate passes; otherwise the decision goes in the PR | **Adapted** from Michael Nygard's ADR format (Context, Decision, Status, Consequences). **Ours**: Options and Rationale sections, and the gate that keeps ADRs rare |
| [`status`](skills/status/SKILL.md) | Roadmap vs Linear vs code, next tasks; `--health` scorecard from the review checklists | **Ours** |
| [`eval-pipeline`](skills/eval-pipeline/SKILL.md) | Tunes the RAG pipeline one lever at a time against a fixed benchmark with a holdout split | **Ours** — LLM-as-judge scores, never auto-fired (it costs money) |
| [`release`](skills/release/SKILL.md) · [`land-pr`](skills/land-pr/SKILL.md) · [`garden`](skills/garden/SKILL.md) | Release prep (Victor pushes the tag); rebase + arm auto-merge; CI upkeep — Dependabot triage, and Victor's red PRs routed to `/land-pr` | **Ours**. `disable-model-invocation`: run only when typed, and absent from the always-loaded skill list |

Tickets come from the global `breakdown` skill: an interview first (**Anthropic** best practices — "interview me in detail using the AskUserQuestion tool"), INVEST checks (**Practitioner**: Bill Wake), and templates carrying the lane and an end-to-end verification line.

### Agents — `agents/`

| Agent | Purpose | Provenance |
|---|---|---|
| [`red-test-writer`](agents/red-test-writer.md) | TDD red step: one failing test per AC plus the edge case that will bite, from the ACs and planned interfaces only | **Anthropic** best practices (one Claude writes tests, another the code). **Adapted**: the harness post forbids editing the pass/fail feature list; we hold red tests to the same rule. Name from TDD's red-green-refactor |
| [`reviewer`](agents/reviewer.md) | APPROVE / WARN / BLOCK, blocking only on correctness, an unmet AC, or a cited checklist ID; keeps its own memory of recurring issues | **Adapted** from best practices — "have a subagent review the diff in a fresh context". **Ours**: BLOCK criteria, the TDD diff against the red commit, re-running diff coverage instead of trusting a reported figure |
| [`gardener`](agents/gardener.md) | Keeps open PRs green: triages Dependabot PRs and arms GitHub auto-merge on patch/minor bumps and on its own CI-fix PRs; routes Victor's red PRs to `/land-pr` without pushing to them | **Ours** — dependency upkeep without a human in the loop for low-risk bumps |

All agents use `model: inherit`.

### Hooks

| Hook | Purpose | Provenance |
|---|---|---|
| `PreToolUse` Bash → `~/.claude/hooks/git-guard.py` (global) | Blocks tag pushes (tags deploy to prod), `gh release create`, pushes to main, AI attribution in commits and PRs | **Adapted**: the permissions docs warn that Bash argument rules are fragile (`git -C . push --tags` slips past a prefix deny), so this hook parses the command. Tested by a case table and a `claude -p` run |
| `Stop` → [`stop-check.sh`](skills/feature/stop-check.sh) | Lint + tests (+ frontend build) for touched services before a `/feature` session may stop | **Anthropic** best practices (hooks for "actions that must happen every time"); HumanLayer (deterministic tools over the model). **Ours**: armed only while `progress.md` exists, cached by diff hash |
| `SessionStart` → prints `progress.md` | A resumed, cleared, or compacted session knows where it is | **Adapted** from the harness post's `claude-progress.txt`. **Ours**: injected by a hook rather than re-read by instruction; plus best practices' compaction instruction in CLAUDE.md |
| `.githooks/pre-push` (git) | Lock files, migration presence, tests of changed services | **Ours** |

### State and memory

| Piece | Purpose | Provenance |
|---|---|---|
| `.claude/progress.md` (per workspace, gitignored) | The ticket's ACs with pass/fail, the red commit, the next step. Becomes the PR's evidence table | **Adapted** from the harness post's `claude-progress.txt` and pass/fail feature list. State only: rewritten at each commit, never a log |
| Decisions in commit bodies → PR | Durable through `/clear` and compaction; `/pr` compiles them | **Ours** — replaces session logs; squash commits stay title-only |
| Auto memory + reviewer `memory` | Learns from corrections; the reviewer remembers recurring issues | **Anthropic** memory and sub-agents docs |

### Rules and checklists

| Piece | Purpose | Provenance |
|---|---|---|
| [`rules/`](rules/) — one file per domain, `paths:` frontmatter | Instructions that load only when Claude edits matching files; they link to `docs/specs/` and never restate it | **Anthropic** memory docs (`paths` frontmatter); HumanLayer — "concise and universally applicable" CLAUDE.md, progressive disclosure |
| [`skills/review/checklists/`](skills/review/checklists/) | The gates the old specialist agents and advisor commands carried, as IDs: core, auth, security, data, ai, rag, scraper, frontend, migrations (`AUTH-1`, `SEC-3`, `TEST-2`…) | **Ours** — a BLOCK must cite something checkable, and recurrences become searchable across PRs |

### Tooling

`pyright-lsp` + `typescript-lsp` plugins (code navigation, errors after edits; language servers via `npm i -g pyright typescript-language-server typescript`) · the advisor tool (a second opinion before an approach and before "done", never counted as review) · `/goal` set by whoever launches a worker. All **Anthropic**.

## Self-improvement loop

Soft by default:

1. **Automatic, no PR.** Auto memory learns from Victor's corrections; the reviewer keeps its own memory of recurring issues.
2. **Reviewed, via PR.** A learning that recurs becomes a line in `rules/`, a skill, or CLAUDE.md — the memory docs' triggers: "Claude makes the same mistake a second time", "A code review catches something Claude should have known". Inputs: the PR's optional **Harness friction** line and the reviewer's proposed fixes when a BLOCK ID repeats.
3. **Hard, rare.** A hook only for a must-never-happen action (tags, prod), on Victor's call.

The workflow never edits its own instructions without a reviewed PR. Practitioner lineage: Every's compound engineering ("each unit of engineering work should make subsequent units easier"); Mitchell Hashimoto's harness engineering ("engineer a solution such that the agent never makes that mistake again"). Tier 3 stays rare on purpose — CLAUDE.md is advisory, hooks are not, and over-hooking makes the harness brittle.

## Budgets

Maintenance is triggered by a breached budget, not a calendar:

| Budget | Limit | Now |
|---|---|---|
| Project `CLAUDE.md` | ≤ 150 lines | 120 |
| Fixed context of a coupette session (`claude -p "/context"` in a fresh `git clone` — a worktree also loads the original checkout's `.claude/`) | ≤ 10% over the post-rework baseline | 20.8k after the rework (2026-10-16, includes the global learning map); 22k before it, measured in a worktree |

Otherwise a rule is fixed the second time the same mistake happens, inside the current feature's PR.

## Running a worker

Skills can't run built-in commands, so whoever starts the session does:

```
claude -n VPA-NN          # named after the ticket; `claude --resume VPA-NN` finds it
/feature VPA-NN
/goal every AC in .claude/progress.md passes and lint/tests are green
```

`/clear` between unrelated tasks. After two failed corrections on the same issue, `/clear` and restart with a sharper prompt.

## Directory map

```
.claude/
├── agents/        red-test-writer · reviewer · gardener
├── skills/        feature (+ stop-check.sh) · review (+ checklists/) · pr · coordinate · adr · status
│                  eval-pipeline · release · land-pr · garden
├── rules/         path-scoped instructions
├── settings.json  project hooks (SessionStart, Stop) + LSP plugins
├── progress.md    per-workspace /feature state (gitignored)
└── evidence/      per-workspace screenshots named in the PR's evidence rows (gitignored)
```

## Sources

Anthropic — [Claude Code best practices](https://code.claude.com/docs/en/best-practices) · [Memory](https://code.claude.com/docs/en/memory) · [Sub-agents](https://code.claude.com/docs/en/sub-agents) · [Skills](https://code.claude.com/docs/en/skills) · [Hooks](https://code.claude.com/docs/en/hooks) · [Permissions](https://code.claude.com/docs/en/permissions) · [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (2024-12) · [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (2025-09) · [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) (2025-10) · [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) (2025-11)

Practitioners — Cognition, [Don't Build Multi-Agents](https://cognition.com/blog/dont-build-multi-agents) (2025-06) · HumanLayer, [Writing a good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) (2025-11) · Dan Shipper & Kieran Klaassen (Every), [Compound engineering](https://every.to/chain-of-thought/compound-engineering-how-every-codes-with-agents) (2025-12) · Mitchell Hashimoto, [My AI adoption journey](https://mitchellh.com/writing/my-ai-adoption-journey) (2026-02)

Quotes checked against each source on 2026-10-16.
