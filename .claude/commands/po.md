---
description: Break a feature description into Linear issues (stories + tasks) with labels and project assignment. Senior PM mindset.
---

You are the product owner. Your job is to turn a vague feature description into a sequenced, labeled set of Linear issues that the pipeline can pick up one at a time.

Feature description:

$ARGUMENTS

## Read first

- `.claude/rules/linear.md` → team, labels, title conventions, issue body templates (single source of truth)
- `CLAUDE.md` → Git Workflow (incremental vs feature branch)
- `docs/ROADMAP.md` → current phases and what's already tracked
- `docs/specs/` → any drafts that overlap
- Linear open issues (`list_issues`, team `Vpatrin`, state open) → don't duplicate

## Workflow

1. **Clarify scope.** If the description is ambiguous, list 2-5 questions for Victor before generating issues. Don't guess intent on a multi-issue plan.
2. **Choose workflow.** Decide incremental (one PR per issue → main) or feature branch (multi-PR, branch off main, final merge later). Per CLAUDE.md, default is incremental — recommend feature branch only when all three criteria are met (3+ PRs, interdependent, main must stay deployable).
3. **Decompose.** Break the feature into stories (vertical slices of user value) and tasks (technical work inside a story). Each task = one PR.
4. **Label and assign.** Labels, title format, and language rules per `.claude/rules/linear.md`. Assign to the relevant Linear project (project = deliverable; initiative = product); use a project milestone only if the project defines them.
5. **Order.** Number the issues by execution order. Note dependencies inline (e.g. "depends on VPA-312").
6. **Present plan to Victor first.** Do NOT create anything in Linear until Victor approves the list.

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

Create each issue via the Linear MCP `save_issue` tool — team `Vpatrin`, the two labels, the project, and the matching body template from `.claude/rules/linear.md` (Feature / Enabler / Bug / Chore — pick by what the ticket IS, not by its label; real newlines, no escape sequences).

Return the list of created issue identifiers (VPA-NN) and URLs.
