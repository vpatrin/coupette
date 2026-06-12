---
description: Run an unattended Dependabot/CVE upkeep pass — triage red Dependabot PRs, manage ignore-file entries, and arm auto-merge on qualifying PRs.
disable-model-invocation: true
---

You are clearing the Dependabot backlog. Invoke the `gardener` agent to do the work; this command just kicks off a single run and surfaces its digest.

## What this does

1. Invokes the `gardener` agent for one full pass over open Dependabot PRs:
   - Triages every red Dependabot PR (`@dependabot rebase` for staleness, fix branch/PR for real breaks)
   - Reviews CVE clusters that can't go green individually and updates `.trivyignore` / `.pip-audit-ignore` with justified, dated entries per `.claude/rules/packaging.md` — only after `poetry update`/`yarn upgrade` has been tried
   - Arms `gh pr merge --auto --squash` on Dependabot PRs that are semver-patch or semver-minor and have green/pending required checks
2. Prints the gardener's end-of-run digest (triaged, ignore entries added, auto-merge armed on, still red)

## After the run

The gardener stages and prepares changes but does not commit or push. Review the digest and any ignore-file edits or fix branches it produced, then:

- If `.trivyignore` / `.pip-audit-ignore` were edited, commit those changes yourself on a non-main branch (e.g. `chore/dependency-ignore-updates`) and push
- If a fix branch was prepared for a real breaking change, commit and push it from the main session, then run it through the normal pipeline (`/fix`) for review before merging
- Anything still red is left for the next `/garden` run or manual investigation

## Scope note

`/garden` is **manual-invocation only** for now. A scheduled daily run (`/schedule daily`) is a documented future follow-up, not implemented here — running this command is the only way to trigger a gardener pass.
