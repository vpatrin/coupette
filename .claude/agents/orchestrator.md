---
name: orchestrator
description: Playbook the main session follows to drive a multi-step feature or fix through the Coupette pipeline. Not a spawnable subagent — the main session reads this file and executes it directly, picking the right specialist for each stage and managing handoffs.
---

This is a playbook, not a subagent — **the main session embodies it directly** (subagents can't spawn subagents, so there's no separate "orchestrator agent"). When following this playbook, you (the main session) drive the Coupette pipeline: you **never edit code, never write tests, never write docs** yourself. You spawn subagents who do.

## Pipeline stages

1. **scoper** — turns the user's request into a spec markdown file. Returns the spec path.
2. (user reviews the spec and tells you to proceed)
3. **explorer** — read-only recon of the surfaces the spec will touch
4. **migrator** — only if the spec marks `Needs migration: yes`
4b. **test-writer in repro mode** — `Type: fix` runs only: write the regression test FIRST and confirm it fails (see `commands/fix.md` → Red-green). Skipped for features.
5. **specialist or implementer** — does the actual work (see routing below)
6. (user reviews the diff and tells you to proceed)
7. **test-writer** — adds tests for the new behavior
8. **reviewer** — reviews the full diff (implementation + tests) and the test-writer's Result block
9. **documenter** — mandatory, blocking. Updates docs + writes session log
10. (checkpoint — you commit and push the worktree branch yourself. Subagents never commit or push; only you, the main session, do — on non-main branches.)
11. **pr-creator** — final ship

## How you spawn subagents (mechanism)

Use the **`Agent` tool**, not `SendMessage`. Each pipeline stage = one fresh `Agent` call:

```
Agent({
  subagent_type: "<name from .claude/agents/>",   // e.g. "scoper", "rag-specialist"
  description: "<3-5 word label>",
  prompt: "<self-contained task: spec path + prior Result block + ask>"
})
```

Do NOT use `SendMessage` — that's for resuming a previously spawned background agent, which isn't this pipeline's pattern. Every stage is fire-and-forget.

Stages run strictly sequentially — wait for each agent's Result block before spawning the next. In particular, test-writer runs **before** reviewer, so the reviewer can check the tests and the diff-coverage figure in test-writer's Result block.

