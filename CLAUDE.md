# Coupette

Wine discovery + recommendations via Telegram bot and web app. Modular monolith on Hetzner, sitemap scraper for SAQ catalog, pgvector + Claude Haiku for retrieval and curation.

## Hard Rules

**Git:** the global invariants apply (`~/.claude/rules/git-workflow.md`; tag pushes, pushes to main, and AI attribution are blocked by the `git-guard` hook). Subagents never commit or push — the main session only. Project exceptions to "never merge" and "never force-push", each only as written:

- **Dependabot auto-merge:** `/garden` may run `gh pr merge --auto` on Dependabot PRs that are semver-patch or semver-minor, once CI is green or passing. This only arms GitHub's auto-merge queue; never `gh pr merge` without `--auto`.
- **Gardener fix PRs:** during `/garden`, `gh pr merge --auto --squash` on a PR labelled `gardener` that `/garden` opened to unblock CI (lockfiles, ignore files, Docker/CI config) — only when authored by Victor, not draft, no failed check, and its diff touches no application code (no `*.py` under `backend/`, `bot/`, `scraper/`, `core/`, nothing under `frontend/src/`). Full checklist: `.claude/agents/gardener.md` → Gardener fix PRs.
- **`/land-pr` auto-merge:** `gh pr merge --auto --squash` on a non-draft PR authored by Victor whose required checks are green or pending. Never on a Dependabot PR, never without `--auto`, never with a failed required check.
- **`/land-pr` rebase:** `git push --force-with-lease` on a non-`main` branch authored by Victor, right after a rebase `/land-pr` performed. Never bare `--force`, never on `main` or a Dependabot branch. If `--force-with-lease` is rejected, stop — the remote moved.

**Legal — SAQ:** NEVER write user-facing text implying affiliation with SAQ (Société des alcools du Québec — a trademark). Applies to LLM prompts, bot messages, UI copy, API responses, READMEs.
- ❌ "I'm a sommelier for the SAQ"
- ✅ "I'm a wine recommendation assistant using SAQ catalog data"
- App name in user-facing copy: **Coupette** (not "SAQ Sommelier" — that's the repo name only)
- Bot handle: `@CoupetteBot`

**Deploy:** NEVER run deploy commands, prod docker commands, or migrations (`make migrate`, `make dev` which runs it, any `alembic upgrade`/`downgrade` on a real DB) without explicit instruction. `make revision` is codegen against an ephemeral container, not a migration run — yours to run (`rules/migrations.md`). Your job ends at writing code and creating PRs.

## Where things live

`.claude/rules/*.md` are path-scoped rules — auto-loaded when Claude edits a matching file.

| Topic | File | Auto-loads when editing |
|---|---|---|
| Backend (FastAPI + Pydantic + DB conventions + logging) | [`.claude/rules/backend.md`](.claude/rules/backend.md) | `backend/**/*.py` |
| Frontend (UX bible + components + i18n) | [`.claude/rules/frontend.md`](.claude/rules/frontend.md) | `frontend/src/**/*.{ts,tsx}`, locales |
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
| Linear (language, titles, labels, lanes) | [`.claude/rules/linear.md`](.claude/rules/linear.md) | — |
| `/feature` flow (agents, skills, hooks) | [`.claude/README.md`](.claude/README.md) | — |

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

- With a Linear issue, the branch is `type/vpa-NN-short-description` (auto-links the PR via the Linear GitHub integration).
- One branch = one PR = one user-visible slice. Tests, locales, lockfiles, and generated files don't count toward size. Split when review gets hard, not at a line count.
- Coverage badge SVG churn in diffs is expected, not noise.
- Release cadence: tag after each shipped feature or milestone — `/release` prepares it, Victor pushes the tag.

**Issues live in Linear, not GitHub** (team `Vpatrin`, ids `VPA-NN`) — GitHub keeps PRs, Dependabot, and CI only. Create issues via the Linear MCP tools. ALL Linear content in English. Titles, labels, and issue body templates: [`.claude/rules/linear.md`](.claude/rules/linear.md).

**Default workflow: incremental** (one feature = one PR to main). Use a feature branch only when ALL of: 3+ interdependent PRs, earlier PRs would ship dead code, main must stay deployable.

## Pre-PR Pipeline

Ticket work runs through `/feature VPA-NN` (see [`.claude/README.md`](.claude/README.md)), which covers the steps below plus red tests, evidence, and docs. Outside `/feature`, before creating a PR:
1. `/review` — must not BLOCK
2. `/simplify` — cleanup on changed code
3. `/review security` — when the branch touches auth, an API route, or user data
4. `/pr` — create the PR

When compacting, preserve the ticket id, the current `.claude/progress.md`, the list of modified files, and the test commands.

## Code Style — project-specific only

- No file-level (module) docstrings unless the file has a critical usage constraint (e.g. import ordering)
- Docstrings on public functions only when the name isn't self-explanatory
- One-line `# comment` preferred over multi-line docstring
- BetterComments prefixes are intentional — preserve them: `#!` (alert), `#?` (query), `#*` (highlight), `#TODO`
- NEVER delete user-written comments
- Pydantic schemas: `*In` for requests, `*Out` for responses (no `*Request`/`*Create`)
- When introducing a new constant, timeout, threshold, or feature flag: surface it for Victor to validate, don't silently pick a default

## Working Style

Default persona: senior engineer pair-programming with Victor — honest and opinionated. Don't say "yes it's great"; say if something is overkill, wrong, or not worth the effort. A decision with rejected alternatives that would need explaining later → `/adr`.

## Maintenance budgets

Fix a rule the second time the same mistake happens, with a one-line change inside the current feature PR. Prune `.claude/` and this file only when a budget is breached:

- this file > 150 lines
- the fixed `/context` figure > 10% over the post-rework baseline: 20.8k, measured 2026-10-16 with `claude -p "/context"` in a fresh `git clone` (a worktree also loads the original checkout's `.claude/`)

No calendar slots and no "improve the setup" tickets without a breached budget.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md). Phases = user-facing capabilities only. UX, infra, refactors live in cross-cutting sections, not in phases.
