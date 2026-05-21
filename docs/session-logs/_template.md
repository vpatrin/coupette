# Session Log — <short title>

**Branch:** `type/short-description`
**Date:** YYYY-MM-DD
**PR:** #NNN (or "not yet")
**Spec snapshot:** see `.claude/scratchpad/<branch>/spec.md` (archived in PR description if branch deleted)

## Why this work

One paragraph. The motivation, not the implementation. Tie to issue, ADR, or roadmap item.

## Decisions worth keeping

Non-obvious calls future-you will want to remember. NOT "we implemented X" — "we chose X over Y because Z." Typically 1-3 entries. If none: write "no real tradeoffs — straightforward execution."

### <decision title>

- **Context:** what was on the table
- **Decision:** what we picked
- **Rejected:** Y, Z (with one-line reason each)
- **ADR:** `docs/decisions/NNNN-<slug>.md` (or "no — too small")

(Repeat per decision.)

## Obstacles + lessons

Dead ends, env quirks, library bugs that ate time. Future-you reads this to skip the same trap. If none worth mentioning: write "none — clean run."

## Pointers (don't restate)

The mechanical state lives elsewhere — link, don't copy.

- **Files changed, tests added, coverage delta:** see PR #NNN
- **Per-agent pipeline trace:** `.claude/scratchpad/<branch>/log.md` (archive in PR description before deleting the branch if you want it preserved)
- **ADRs spawned:** <list with one-line summary, or "none">
- **Related prior session logs (same surface):** look up via [`INDEX.md`](./INDEX.md)
