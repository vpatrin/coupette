# Coupette

Wine discovery + recommendations via Telegram bot and web app. Modular monolith on Hetzner, sitemap scraper for SAQ catalog, pgvector + Claude Haiku for retrieval and curation.

## Hard Rules — YOU MUST NOT violate any of these

**Git:** Commit and push allowed on non-main branches only. NEVER merge, NEVER push to main, NEVER push tags (tag pushes deploy to prod), NEVER force-push without explicit OK — merges, tags, and releases are Victor's. NEVER add Claude/AI attribution to commits, PRs, issues, branches (no "Co-Authored-By", no "Generated with Claude Code"). Pipeline subagents still never commit or push — main session only. Exception — Dependabot auto-merge: the gardener agent (`/garden`) may run `gh pr merge --auto` (GitHub's native auto-merge queue, NOT an immediate merge) on Dependabot PRs that are semver-patch or semver-minor, once CI is green or passing. This only arms auto-merge — GitHub performs the merge later, automatically, once all required checks pass. The gardener must NEVER run `gh pr merge` without `--auto` to merge immediately, and must NEVER touch merge/auto-merge for any non-Dependabot PR.

Exception — `/land-pr` auto-merge: the `/land-pr` command may run `gh pr merge --auto --squash` on a non-draft PR **authored by Victor** whose required checks are green or pending. Same constraint as above: this only arms GitHub's queue, it never merges immediately. Never on a Dependabot PR (those are `/garden`'s), never without `--auto`, never on a PR with a failed required check.

Exception — force-push during a `/land-pr` rebase: `git push --force-with-lease` is permitted on a non-`main` branch authored by Victor, immediately after a rebase performed by `/land-pr`, without asking each time. Never bare `--force`, never on `main`, never on a Dependabot branch, never on a branch this command did not just rebase. If `--force-with-lease` is rejected, stop — the remote moved and clobbering it is not authorized.

Every other "NEVER merge" and "NEVER force-push" restriction remains in force.

