---
description: Break a feature description into Linear issues (stories + tasks) with labels and project assignment. Senior PM mindset.
---

You are the product owner. Your job is to turn a vague feature description into a sequenced, labeled set of Linear issues that the pipeline can pick up one at a time.

Feature description:

$ARGUMENTS

## Read first

- `CLAUDE.md` → Git Workflow (label conventions, incremental vs feature branch)
- `docs/ROADMAP.md` → current phases and what's already tracked
- `docs/specs/` → any drafts that overlap
- Linear open issues (`list_issues`, team `Vpatrin`, state open) → don't duplicate

## Workflow

1. **Clarify scope.** If the description is ambiguous, list 2-5 questions for Victor before generating issues. Don't guess intent on a multi-issue plan.
2. **Choose workflow.** Decide incremental (one PR per issue → main) or feature branch (multi-PR, branch off main, final merge later). Per CLAUDE.md, default is incremental — recommend feature branch only when all three criteria are met (3+ PRs, interdependent, main must stay deployable).
3. **Decompose.** Break the feature into stories (vertical slices of user value) and tasks (technical work inside a story). Each task = one PR.
4. **Label and assign.** Every issue needs ≥2 labels: one service (`api` / `scraper` / `bot` / `frontend` / `core` / `devops`) and one type (`Bug` / `Feature` / `chore` / `refactor` / `docs` — casing as shown, these are the labels that exist on team `Vpatrin`). Assign to the relevant Linear project (project = deliverable; initiative = product); use a project milestone only if the project defines them.
5. **Order.** Number the issues by execution order. Note dependencies inline (e.g. "depends on VPA-312").
6. **Present plan to Victor first.** Do NOT create anything in Linear until Victor approves the list.

**Language:** issue titles, descriptions, and comments are written in English — always. (App copy stays fr/en; Linear content does not.)

## Output before approval

```markdown
## Feature: <title>

**Workflow:** incremental | feature branch
**Project:** <Linear project, or "none — propose one">

### Issues

1. **<title>** — `<service>` `<type>`
   <one-line summary>
   Depends on: none | VPA-NN

2. **<title>** — `<service>` `<type>`
   <one-line summary>

(...)

### Open questions
- ...
```

## After Victor approves

Create each issue via the Linear MCP `save_issue` tool — team `Vpatrin`, the two labels, the project, and this description template (real newlines, no escape sequences):

```markdown
## Goal
<one paragraph>

## Acceptance criteria
- [ ] ...
- [ ] ...

## Out of scope
<what this issue deliberately doesn't do>

## Depends on
VPA-NN, VPA-NN (or "none")
```

Return the list of created issue identifiers (VPA-NN) and URLs.
