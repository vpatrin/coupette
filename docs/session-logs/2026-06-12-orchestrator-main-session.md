# Session Log — Fix orchestrator execution model + stale push wording

**Branch:** `fix/orchestrator-main-session`
**Date:** 2026-06-12
**PR:** not yet
**Issue:** none
**Spec snapshot:** see `.claude/scratchpad/fix-orchestrator-main-session/spec.md` while branch lives

## Why this work

This was the **first end-to-end smoke run** of the newly merged orchestrated pipeline (#744). Two pieces of pipeline documentation had drifted: `pr-creator.md`/`orchestrator.md` still said "Victor handles all pushes" / "ask Victor to push", left over from before the git policy changed to "main session commits and pushes non-main branches; subagents never push." More importantly, `feature.md`/`fix.md` instructed the main session to "invoke the `orchestrator` agent" via the `Agent` tool — but subagents cannot spawn subagents (`Agent is not available inside subagents`), so an orchestrator framed as a spawnable agent was architecturally unexecutable.

## Decisions worth keeping

### Orchestrator becomes a main-session playbook, not a spawnable agent

- **Context:** `orchestrator.md` had `tools:` frontmatter implying `Agent` access, framed as something `feature.md`/`fix.md` would invoke via the `Agent` tool. The harness does not allow subagents to spawn subagents, so this design could never run.
- **Decision:** Reframe `orchestrator.md` as a playbook the main session reads and embodies directly — it executes the stages and spawns scoper/explorer/specialists/etc. itself via `Agent`. `feature.md`/`fix.md` now say "read `.claude/agents/orchestrator.md` and follow it as your playbook" instead of "invoke the orchestrator agent". Dropped the `tools:`/Agent-implying frontmatter from `orchestrator.md`.
- **Rejected:** Keeping orchestrator as a spawnable agent and finding some indirection to let it spawn further agents — not possible, this is a hard harness constraint, not a design trade-off.
- **ADR:** no — declined. This isn't a decision between real alternatives (test 1 of the 4-test fails): there was no viable alternative architecture to weigh against, just a previously-undiscovered platform constraint that had to be corrected. The "why" is now self-explained inline in `orchestrator.md`'s own framing.

### Push/commit wording reconciliation

- **Context:** `pr-creator.md` pre-flight check 5 said "ask Victor to push" if the branch wasn't pushed, and its "Do not" section said "Push (Victor handles all pushes)" — both stale relative to the current policy (main session commits + pushes non-main branches at stage 10; pr-creator never pushes).
- **Decision:** Pre-flight check 5 now returns BLOCKED with the specific check (consistent with the "If stuck" section) instead of telling the user to push manually. The "Do not" line now clarifies pr-creator itself never pushes, while the main session does at stage 10 — these aren't contradictory because the restriction applies to subagent stages, not the main session.
- **Rejected:** none — this was a straightforward wording correction anchored to the canonical policy text already present in `pr.md:7` and `CLAUDE.md:7`.
- **ADR:** no — too small, pure wording fix.

## Obstacles + lessons

1. **Subagents cannot spawn subagents** (`Agent is not available inside subagents`). The original orchestrator-as-agent design in #744 was unexecutable from day one — this run's diff is the fix. No file in `.claude/` currently assumes a subagent will spawn another subagent; if a future agent file does, it will hit the same wall. Worth a quick grep across `.claude/agents/*.md` for `Agent tool` / `invoke .* agent` if similar issues resurface.

2. **`explorer.md` instruction not followed: explorer returned a one-line response instead of writing its full brief to the response** — the brief only reached the scratchpad log, not the response the orchestrator sees directly. `explorer.md`'s "Write the full brief to the response" instruction exists but wasn't followed in practice this run. Flagging `.claude/agents/explorer.md` for Victor to `/fix` — either the instruction needs to be more forceful/explicit about response format, or the orchestrator step that reads explorer's output needs to tolerate log-only briefs.

## Final state

- **Files changed:** 5 markdown files, 26/26 lines (`.claude/agents/pr-creator.md`, `.claude/agents/orchestrator.md`, `.claude/commands/feature.md`, `.claude/commands/fix.md`, `.claude/README.md`)
- **Tests:** n/a — markdown-only; verified via two grep assertions from the spec, both pass
- **ADRs spawned:** none (declined — see "Decisions worth keeping" above)
- **Docs updated:** this PR is itself the agent-rules/docs update; no further docs were stale
- **Migrations:** no

## Links

- **PR:** TBD
- **Per-agent pipeline trace:** `.claude/scratchpad/fix-orchestrator-main-session/log.md`
- **Related ADRs:** none
- **Related session logs (same surface):** none — first entry in `INDEX.md`
- **Follow-up:** `.claude/agents/explorer.md` flagged for `/fix` — "write full brief to response" instruction wasn't followed during this run's explorer stage (brief only landed in the scratchpad log)
