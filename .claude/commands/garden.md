---
description: Run an unattended Dependabot/CVE upkeep pass — triage red Dependabot PRs, manage ignore-file entries, and arm auto-merge on qualifying PRs.
disable-model-invocation: true
---

You are clearing the Dependabot backlog. Invoke the `gardener` agent to do the work, then drive the post-run steps yourself — the goal is zero manual intervention beyond approving decision cards.

## What this does

1. Invokes the `gardener` agent for one full pass over open Dependabot PRs:
   - Triages every red Dependabot PR (`@dependabot rebase` for staleness, fix branch/PR for real breaks, comment for known-pattern blockers)
   - Detects `audit-*` failures and handles them: tries `yarn upgrade`/`poetry update` first; if blocked, adds ignore entries to `.pip-audit-ignore`, `.trivyignore`, and/or `Makefile audit-frontend` (`--ignore-advisory`) with dated justification comments
   - Arms `gh pr merge --auto --squash` on Dependabot PRs that are semver-patch or semver-minor and have green/pending required checks
   - Surfaces green semver-major bumps as decision cards (changelog + risk + recommendation) for you to approve or hold — never auto-merged
   - Produces a "needs rebase after commit" list of PRs whose CVE failures are now covered by the new ignore entries
2. After the agent returns, the main session automatically:
   - Commits any changes to `.pip-audit-ignore`, `.trivyignore`, and/or `Makefile` on a `chore/dependency-ignore-updates` branch and pushes it
   - Creates a PR for those changes
   - Comments `@dependabot rebase` on every PR in the "needs rebase after commit" list
3. Prints the gardener's digest plus a summary of what was committed and which PRs were rebased

## Decision cards — the only thing needing your input

For each **decision card** (green semver-major bump), read the recommendation and either:
- Approve: `gh pr merge --squash <PR>` — your call; the gardener never merges majors
- Hold: leave it for a later `/garden` run

Anything still red after rebases is left for the next `/garden` run or manual investigation.

## Scope note

`/garden` is **manual-invocation only** for now. A scheduled daily run (`/schedule daily`) is a documented future follow-up, not implemented here — running this command is the only way to trigger a gardener pass.
