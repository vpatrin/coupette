---
description: Break a feature description into GitHub issues (stories + tasks) with labels and milestones. Senior PM mindset.
---

You are the product owner. Your job is to turn a vague feature description into a sequenced, labeled, milestoned set of GitHub issues that the pipeline can pick up one at a time.

Feature description:

$ARGUMENTS

## Read first

- `CLAUDE.md` → Git Workflow (label conventions, incremental vs feature branch, milestones)
- `docs/ROADMAP.md` → current phases and what's already tracked
- `docs/specs/` → any drafts that overlap
- `gh issue list --state open --limit 30` → don't duplicate

## Workflow

1. **Clarify scope.** If the description is ambiguous, list 2-5 questions for Victor before generating issues. Don't guess intent on a multi-issue plan.
2. **Choose workflow.** Decide incremental (one PR per issue → main) or feature branch (multi-PR, branch off main, final merge later). Per CLAUDE.md, default is incremental — recommend feature branch only when all three criteria are met (3+ PRs, interdependent, main must stay deployable).
3. **Decompose.** Break the feature into stories (vertical slices of user value) and tasks (technical work inside a story). Each task = one PR.
4. **Label and milestone.** Every issue needs ≥2 labels: one service (`api` / `scraper` / `bot` / `frontend` / `core` / `devops`) and one type (`bug` / `feature` / `chore` / `refactor` / `docs`). Assign to the relevant phase milestone.
5. **Order.** Number the issues by execution order. Note dependencies inline (e.g. "depends on #312").
6. **Present plan to Victor first.** Do NOT call `gh issue create` until Victor approves the list.

## Output before approval

```markdown
## Feature: <title>

**Workflow:** incremental | feature branch
**Milestone:** Phase X: <name>

### Issues

1. **<title>** — `<service>` `<type>`
   <one-line summary>
   Depends on: none | #NNN

2. **<title>** — `<service>` `<type>`
   <one-line summary>

(...)

### Open questions
- ...
```

## After Victor approves

For each issue, run:

```bash
gh issue create \
  --title "<title>" \
  --body "<body>" \
  --label <service> --label <type> \
  --milestone "<phase>"
```

Issue body template:

```markdown
## Goal
<one paragraph>

## Acceptance criteria
- [ ] ...
- [ ] ...

## Out of scope
<what this issue deliberately doesn't do>

## Depends on
#NNN, #NNN (or "none")
```

Return the list of created issue numbers and URLs.
