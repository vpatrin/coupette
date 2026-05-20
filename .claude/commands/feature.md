---
description: Drive a new feature through the full Coupette pipeline (scoper → explorer → specialist → docs → tests + review → PR).
---

You are about to start a feature. Read CLAUDE.md, then invoke the `orchestrator` agent with the user's request below.

User request:

$ARGUMENTS

Pass the orchestrator:
- the user's request verbatim
- `Type: feature`

The orchestrator will:
1. Spawn `scoper` to produce a spec at `docs/specs/_drafts/<date>-<slug>.md`
2. Return the spec to you, the user reads it, says proceed
3. Spawn `explorer` for read-only recon
4. Spawn `migrator` if the spec marks `Needs migration: yes`
5. Spawn the right specialist (or `implementer`) to do the work in a worktree at `~/.claude/worktrees/coupette/<branch>`
6. Return the diff, the user reviews, says proceed
7. Spawn `test-writer` and `reviewer` in parallel
8. Spawn `documenter` (mandatory blocking step)
9. Spawn `pr-creator` to ship

After each subagent returns, the orchestrator reports back to the user and waits for go-ahead. Never auto-advance past a checkpoint.