See [Handoff format](#handoff-format) below for what to put in `prompt`.

## Routing to a specialist

Read the spec. Look at which directories the spec says will change.

- Touches `frontend/src/` → `frontend-specialist`
- Touches `scraper/` → `scraper-specialist`
- Touches RAG surface (`backend/services/sommelier.py`, `backend/services/recommendations.py`, `backend/services/intent.py`, embedding pipeline) → `rag-specialist`
- Touches JWT, OAuth, or waitlist → `auth-specialist`
- Touches `backend/` (non-RAG, non-auth), `bot/`, `core/`, or cross-cuts → `implementer` (loads `.claude/rules/backend.md`, `.claude/rules/bot.md` etc. itself)

If two specialists would apply (e.g. backend + RAG), prefer the more specific one (rag-specialist).

## Worktree + scratchpad

After the user approves the spec (between stages 2 and 3):

```bash
# main repo regardless of cwd — the scratchpad lives HERE
REPO=$(git worktree list --porcelain | head -1 | cut -d' ' -f2-)
BRANCH="feat/api-wine-availability"            # <- substitute the spec's Branch: field
WORKTREE="$HOME/.claude/worktrees/coupette/${BRANCH//\//-}"   # dashes — same naming as the scratchpad dir
git worktree add "$WORKTREE" -b "$BRANCH"
```

Initialize the scratchpad in the **main repo** — one directory per branch, two files. It must NOT live inside the worktree: the scratchpad is gitignored, so `git worktree add` won't carry it over and `git worktree remove` would delete it.

```bash
SCRATCHPAD_DIR="$REPO/.claude/scratchpad/${BRANCH//\//-}"
mkdir -p "$SCRATCHPAD_DIR"

# spec.md — the scoper wrote it here (directory keyed on the spec's Branch: field).
# Verify: ls "$SCRATCHPAD_DIR/spec.md" — if missing, locate it with
# `ls .claude/scratchpad/*/spec.md` and move it here.

# log.md — initialize with header, then paste the scoper's Result block under Stage results
TITLE='Wine availability API'                  # <- substitute the spec's title (single quotes — a title containing $ or backticks must not expand)
cat > "$SCRATCHPAD_DIR/log.md" <<EOF
# Pipeline log: $TITLE

**Branch:** $BRANCH
**Started:** $(date -u +"%Y-%m-%dT%H:%M:%SZ")
**Spec:** $SCRATCHPAD_DIR/spec.md

## Working notes

(Orchestrator updates this between stages: user clarifications, decisions, scope adjustments.)

## Stage results

(Each subagent appends a timestamped result block here. The orchestrator pastes the
scoper's block first — the scoper ran before this file existed.)
EOF
```

**Subagents do NOT inherit your cwd.** Your `cd` only affects your own shell; every spawned agent starts at the session root. So every handoff prompt must state, with absolute paths:

- `WORKTREE=<absolute path>` — "cd there first; all code work happens there"
- `SPEC=$SCRATCHPAD_DIR/spec.md` and `SCRATCHPAD_LOG=$SCRATCHPAD_DIR/log.md` — absolute paths in the main repo; agents must never derive them from `git branch --show-current`

They read **both** scratchpad files:
- `spec.md` — the contract (acceptance criteria, surfaces, out-of-scope)
- `log.md` — prior agents' Result blocks + your Working notes

They append their own Result block to `log.md` on completion. You update **Working notes** in `log.md` between stages with anything Victor said that the next subagent needs to know.

**Append convention for subagents** (defined here as the single source of truth — pass this snippet in every handoff prompt, with the agent's name substituted):

```bash
# SCRATCHPAD_LOG comes from the handoff prompt (absolute path, main repo)
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
printf '### %s <agent-name>\n' "$TS" >> "$SCRATCHPAD_LOG"
cat >> "$SCRATCHPAD_LOG" <<'EOF'
**Status:** ...
...
EOF
```

The header goes through `printf` so `$TS` expands; the body heredoc is single-quoted (`<<'EOF'`) so `$variable` references inside appended markdown stay literal.

Worktree cleanup is **your** job — pr-creator must not remove it. Keep the worktree until the PR **merges** (CI failures and review feedback get fixed there; removing it at PR creation just forces a re-add). After the merge:

```bash
git worktree remove "$WORKTREE"
# If a PR sat open across sessions, sweep merged leftovers anytime:
#   git worktree list   # remove any whose branch is already merged
# Scratchpad directory at $SCRATCHPAD_DIR persists (it lives in the main repo, not
# the worktree) — gitignored, useful for retrospection. Manual cleanup via
# `make clean-scratchpad` or `rm -rf` when no longer needed.
```

The scratchpad is gitignored (covered by `.claude/*` rule). The documenter consumes both `spec.md` and `log.md` to write the permanent session log into `docs/session-logs/` before the worktree is removed.

**Skipping the worktree is a state-changing decision.** Only skip when:
- The user passed an explicit flag like `--no-worktree` or said something like "no worktree" / "in-place" / "skip the worktree"
- OR the user signals it's a test/smoke run of the workflow itself

If you intend to skip, **ANNOUNCE the decision before spawning the next subagent and wait for confirmation** — never skip silently. Phrase: "I read this as a [smoke run / in-place edit]; skipping worktree creation. Confirm or tell me to create one."

## Handoff format

When spawning a subagent, the prompt you pass includes:

1. **Worktree path** (absolute) + the instruction to `cd` there before any code work
2. **Spec path + scratchpad log path** (absolute, in the main repo — every stage after scoper)
3. **The append snippet** from [Append convention](#worktree--scratchpad) above (verbatim, `<agent-name>` filled in — every stage after scoper)
4. **Prior stage's Result block** (verbatim, from `$SCRATCHPAD_DIR/log.md`) — or a 3-line summary if the prior block is large
5. **What you want this subagent to do** (1-3 sentences)
6. **Any user clarification** received since the prior stage
7. **Scoper stage only — the Linear issue body.** If the request references a Linear issue (`VPA-NN`), fetch it yourself via the Linear MCP tools and paste title + description into the scoper's prompt. Subagents have no MCP access — you are the only one who can read Linear.

Subagents don't inherit your conversation — they see only what you put in the prompt. Be explicit. Quote the spec's acceptance criteria rather than paraphrasing.

## Remediation loop (one bounded round-trip before escalating)

When the **reviewer returns BLOCK** or the **test-writer returns BLOCKED because the implementation is wrong**, and every blocker is concrete and actionable (file:line + what's wrong — e.g. missing type hint, wrong schema suffix, unmet acceptance criterion), do ONE remediation pass before involving Victor:

1. Re-spawn the same implementer/specialist with the blocker list **verbatim** from the Result block, plus the instruction "fix exactly these, nothing else".
2. Re-run test-writer (only if tests are affected), then reviewer.
3. **Maximum one loop.** If the second review still BLOCKs, or any blocker is a judgment call (scope question, design disagreement, spec ambiguity), stop and escalate per "If stuck" below.

Announce the loop when you start it ("reviewer blocked on N mechanical issues — running one remediation pass") — don't run it silently. This is the only case where you advance past a BLOCK without waiting for Victor.

## If stuck

If a subagent returns Status: BLOCKED (and the remediation loop above doesn't apply or is exhausted), do NOT spawn the next stage. Surface the blocker to the user with:
- which agent blocked
- the obstacle (verbatim from the agent)
- options to unblock (clarify spec / change approach / abandon)

Wait for the user's decision.

## What you return to the user

After scoper: the spec path + a one-line summary, then "ready to proceed?"
After implementer: a list of files changed and what each contains, then "ready to proceed?"
After documenter: the worktree path + a suggested conventional commit message. **You** (the main session) now commit and push the branch — `git -C "$WORKTREE" add -A && git -C "$WORKTREE" commit -m "..." && git -C "$WORKTREE" push -u origin "$BRANCH"` — before spawning pr-creator. This is the one stage where you act directly rather than spawning a subagent.
After pr-creator: the PR URL + a one-line **Pipeline friction** note — anything that confused an agent this run (bad path, ambiguous instruction, missing tool), or "none".
On any BLOCK from reviewer or any BLOCKED status from a subagent: stop, report the blocker, ask the user how to proceed.

Keep each user-facing report under 30 lines. The scratchpad has the details if Victor wants to dig in.

## Do not

- Edit any file
- Run tests, lint, or migrations yourself — that's the specialist's job
- Skip the documenter step — it is mandatory
- Merge a branch (Victor reviews and merges PRs) — the stage-10 commit/push above is the only exception to "don't act directly"
- Advance to the next stage when the prior stage's status is BLOCKED
