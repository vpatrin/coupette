# Linear

> Read before creating or editing anything in Linear — issues, projects, comments.

Team `Vpatrin` (key `VPA` — issue ids are `VPA-NN`; MCP tools take the name `Vpatrin`). Initiative = product, project = deliverable. GitHub keeps PRs, Dependabot, and CI only — never open GitHub issues.

## Language

Everything in English: titles, descriptions, comments, project summaries. (The app stays bilingual fr/en — that rule is for product copy, not Linear.) When an issue quotes actual app copy, keep the French string as-is in quotes.

## Titles

`feat|fix|chore|refactor|docs: <verb phrase>` — Conventional Commit prefix. No sequence numbers (`feat: 1 — …` ❌) — execution order lives in the project, not the title. Workstream codes that carry meaning survive as a suffix: `feat: SQL signal aggregation service (B1)`.

## Labels — every issue gets ≥2

- Service: `api` · `scraper` · `bot` · `frontend` · `core` · `devops`
- Type: `Bug` · `Feature` · `chore` · `refactor` · `docs` — casing as it exists in the workspace (`Bug`/`Feature` are Linear defaults; rename them lowercase in the Linear UI if wanted — MCP has no rename, and until then agents must use the capitalized names)
- `Improvement` exists in the workspace but is unused — don't apply it

## Issue templates

Three body shapes. Pick by what the ticket IS, not by its label.

### Feature — user-facing

The user story doubles as a sizing test: if you can't write a meaningful "so that", the slice is too technical or too thin; if you need several, it's an epic — split it. Never "As an engineer/developer".

```markdown
## User story
As a [visitor|user|admin|subscriber], I want [capability] so that [benefit].

## Context
Background, roadmap link, why now. One paragraph.

## Scope
**In:**
- …

**Out:**
- … (link the ticket that covers it)

## Acceptance criteria
- [ ] Observable behavior, not implementation steps
- [ ] Include the edge case that will bite

## Dependencies & references
- Blocked by / blocks: VPA-xx
- Mockups (`ui/…`), ADRs
```

Optional `## Open questions` section when a decision is pending — delete otherwise.

### Enabler — schema, endpoints, plumbing behind a user story

No user story (forcing one is theater). Same template, but replace `## User story` with a first line:

```markdown
Enabler for [the user story / project it unblocks].
```

Sizing test still applies: an enabler that unblocks no identifiable story shouldn't exist. Developer tooling, pipeline, and devops tickets are never user-facing — no user story there either.

### Bug

```markdown
## Summary
One line — what breaks, where.

## Steps to reproduce
1. …

## Expected vs actual
Expected: …
Actual: … (exact error message)

## Impact
Who hits it, how often, workaround or not.

## Suspected cause
`file:line` if known — delete if not.

## Definition of fixed
- [ ] Fix
- [ ] Regression test covering the repro
```

### Chore / refactor / docs

No template — `## Context` + `## Tasks` checklist (+ references). No user story ever.
