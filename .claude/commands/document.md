---
description: Run the documenter standalone, without the full pipeline. Use after a manual change to update docs, write a session log, or add an ADR.
---

You are about to update documentation. Read CLAUDE.md, then invoke the `documenter` agent.

Context for the documenter:

$ARGUMENTS

If $ARGUMENTS is empty, the documenter looks at `git diff main...HEAD` and decides what needs documenting based on the changes.

The documenter will:
- Update CHANGELOG.md if the change is user-visible
- Write an ADR in `docs/decisions/` if a real technical tradeoff was made
- Mark roadmap items `[x]` if a capability was completed
- Update `.claude/domains/*.md` or `.claude/patterns/*.md` if stale
- Write a session log at `docs/session-logs/<date>-<slug>.md` for non-trivial work

It returns a list of docs touched.
