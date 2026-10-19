# Core checklist — every review

Cite the ID in each finding. A failed item here is a BLOCK.

## Flow (TDD + evidence)

- **TEST-1** Each acceptance criterion with testable code behavior maps to a test in the red commit, and that test failed on an assertion (an import failure counts only for an interface the plan marks new). No red commit is acceptable only as `Red: none — <reason>` on a ticket without testable behavior.
- **TEST-2** No red test weakened, skipped, or deleted since the red commit: `git diff <red>..HEAD -- <red test files>`. Only exception: renaming a guessed interface, recorded in the PR Decisions.
- **TEST-3** The red commit touches test files only: `git show --name-only --format= <red>`.
- **TEST-4** Diff coverage ≥ 80% on new and changed Python lines, re-run by the reviewer (never trust a reported figure). Frontend has no tooled threshold yet: every new branch exercised, checked by reading (a gap is a WARN).
- **TEST-5** Tests follow `rules/testing.md`: sentence names, behavior not implementation, no mocking of internal helpers, falsifiable.
- **EVID-1** Every AC has an evidence row with a named test, a runnable command, or an artifact. A row with none of the three is vague. UI ACs include a browser screenshot.
- **DOC-1** No doc, rule, or spec left stale by the diff (`rules/docs.md` → Keeping docs current). User-visible change → `CHANGELOG.md` line.

## Backend

- **CORE-1** `backend/api/` files don't query the DB — they call a service. `git diff <base>...HEAD -- backend/api/ | grep -E "session\.(execute|query)|select\("` = 0.
- **CORE-2** No sync SQLAlchemy `Session` in `backend/`.
- **CORE-3** New Pydantic schemas end in `*In` (requests) or `*Out` (responses).
- **CORE-4** New env var or secret is validated in the production lifespan check in `backend/app.py`.
- **CORE-5** Services raise domain exceptions, not `HTTPException`; `backend/errors.py` translates.
- **CORE-6** Logging uses `from loguru import logger` with `{}` placeholders, never f-strings or `import logging`.
- **CORE-7** Bot code calls the backend API only — no SQLAlchemy, `core.db`, or `AsyncSession` import under `bot/`.

## Hard rules

- **HR-1** No user-facing text implies SAQ affiliation (prompts, bot messages, UI copy, API errors).
- **HR-2** No deploy, prod docker, `make migrate`, or `make dev` against the shared DB was run (a workspace's own DB from `.env.local`, or an ephemeral DB via `DB_PORT` + blank `DATABASE_URL`, is fine).
- **HR-3** New constants, timeouts, thresholds, and flags are surfaced in the PR Decisions, not silently picked.
- **HR-4** User-written comments preserved, including BetterComments (`#!`, `#?`, `#*`, `#TODO`).

## Quality (WARN, never BLOCK)

AI smell — flag what a senior engineer would not commit: defensive branches for states the code already prevents · "just to be safe" validation at internal boundaries · comments or docstrings restating the code · one-use helpers and constants · try/except around code that can't raise · generic protocols/ABCs for one concrete type · tests that assert on mocks instead of behavior. The test: *would I write this if I weren't worried about being wrong?*
