# Coupette

Wine discovery + recommendations via Telegram bot and web app. Modular monolith on Hetzner, sitemap scraper for SAQ catalog, pgvector + Claude Haiku for retrieval and curation.

## Hard Rules — YOU MUST NOT violate any of these

**Git:** NEVER commit, push, or merge — Victor does. NEVER add Claude/AI attribution to commits, PRs, issues, branches (no "Co-Authored-By", no "Generated with Claude Code"). Create local branches; create PRs via `gh pr create` after Victor pushes.

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
| Migrations | [`.claude/rules/migrations.md`](.claude/rules/migrations.md) | `core/db/models/**`, `core/alembic/**` |
| Testing | [`.claude/rules/testing.md`](.claude/rules/testing.md) | test files |
| Deploy + infra | [`.claude/rules/deploy.md`](.claude/rules/deploy.md) | `docker-compose.yml`, `Dockerfile`, CI, Makefile |
| Docs + ADRs + release + changelog | [`.claude/rules/docs.md`](.claude/rules/docs.md) | `docs/**`, `README.md`, `CHANGELOG.md` |
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

```
coupette/
├── docker-compose.yml
├── Makefile
├── CHANGELOG.md
├── core/         # Shared models, Alembic, settings, logging
├── backend/      # FastAPI — api/, services/, repositories/, schemas/, tests/
├── scraper/      # Sitemap scraper — commands/, db/, tests/
├── bot/          # Telegram bot — handlers/, tests/
├── frontend/     # React SPA — pages/, contexts/, components/, lib/, locales/
└── .github/workflows/ci.yml
```

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

**Every GitHub issue needs ≥2 labels: one service + one type.**
- Service: `api` · `scraper` · `bot` · `frontend` · `core` · `devops`
- Type: `bug` · `feature` · `chore` · `refactor` · `docs`

```
gh issue create --title "..." --label api --label feature --milestone "Phase 10: Intent Router"
```

**Default workflow: incremental** (one feature = one PR to main). Use a feature branch only when ALL of: 3+ interdependent PRs, earlier PRs would ship dead code, main must stay deployable.

## Pre-PR Pipeline

Before creating a PR:
1. `/review` — code quality, DoD
2. `/simplify` — cleanup on changed code
3. `/qa` — coverage gaps and behavioral bugs (optional)
4. `/security` — IMPORTANT if branch touches auth, API, or user data
5. `/pr` — create the PR (only after `/review` passes)

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
- Surface trade-offs when a decision has rejected alternatives — suggest an ADR in `docs/decisions/` if the choice would need explaining later (see [docs domain](.claude/domains/docs.md))
- When unsure between two approaches, ask — don't pick silently
- If not confident, say so

## Developer Context

Senior engineer (6 years — FastAPI, GCP, Kubernetes, Docker) rebuilding after a career break. Coming from Flask + Gunicorn — learning FastAPI, SQLAlchemy, Alembic, pgvector. Prior Node.js/yarn (2019–2021), first React project.

- Pair programming, not task execution
- Explain the *why* briefly, especially for FastAPI/React patterns new to Victor
- Compare to Flask equivalents when relevant
- Point out things that could bite later

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md). Phases = user-facing capabilities only. UX, infra, refactors live in cross-cutting sections, not in phases.
