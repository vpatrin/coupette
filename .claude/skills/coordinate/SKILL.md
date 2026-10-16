---
name: coordinate
description: Run the main Superset workspace as the coordinator — dispatch one /feature worker per ready VPA ticket into its own workspace, monitor, relay blocks and choices to Victor, verify CI and evidence before reporting, and track harness friction. Never edits code. Use in the main workspace when asked to dispatch, start, or check on ticket work.
argument-hint: "[VPA-NN …]"
---

# /coordinate — the main workspace dispatches, workers build

Tickets: $ARGUMENTS — none means report on the work already running.

You never edit code, commit, or open PRs; workers do, one ticket each, through `/feature`. For Superset transport, load the `superset:orchestrate` skill and follow its control-surface checks, terminal commands, and worker envelopes; this skill adds the Coupette rules.

## State — rebuilt, never stored

No scratchpad, no log. After any restart, rebuild the view from:

- **Linear:** tickets In Progress, each with its dispatch comment (workspace name)
- **Superset:** `superset workspaces list --local --json`, `superset terminals list --workspace <id> --local --json`
- **GitHub:** `gh pr list --state open --json number,title,headRefName,isDraft,statusCheckRollup`

## Before dispatch — per ticket

1. **Ready:** falsifiable ACs, the edge case that will bite, an end-to-end verification line, a `Lane:`. Not ready → run `/breakdown` on it first.
2. **Not a duplicate:** no open PR whose title or branch carries the id, no workspace named after it, no dispatch comment on the ticket.
3. **No overlap:** compare the ticket's surfaces with each running worker's; overlapping tickets run one after the other.
4. **Fresh base:** `git fetch origin main`.

## Dispatch

1. Create the workspace and start the worker in one call:
   ```bash
   superset workspaces create --local --project <coupette id from `superset projects list --local --json`> \
     --name vpa-NN --branch <type>/vpa-NN-<short> --skip-branch-prefix --base-branch main \
     --agent claude --prompt "/feature VPA-NN — when finished, end with the SUPERSET_WORKER_DONE envelope (summary: the PR URL) or SUPERSET_WORKER_BLOCKED" --json
   ```
2. Once its first turn ends, `superset terminals send` `/rename VPA-NN`, then `/goal every AC in .claude/progress.md passes and lint/tests are green` — a skill can't run either.
3. Linear: set the ticket In Progress and comment `Dispatched to Superset workspace vpa-NN (<branch>).`

## Monitor and relay

Read every running terminal at each pass. A worker waiting on `AskUserQuestion`, a risky-lane plan checkpoint, or a BLOCKED envelope → tell Victor which workspace needs him and why, one line each. Never answer for him. Count each such touchpoint per ticket.

## Verify before reporting done

- CI green: `gh pr checks <n>`.
- PR body: an AC → evidence row for every acceptance criterion (named test, runnable command, or artifact), a Decisions section, a Review line that isn't BLOCK.
- Report the PR URL, lane, and touchpoints, and say which worker claims you could not confirm.

## After a merge

- Comment on the ticket: the PR, touchpoints (count and what they were), and the Harness friction line.
- The same friction in two PRs → draft a one-line fix to the `.claude/` file it names, for the next worker's PR or a small PR of its own; Victor approves it at merge. Never edit `.claude/` from here.
- Remove workspaces and branches only when Victor asks.
