---
description: Drive a bug fix through the full Coupette pipeline (scoper → explorer → specialist → docs → tests + review → PR).
---

You are about to fix a bug. Read CLAUDE.md, then read `.claude/agents/orchestrator.md` and follow it as your playbook for this run — spawn subagents per its routing rules.

User request:

$ARGUMENTS

Treat the request as:
- the user's request verbatim
- `Type: fix`
- if the request mentions an issue number, include it

The pipeline is the same as `/feature`. The scoper's spec must name:
- the broken behavior (with file:line if known)
- the desired behavior
- a regression test that the test-writer will add

If the fix is a one-liner with no behavioral subtlety, you may invoke `implementer` directly and skip scoper. Use judgment — when in doubt, run the full pipeline.
