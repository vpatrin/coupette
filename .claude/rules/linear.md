# Linear

> Read before creating or editing anything in Linear — issues and comments.

Team `EXP` (issue ids `EXP-NN`). All crew work lives in the project "Agentic experiment". The crew writes issues and comments in team EXP only. It can't create labels, projects or documents, and it never deletes. GitHub keeps PRs and CI only — never open GitHub issues.

## Language

Everything in English: titles, descriptions, comments. (The app stays bilingual fr/en — that rule is for product copy, not Linear.) When an issue quotes actual app copy, keep the French string as-is in quotes.

## Titles

`feat|fix|chore|refactor|docs: <verb phrase>` — Conventional Commit prefix. No sequence numbers (`feat: 1 — …` ❌): build order lives in `blocked by` links, not titles.

## Labels — only these, lowercase

- Type, exactly one: `feature` · `bug` · `improvement` (`feat` → `feature`, `fix` → `bug`, `chore`/`refactor`/`docs` → `improvement`)
- Service, one or more: `api` · `scraper` · `bot` · `frontend` · `core` · `devops`
- The thesis record carries `improvement` only.
- A label you need doesn't exist? Don't invent one. Use the closest one, and add a line under For Victor in `ops/STATUS.md`.

## Lane

Every ticket carries **`Lane: default | risky`**. Risky when it touches auth (the paths in `rules/auth.md`), migrations (`core/db/`, `core/alembic/`), or RAG prompts, retrieval or embeddings. The risky lane gets `/code-review xhigh` and is never a solo-arm ticket.

## States

- **Todo**: ready to pick.
- **In Progress**: a worker or QA run has it.
- **Done**: a ticket is merged; a feature passed QA.
- **Backlog**: parked. Never picked again; a smaller ticket may replace it.

## Feature (parent issue)

Title `feat: <capability>`, label `feature` plus services. Body:

```
## Why
<the user, the problem, the thesis line it serves — 2 or 3 sentences>

## Journeys
J1 <title>
1. <do> → <expect>
2. <do> → <expect>

J2 <title>
1. <do> → <expect>
```

- 2 to 5 journeys, written before any code. They are the QA contract (`/verify` parses this shape).
- Each step is a user action and a result you can see in a screenshot or a response body.
- Every journey runs on the synthetic seed, without saq.com and without embeddings.
- Once the first child starts, never edit a journey. Add `J<n+1>` instead.

## Ticket (child issue)

Title `<type>: <verb phrase>`, a type label plus services, parent = the feature. Body:

```
## Goal
<one sentence: the outcome a user or the code gains>

## Acceptance criteria
- [ ] <falsifiable: given …, when …, then …>

## Edge case that will bite
<one case>

Lane: default | risky
Verify: <the test or command that proves it>
```

## Bug

Title `fix: <what breaks>`, label `bug` plus services, parent = the feature when QA found it. Body:

```
## Reproduction
1. <step>
Expected: <…>
Observed: <…>

Journey: EXP-MM J<n> | smoke test | none
Introduced by: EXP-NN | unknown
Lane: default | risky
Verify: a red test reproduces it
```

The reproduction is the AC: the red test is the reproduction.

## Branches and PRs

- `exp-ws` creates the branch: `exp-task/EXP-NN` for a ticket, `exp-qa/EXP-MM` for QA.
- PR title `<type>: <title> (EXP-NN)`. The body follows `ops/CONTRACTS.md` §1 and has no magic words: the lead moves the issue to Done after the merge.
