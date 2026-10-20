---
name: pr
description: Open or update the pull request into exp/agentic for a ticket whose worker finished ready — checks the branch, builds the body from ops/CONTRACTS.md §1, validates the Red line. Use when the lead opens a PR for an EXP ticket.
argument-hint: "EXP-NN <worktree path>"
---

# /pr

Arguments: $ARGUMENTS — the ticket id and its worktree path.

The lead runs this in the clone. It never rebases, merges or pushes: the head of the PR must stay the commit the reviews saw.

## Steps

1. Read `<worktree>/.crew/result.json`. `status` must be `ready`.
2. Check the branch:

   ```bash
   git fetch -q origin exp/agentic exp-task/EXP-NN
   git rev-parse origin/exp-task/EXP-NN        # must equal reviewed_sha
   git merge-base --is-ancestor origin/exp/agentic origin/exp-task/EXP-NN   # must succeed
   ```

   - The head isn't `reviewed_sha`: stop, and report "head moved".
   - The branch is behind `exp/agentic`: stop, and report "behind". The lead starts a repair worker (`reason=behind`), which merges `exp/agentic` in and re-reviews the new commits.
3. Gather the body's parts:
   - the ticket's title, and its feature issue (or `none`), from Linear
   - `Lane`, `Red` and the counts from `result.json`
   - the journal entry for EXP-NN in the day's `ops/journal/` file: What changed, and the findings with their fixed counts
   - test files: `git diff --name-only origin/exp/agentic...origin/exp-task/EXP-NN`, keeping test files only
4. Write the body to `/private/tmp/exp-lead/EXP-NN.pr.md` in exactly this shape (`ops/CONTRACTS.md` §1):

   ```
   ## EXP-NN <title>
   Feature: EXP-MM | none
   Lane: default | risky
   Red: <sha> | none — <reason, 10+ characters>

   ### What changed
   <outcome first; short sentences>

   ### Evidence
   - Tests: <files>
   - Code review: <n> Important, <n> Nit (fixed: <n>)
   - Security review: clean | <n> real findings (fixed: <n>)

   ### Journal
   ops/journal/<YYYY-MM-DD>.md
   ```

   - The `Red` line uses a literal em dash (—), never `-` or `--`.
   - When the change alters a structure or a flow, add a Mermaid diagram under What changed.
   - Never add the arm, a model, the planner or a round count. The day-7 spot-check is blind.
5. Validate the Red line before anything reaches GitHub:

   ```bash
   grep -cE '^Red: ([0-9a-f]{7,40}|none — .{10,})$' /private/tmp/exp-lead/EXP-NN.pr.md   # must print 1
   ```

6. Title: `<type>: <ticket title> (EXP-NN)`, with the type from the ticket title.
7. Create it: `gh pr create --base exp/agentic --head exp-task/EXP-NN --title "<title>" --body-file /private/tmp/exp-lead/EXP-NN.pr.md`. It exists already? `gh pr edit <n> --body-file …`.
8. Return the PR number and URL.

## Rules

- Base is always `exp/agentic`. Never `main`.
- No CHANGELOG line: `CHANGELOG.md` is the main lane's release history.
- This skill doesn't review code. `/code-review` and `/security-review` ran in the worker.
