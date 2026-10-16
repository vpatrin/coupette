# `.claude/` — how Claude works on Coupette

One session per ticket writes the code; two subagents with fresh context check it. Git invariants and the lint/test gate are enforced by hooks; the TDD, evidence, and domain rules by the reviewer's checklists. Decided in VPA-51.

## Directory map

```
.claude/
├── agents/       red-test-writer (before code) · reviewer (after) · gardener (Dependabot)
├── skills/       feature · review (+ checklists/) · eval-pipeline
├── commands/     remaining slash commands (move to skills in VPA-51 slice 3)
├── rules/        path-scoped instructions — auto-load when Claude edits matching files
├── settings.json project hooks (SessionStart, Stop) + LSP plugins
└── progress.md   per-workspace /feature state (gitignored, dies with the workspace)
```

The `pyright-lsp` and `typescript-lsp` plugins (code navigation, errors after each edit) need their language servers on `PATH` — global dev tools, unlike the frontend's own yarn dependencies: `npm i -g pyright typescript-language-server typescript`.

## The `/feature` flow

```
Linear ticket (ACs + edge case that will bite + e2e line + Lane)   ← Victor approves
  │
  ▼  one session per ticket, in its own Superset workspace
recon → plan naming the interfaces ──(risky lane: Victor reviews the plan)
  │
  ▼  red-test-writer (fresh context: ACs + interfaces only)
one failing test per AC → main session re-runs them → "red" commit
  │
  ▼  main session
code until green · coverage tests to ≥80% diff · docs in the same PR
decisions → commit bodies · push only when green (pre-push runs the suites)
Stop hook: lint + tests (+ frontend build) of touched services must pass
  │
  ▼  reviewer (fresh context; xhigh effort on the risky lane)
checklist IDs · TDD diff vs red commit · diff coverage re-run · evidence · stale docs
BLOCK → one fix loop → still BLOCK → Victor
  │
  ▼
PR: AC → evidence table · Decisions · Review line · Harness friction   → Victor merges
```

Full procedure: [`skills/feature/SKILL.md`](skills/feature/SKILL.md).

**Lanes.** Default: no human gate between ticket and merge except non-obvious choices. Risky (auth, migrations, RAG prompts/retrieval/embeddings): plus a plan checkpoint, `/security` or `make eval`, and a longer Decisions section.

**Launching a worker.** Skills can't run built-in commands, so whoever starts the session does:

```
claude -n VPA-NN          # session named after the ticket; `claude --resume VPA-NN` finds it
/feature VPA-NN
/goal every AC in .claude/progress.md passes and lint/tests are green
```

`/clear` between unrelated tasks. After two failed corrections on the same issue, `/clear` and restart with a sharper prompt.

## Agents

| Agent | Role | Edits |
|---|---|---|
| `red-test-writer` | Red step: one failing test per AC from the ACs + planned interfaces only | Tests only, never commits |
| `reviewer` | APPROVE / WARN / BLOCK with checklist IDs; also runs as `/review`. Own memory (`memory: user`, notes in `coupette.md`) of recurring issues | Its memory only |
| `gardener` | CI upkeep for open PRs, Dependabot auto-merge — via `/garden` | Ignore files, fix branches |

All use `model: inherit`.

## Hooks

| Hook | Where | Does |
|---|---|---|
| `PreToolUse` (Bash) | `~/.claude/hooks/git-guard.py` (global) | Blocks tag pushes, `gh release create`, pushes to main, AI attribution in commits and PRs |
| `SessionStart` | `.claude/settings.json` | Prints `.claude/progress.md` into new, resumed, cleared, or compacted sessions |
| `Stop` | `.claude/settings.json` → `skills/feature/stop-check.sh` | Only while `.claude/progress.md` exists: lint + tests (+ frontend build) for touched services; cached by diff hash |

## Rules (`rules/`)

One file per domain, `paths:` frontmatter scopes auto-loading. Rules hold instructions and link to `docs/specs/` for how things work — they never restate the specs. The review checklists in `skills/review/checklists/` turn the rules' gates into IDs a BLOCK can cite.

## Improving the harness

Soft by default, following Anthropic's memory model:

1. **Automatic, no PR.** Auto memory learns from Victor's corrections and is shared across this repo's worktrees. The reviewer keeps its own memory of recurring issues.
2. **Reviewed, via PR.** A learning that recurs becomes a line in `.claude/rules/`, a skill, or CLAUDE.md. Inputs: the PR's optional **Harness friction** line, and the reviewer's "soft fixes proposed" when a BLOCK ID repeats.
3. **Hard, rare.** A hook only for a must-never-happen action (tags, prod), on Victor's call — never by automatic promotion.

The workflow never edits shared instructions without a reviewed PR.
