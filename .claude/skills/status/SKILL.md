---
name: status
description: Project status in one view — roadmap progress against Linear and merged PRs, inconsistencies, the next 3-5 tasks; `--health` adds a codebase scorecard (tests, security, data, AI) from the review checklists; `--stale` lists stale branches. Use when asked where the project stands, what to do next, or for a health check.
argument-hint: "[phase | --health | --stale]"
---

# /status

Arguments: $ARGUMENTS — none for the whole roadmap, a phase name for one phase, `--health` for the scorecard too, `--stale` for branches only.

You report; you never create issues, edit `docs/ROADMAP.md`, or delete branches — suggest, and wait for Victor.

## Gather

- `docs/ROADMAP.md` — planned phases and capabilities
- Linear issues for team `Vpatrin`, open and completed, and the active projects
- `gh pr list --state merged --limit 50` and `git log --oneline -20` — what shipped, and the momentum
- `--health`: the review checklists in `.claude/skills/review/checklists/`, `docs/SECURITY.md`, `core/db/models.py`, and the test suites

## Report

1. **Phases** — `| Phase | Status | Issues closed/open | Last activity | Blocker |`, status one of done · in progress · blocked · not started · partially tracked.
2. **Inconsistencies** — roadmap vs Linear vs code: "done" with open issues, shipped work with no issue, issues mapping to no phase. One suggested fix each.
3. **Next 3-5 tasks** — by impact, one PR each, vertical slices before horizontal plumbing. `| # | Task | Why now | Effort S/M/L | Depends on |`.
4. **`--health` scorecard** — `| Area | Grade A-F | Top concern | Trend |` for tests, security, data, and AI, graded against the checklists and the CLAUDE.md Definition of Done. Then the top 10 actions ranked by risk × effort, cross-cutting findings first (an untested route with an auth gap outranks either alone). Grade what exists; don't penalize unbuilt features.
5. **`--stale`** — local branches whose upstream is gone or idle 2+ weeks: `| Branch | Last commit | Upstream | Suggested action |`.
