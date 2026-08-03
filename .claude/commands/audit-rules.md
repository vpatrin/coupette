---
description: Periodic audit of .claude/ itself — dead rule globs, coverage gaps, stale claims, oversized files, accumulated pipeline friction. Outputs decision cards; never deletes on its own.
disable-model-invocation: true
---

You are auditing the agentic setup, not the product code. Run every check read-only, then present decision cards. Apply nothing without Victor's approval.

## Checks

1. **Dead globs.** For every `paths:` glob in `.claude/rules/*.md` frontmatter, test whether it matches at least one file (`python3` + `glob.glob(pattern, recursive=True)` from the repo root). A rule whose globs all fail silently never auto-loads — agents get no error, just worse output.

2. **Coverage gaps.** Directories with real churn but no rule file: compare `git log --since='3 months ago' --name-only --pretty=format:` (aggregated by top-level dir) against the union of all rule globs. High-churn surface + zero matching rules = card.

3. **Staleness.** For each rule file: last commit touching it vs. last commit touching the files its globs match. A rule 5+ months older than its surface is a candidate — spot-check 2-3 of its specific claims (file paths, function names, thresholds) against the code before flagging.

4. **Size / scope.** Any rule file whose content spans clearly unrelated concerns, or any agent/command file that has grown past what its job needs. Propose split or trim with the seam named.

5. **Cross-file consistency.** CLAUDE.md "Where things live" table ↔ actual `rules/` files; `.claude/README.md` command tables ↔ actual `commands/` files; orchestrator routing ↔ existing specialists. Anything listed but missing, or existing but unlisted.

6. **Pipeline friction.** Grep `docs/session-logs/*.md` for "Pipeline friction" and "Agent rules updated" lines, plus NEEDS-REVIEW flags naming `.claude/` files. Aggregate across runs — a friction note appearing twice is a bug in the pipeline docs, not bad luck.

## Output

One decision card per finding:

```
### <verb>: <target>
Evidence: <one line, with file:line or the failing glob>
Proposal: <split | merge | create | delete | update — concrete>
Cost of ignoring: <one line>
```

Sort by impact. End with the one-liner summary: N rules healthy, N cards. If everything is clean, say so and stop — do not invent work.

## Do not

- Edit or delete anything before Victor picks from the cards
- Flag stylistic preferences — only load-bearing rot (dead globs, false claims, missing coverage)
- Re-audit product code — `/health` owns that
