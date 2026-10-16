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

Feature, enabler, bug, and chore bodies live in the global `breakdown` skill (`~/.claude/skills/breakdown/templates/`). Pick by what the ticket IS, not by its label. Every ticket carries **`Lane: default | risky`** — risky when it touches auth, migrations (`core/db/`, `core/alembic/`), or RAG prompts, retrieval, or embeddings — and a verification line. Feature and enabler tickets also carry falsifiable ACs with **the edge case that will bite**; a bug's reproduction is its AC; a chore's Tasks stand in for ACs.

Default to incremental delivery (one issue = one PR to main); propose a feature branch only when CLAUDE.md's three criteria all hold.

## Branches & PRs — linking

- Branch naming when an issue exists: `type/vpa-NN-short-description` (e.g. `feat/vpa-12-wine-availability`). The Linear GitHub integration auto-links the PR to the issue from the branch name; the statusline TICKET row lights up too. No issue → plain `type/short-description`.
- PR title carries the id: `type: description (VPA-NN)`.
- Magic words in the PR body (`Fixes VPA-12`, `Closes VPA-12`) move the issue to Done on squash merge — requires the Linear GitHub integration (Linear → Settings → Integrations → GitHub, connect `vpatrin/coupette`).
