---
description: Run the documenter standalone, without the full pipeline. Three trigger modes: after a code change, after a discussion to capture decisions, or to draft an ADR explicitly.
---

You are about to update documentation. Read CLAUDE.md, then invoke the `documenter` agent.

Context for the documenter:

$ARGUMENTS

## Three trigger modes

| Trigger | Example invocation | What documenter does |
|---|---|---|
| **Code change** (default, no args) | `/document` (uses `git diff main...HEAD`) | Update docs the change touched; session log if non-trivial |
| **Discussion outcome** | `/document we decided X after talking about Y — update scaling.md` | Edit the named doc; session log if substantive; ADR if 4-test passes |
| **Explicit ADR ask** | `/document write an ADR for our decision to use pgvector instead of Pinecone` | Run 4-test for ADR; draft if passes; update RAG-related docs if relevant |

If `$ARGUMENTS` is empty, the documenter falls back to mode 1 (diff-driven).

## What the documenter touches

Per its workflow:
- `CHANGELOG.md` if user-visible
- `docs/adrs/NNNN-*.md` ONLY if the 4-test passes (strict gate, target 5–15/year)
- `docs/ROADMAP.md` `[x]` marks for completed capabilities
- `.claude/rules/*.md` if stale (new convention, deprecated rule)
- `docs/specs/<subsystem>.md` if the change touched a documented subsystem's contract or how-it-works
- `docs/session-logs/<date>-<slug>.md` for non-trivial work (mandatory in pipeline mode, judgment for standalone)
- `docs/session-logs/INDEX.md` (appends one line per log written)

Returns a list of docs touched.
