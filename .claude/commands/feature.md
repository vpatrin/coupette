---
description: Drive a new feature through the full Coupette pipeline (scoper → explorer → specialist → docs → tests + review → PR).
---

You are about to start a feature. Read CLAUDE.md, then read `.claude/agents/orchestrator.md` and follow it as your playbook for this run — spawn subagents per its routing rules.

User request:

$ARGUMENTS

Treat the request as:
- the user's request verbatim
- `Type: feature`
- if the request mentions an issue number, include it

Following the playbook, you will:
1. Spawn `scoper` to produce a spec at `.claude/scratchpad/<branch>/spec.md`
2. Show the spec to the user, who reads it and says proceed
3. Spawn `explorer` for read-only recon
4. Spawn `migrator` if the spec marks `Needs migration: yes`
5. Spawn the right specialist (or `implementer`) to do the work in a worktree at `~/.claude/worktrees/coupette/<branch>`
6. Return the diff, the user reviews, says proceed
7. Spawn `test-writer`, then `reviewer` (sequential — the reviewer checks the tests and diff coverage)
8. Spawn `documenter` (mandatory blocking step)
9. Spawn `pr-creator` to ship

After each subagent returns, report back to the user and wait for go-ahead. Never auto-advance past a checkpoint.

## Trivial-case shortcut

If the feature is a single new endpoint, component, or function with no cross-cutting concerns and no schema change, you may invoke the matching specialist (or `implementer`) directly with the user's request — skip scoper and explorer. Use judgment. When in doubt, run the full pipeline.

Examples of trivial:
- "Add a `/api/health` route that returns `{status: ok}`"
- "Add a `LoadingSpinner` component using shadcn primitives"

Examples that need the full pipeline:
- Anything touching `auth/`, `services/sommelier.py`, `services/recommendations.py`
- Anything with a schema change
- Anything that spans more than one service
