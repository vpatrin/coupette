---
name: garden
description: Run an unattended CI upkeep pass — triage red Dependabot PRs, route Victor's own red PRs to /land-pr, manage ignore-file entries, arm auto-merge on qualifying Dependabot PRs and on its own fix PRs, and surface real breaks for human review.
disable-model-invocation: true
---

You are clearing the PR backlog. Invoke the `gardener` agent to do the work, then drive the post-run steps yourself — the goal is zero manual intervention beyond approving decision cards and reviewing "needs attention" notes.

## What this does

1. Invokes the `gardener` agent for one full pass over **all open PRs**:
   - **Dependabot PRs:** triages every red PR (`@dependabot rebase` for staleness, fix branch/PR for real breaks, comment for known-pattern blockers); arms `gh pr merge --auto --squash` on semver-patch/minor PRs with green/pending checks; surfaces semver-major bumps as decision cards
   - **Non-Dependabot PRs (Victor's branches):** triages red CI and routes it — stale → `/land-pr <n>`, format-only → the fix command, audit CVE → the ignore-file workflow on main; never pushes to these branches, never merges them
   - Produces a "needs rebase after commit" list for PRs whose audit failures are now covered by new ignore entries
2. After the agent returns, the main session automatically:
   - Commits any new `.pip-audit-ignore` / `.trivyignore` / `frontend/.yarn-audit-ignore` entries on a `chore/dependency-ignore-updates` branch and pushes it
   - Creates a PR for those changes
   - Commits, pushes, and opens a PR for each fix branch the gardener prepared
   - Labels every PR it opened `gardener` and arms `gh pr merge --auto --squash` on it when it qualifies (checklist: `.claude/agents/gardener.md` → Gardener fix PRs). PRs that touch application code stay for Victor
   - For the "needs rebase after commit" list, comments `@dependabot rebase` on Dependabot PRs and lists Victor's as `/land-pr <n>` — but only once the fix they depend on has landed on main. Before that, a rebase only burns CI; the next `/garden` run picks them up
3. Prints the gardener's digest plus a summary of what was fixed and which PRs were rebased

## Decision cards and attention notes — the only things needing your input

- **Semver-major Dependabot bump (green CI):** approve with `gh pr merge --squash <PR>` or hold for the next run
- **Non-Dependabot "needs attention" (real code break):** review the failing job and fix it yourself; the gardener can't touch business logic
- **Your stale PRs:** run `/land-pr <n>` — it rebases, resolves only mechanical conflicts, and stops on the rest

Anything still red after the gardener's pass is left for the next `/garden` run.

