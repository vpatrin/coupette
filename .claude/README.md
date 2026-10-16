# `.claude/` — how Claude works on Coupette

One session per ticket writes the code; two subagents with fresh context check it. Hard invariants are enforced by hooks, not by prompts. Decided in VPA-51.

## Directory map

```
.claude/
├── agents/       red-test-writer (before code) · reviewer (after) · gardener (Dependabot)
├── skills/       feature · review (+ checklists/) · eval-pipeline
├── commands/     remaining slash commands (move to skills in VPA-51 slice 3)
├── rules/        path-scoped instructions — auto-load when Claude edits matching files
├── settings.json project hooks (SessionStart prints .claude/progress.md)
└── progress.md   per-workspace /feature state (gitignored, dies with the workspace)
```

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
| `reviewer` | APPROVE / WARN / BLOCK with checklist IDs; also runs as `/review` | Nothing |
| `gardener` | CI upkeep for open PRs, Dependabot auto-merge — via `/garden` | Ignore files, fix branches |

All use `model: inherit`.

## Hooks

| Hook | Where | Does |
|---|---|---|
| `PreToolUse` (Bash) | `~/.claude/hooks/git-guard.py` (global) | Blocks tag pushes, `gh release create`, pushes to main, AI attribution in commits and PRs |
| `SessionStart` | `.claude/settings.json` | Prints `.claude/progress.md` into new, resumed, cleared, or compacted sessions |
| `Stop` | `skills/feature/stop-check.sh`, registered when `/feature` runs | Lint + tests (+ frontend build) for touched services; cached by diff hash |

## Rules (`rules/`)

One file per domain, `paths:` frontmatter scopes auto-loading. Rules hold instructions and link to `docs/specs/` for how things work — they never restate the specs. The review checklists in `skills/review/checklists/` turn the rules' gates into IDs a BLOCK can cite.

## Improving the harness

- The PR's optional **Harness friction** line names what in `.claude/` tripped the session.
- When a BLOCK ID already appeared in a merged PR, the reviewer proposes a deterministic guard (hook, lint rule, CI check).
- `.claude/` changes only through a reviewed PR — the workflow never edits its own instructions in place.
