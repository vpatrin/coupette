---
description: Drive a bug fix through the full Coupette pipeline (scoper → explorer → repro test → specialist → docs → review → PR).
disable-model-invocation: true
---

You are about to fix a bug. Read CLAUDE.md, then read `.claude/agents/orchestrator.md` and follow it as your playbook for this run — spawn subagents per its routing rules.

User request:

$ARGUMENTS

Treat the request as:
- the user's request verbatim
- `Type: fix`
- if the request mentions a Linear issue (`VPA-NN`), include it — and paste the issue body into the scoper handoff per the orchestrator's handoff format

The pipeline is the same as `/feature`, with one ordering change (below). The scoper's spec must name:
- the broken behavior (with file:line if known)
- the desired behavior
- a regression test that the test-writer will add

## Red-green (fixes only)

The regression test comes **before** the fix, not after — a test written against already-fixed code never proves it would have caught the bug.

1. After explorer (and migrator if needed), spawn **test-writer in repro mode**: "write the regression test for the broken behavior named in the spec, run it, confirm it FAILS, report the failing output. Do not write other tests yet."
2. If the repro test **passes**, stop — the bug isn't where the spec says it is. Route back to the user (or scoper) before any code changes.
3. Spawn the specialist/implementer: make the failing test green, nothing more.
4. Test-writer then completes its normal pass (edge cases, coverage) and the pipeline continues as usual.

## Trivial-case shortcut

If the fix is a one-liner with no behavioral subtlety, you may invoke `implementer` directly and skip scoper — but keep the red-green order: repro test first, even for one-liners. Use judgment — when in doubt, run the full pipeline.
