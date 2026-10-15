---
description: Run an unattended CI upkeep pass — triage red PRs (Dependabot and non-Dependabot), manage ignore-file entries, arm auto-merge on qualifying Dependabot PRs and on its own fix PRs, and surface real breaks for human review.
disable-model-invocation: true
---

You are clearing the PR backlog. Invoke the `gardener` agent to do the work, then drive the post-run steps yourself — the goal is zero manual intervention beyond approving decision cards and reviewing "needs attention" notes.

## What this does

1. Invokes the `gardener` agent for one full pass over **all open PRs**:
   - **Dependabot PRs:** triages every red PR (`@dependabot rebase` for staleness, fix branch/PR for real breaks, comment for known-pattern blockers); arms `gh pr merge --auto --squash` on semver-patch/minor PRs with green/pending checks; surfaces semver-major bumps as decision cards
   - **Non-Dependabot PRs (Victor's branches):** triages red CI — rebases onto main when stale, pushes auto-fixable lint/format corrections, handles audit CVE failures via the same ignore-file workflow; never merges these PRs, never edits business logic
   - Produces a "needs rebase after commit" list for PRs whose audit failures are now covered by new ignore entries
2. After the agent returns, the main session automatically:
   - Commits any new `.pip-audit-ignore` / `.trivyignore` / `frontend/.yarn-audit-ignore` entries on a `chore/dependency-ignore-updates` branch and pushes it
   - Creates a PR for those changes
   - Commits, pushes, and opens a PR for each fix branch the gardener prepared
   - Labels every PR it opened `gardener` and arms `gh pr merge --auto --squash` on it when it qualifies (checklist: `.claude/agents/gardener.md` → Gardener fix PRs). PRs that touch application code stay for Victor
   - Rebases PRs in the "needs rebase after commit" list (`@dependabot rebase` for Dependabot; `git rebase origin/main` + push for non-Dependabot) — but only once the fix they depend on has landed on main. Before that, a rebase only burns CI; the next `/garden` run picks them up
3. Prints the gardener's digest plus a summary of what was fixed and which PRs were rebased

## Decision cards and attention notes — the only things needing your input

- **Semver-major Dependabot bump (green CI):** approve with `gh pr merge --squash <PR>` or hold for the next run
- **Non-Dependabot "needs attention" (real code break):** review the failing job and fix it yourself; the gardener can't touch business logic
- **Non-Dependabot "needs attention" (rebase conflicts):** resolve the conflict locally and push

Anything still red after the gardener's pass is left for the next `/garden` run.

## Scope note

`/garden` is **manual-invocation only** for now. A scheduled daily run (`/schedule daily`) is a documented future follow-up, not implemented here — running this command is the only way to trigger a gardener pass.