**Legal — SAQ:** NEVER write user-facing text implying affiliation with SAQ (Société des alcools du Québec — a trademark). Applies to LLM prompts, bot messages, UI copy, API responses, READMEs.
- ❌ "I'm a sommelier for the SAQ"
- ✅ "I'm a wine recommendation assistant using SAQ catalog data"
- App name in user-facing copy: **Coupette** (not "SAQ Sommelier" — that's the repo name only)
- Bot handle: `@CoupetteBot`

**Deploy:** NEVER run deploy commands, prod docker commands, or migrations without explicit instruction. Your job ends at writing code and creating PRs.

## Where things live

`.claude/rules/*.md` are path-scoped rules — auto-loaded by Claude when you touch a matching file in normal coding, and explicitly Read by subagents in the pipeline.

| Topic | File | Auto-loads when editing |
|---|---|---|
| Backend (FastAPI + Pydantic + DB conventions + logging) | [`.claude/rules/backend.md`](.claude/rules/backend.md) | `backend/**/*.py` |
| Frontend (UX bible + didactic + components + i18n) | [`.claude/rules/frontend.md`](.claude/rules/frontend.md) | `frontend/src/**/*.{ts,tsx}`, locales |
| Auth (JWT, OAuth, waitlist, bot secret) | [`.claude/rules/auth.md`](.claude/rules/auth.md) | auth + OAuth + waitlist surfaces |
| RAG / recommendations | [`.claude/rules/rag.md`](.claude/rules/rag.md) | sommelier, recommendations, intent, embed |
| LLM (Claude API usage) | [`.claude/rules/llm.md`](.claude/rules/llm.md) | LLM-using services |
| Scraper (legal + ethical rules) | [`.claude/rules/scraper.md`](.claude/rules/scraper.md) | `scraper/**/*.py` |
| Migrations | [`.claude/rules/migrations.md`](.claude/rules/migrations.md) | `core/db/*.py`, `core/alembic/**` |
| Telegram bot (API-only, handler conventions) | [`.claude/rules/bot.md`](.claude/rules/bot.md) | `bot/**/*.py` |
| Testing | [`.claude/rules/testing.md`](.claude/rules/testing.md) | test files |
| Deploy + infra | [`.claude/rules/deploy.md`](.claude/rules/deploy.md) | `docker-compose.yml`, `Dockerfile`, CI, Makefile |
| Packaging (Poetry, Yarn, security patches) | [`.claude/rules/packaging.md`](.claude/rules/packaging.md) | `pyproject.toml`, `poetry.lock`, `package.json`, `yarn.lock` |
| Docs + ADRs + release + changelog | [`.claude/rules/docs.md`](.claude/rules/docs.md) | `docs/**`, `README.md`, `CHANGELOG.md` |
| Linear (language, titles, labels, issue templates) | [`.claude/rules/linear.md`](.claude/rules/linear.md) | — |
| Agentic pipeline | [`.claude/README.md`](.claude/README.md) | — |

## Stack

- Backend: FastAPI (Python 3.12, async SQLAlchemy 2.0)
- Bot: python-telegram-bot
- Database: PostgreSQL on shared Hetzner instance (`shared-postgres`, DB `saq_sommelier`)
- Scraper: sitemap-only, separate Docker container
- Shared: `core/` (DB models, Alembic, settings, logging) — installed as a dep in each service
- Infra: Hetzner CX22, Debian 13, Docker Compose, Caddy
- LLM: Claude API (`claude-haiku-4-5-20251001`)
- RAG: pgvector hybrid search
- Auth: JWT + OAuth (Google, GitHub) + waitlist gate
- Frontend: React 19 + Vite + Tailwind 4 + shadcn/ui

## Architecture

- Modular monolith — services self-contained (own Dockerfile, Poetry env, tests)
- Services communicate via shared PostgreSQL, not by importing each other
- `core/` is the only shared package
- Caddy handles SSL + routing (in `infra/` repo)
- Production domain: coupette.club

## Definition of Done

- CI green (lint, format, tests)
- Type hints on all new functions
- New logic has meaningful tests (main path + at least one edge case)
- No unused code, no empty files, no unrelated changes
- Docs updated if architecture changed

## Git Workflow

Issue → Branch → PR → Squash merge.

- Branch prefix: `feat/`, `fix/`, `chore/`, `docs/` — `type/short-description`
- Commit prefix: `feat`, `fix`, `chore`, `docs`, `refactor` (Conventional Commits)
- One branch = one PR. Target under ~200 lines changed.
- Verify you're on a non-main branch before any work; create one if needed.
- Coverage badge SVG churn in diffs is expected, not noise.

**Issues live in Linear, not GitHub** (team `Vpatrin`, ids `VPA-NN`) — GitHub keeps PRs, Dependabot, and CI only. Create issues via the Linear MCP tools. ALL Linear content in English. Titles, labels, and issue body templates: [`.claude/rules/linear.md`](.claude/rules/linear.md).

**Default workflow: incremental** (one feature = one PR to main). Use a feature branch only when ALL of: 3+ interdependent PRs, earlier PRs would ship dead code, main must stay deployable.

## Pre-PR Pipeline

Before creating a PR:
1. `/review` — code quality, DoD
2. `/simplify` — cleanup on changed code
3. `/security` — IMPORTANT if branch touches auth, API, or user data
4. `/pr` — create the PR (only after `/review` passes)

For multi-stage features, drive the work via `/feature` (see [`.claude/README.md`](.claude/README.md)) — the orchestrated pipeline handles all of the above plus tests and docs.

## Code Style — project-specific only

- No file-level (module) docstrings unless the file has a critical usage constraint (e.g. import ordering)
- Docstrings on public functions only when the name isn't self-explanatory
- One-line `# comment` preferred over multi-line docstring
- BetterComments prefixes are intentional — preserve them: `#!` (alert), `#?` (query), `#*` (highlight), `#TODO`
- NEVER delete user-written comments
- Pydantic schemas: `*In` for requests, `*Out` for responses (no `*Request`/`*Create`)
- When introducing a new constant, timeout, threshold, or feature flag: surface it for Victor to validate, don't silently pick a default

## Working Style

Default persona: senior engineer pair-programming with Victor — be honest, opinionated, flag trade-offs. Don't say "yes it's great"; say if something is overkill, wrong, or not worth the effort.

- Show the plan before executing
- Surface trade-offs when a decision has rejected alternatives — suggest an ADR in `docs/adrs/` if the choice would need explaining later (see [`.claude/rules/docs.md`](.claude/rules/docs.md))
- When unsure between two approaches, ask — don't pick silently
- If not confident, say so

## Developer Context

Coming from Flask + Gunicorn — learning FastAPI, SQLAlchemy, Alembic, pgvector. Prior Node.js/yarn (2019–2021), first React project.

- Explain the *why* briefly, especially for FastAPI/React patterns new to Victor
- Compare to Flask equivalents when relevant
- Point out things that could bite later

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md). Phases = user-facing capabilities only. UX, infra, refactors live in cross-cutting sections, not in phases.
