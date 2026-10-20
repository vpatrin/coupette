---
paths:
  - "**/tests/**"
  - "**/test_*.py"
  - "**/*.test.ts"
  - "**/*.test.tsx"
---

# Testing

> Read whenever editing any test file or adding tests for new code. Applies to all services — Python (`pytest`) and frontend (Vitest + RTL).

## 1. Names are the spec

`describe` + `it` (JS) or `class` + `def test_` (Python) read as a complete behavioral sentence. Someone new skims names and understands the contract without opening any body.

- `describe` / `class` = the thing under test (component, function, or logical group)
- `it` / `def test_` = what it does in a specific scenario

**Naming rules:**
- Active voice, present tense: "returns X", "renders Z", "calls Y", "throws when", "redirects to"
- Name the outcome, not the absence — active verbs even for negative cases:
  - ✅ `omits description when prop is not provided`
  - ✅ `skips onUnauthorized callback for non-401 errors`
  - ❌ `does not render description when omitted`
  - ❌ `does not call onUnauthorized on non-401 errors`
- Be specific:
  - ✅ `renders colored dot for Vin rouge category`
  - ✅ `redirects to /onboarding when authenticated but not onboarded`
  - ❌ `renders dot for known category` — "known" means nothing
  - ❌ `happy_path`, `clean_run`, `valid_input`, `successful_call` — always vague
- Include scenario when it disambiguates: "when lang prop is provided", "when unauthenticated"

## 2. Test behavior, not implementation

Assert what a user or caller observes. Never assert internal state, intermediate variables, or private methods.

- **Frontend (RTL):** prefer `getByRole` → `getByText` → `getByTestId` (last resort)
- **Python:** assert return values and observable side effects (DB writes, events emitted, HTTP calls made) — not what happened inside the function
- Never test that a mock was called with specific internal arguments unless that call IS the contract (e.g. an HTTP request body)
- Don't test third-party library behavior — test your code's response to it

## 3. Test anatomy

- One scenario per test
- Arrange → Act → Assert, top to bottom, no interleaving
- Use factory helpers for fixtures (`product()`, `make_red()`) — never repeat raw object literals
- Mock at the boundary: external APIs, DB, context providers — not internal helpers
- Order-independent — no shared mutable state; reset in `beforeEach` / `setUp`, not at module level

## 4. Coverage targets

| Service  | Line threshold   | Tool       |
| -------- | ---------------- | ---------- |
| Backend  | ≥ 80%            | pytest-cov |
| Bot      | ≥ 85%            | pytest-cov |
| Scraper  | ≥ 80%            | pytest-cov |
| Core     | none             | pytest-cov |
| Frontend | no threshold yet | Vitest     |

Frontend threshold set at ~60% once component extraction is complete.

## 5. Tests must be falsifiable

A test that can't fail is not a test — it's a comment with overhead.

**The delete test:** mentally delete the function under test. Would the test fail? If not, the assertion is wrong.

- Assert the *outcome*, not just that something ran: `assert result == expected_wine`, not `assert result is not None`
- After HTTP, assert the body — a 200 can return garbage
- After a DB write, query the DB and assert the row — don't just assert the mock was called

**Hard to arrange = design smell.** Arrange block needs 10+ lines or 3+ mocks → fix the code, not the test.

**Don't test what the type system covers.** mypy/TS verifies fields exist with the right type. Tests verify runtime behavior.

## 6. Test-first

- In the worker's crew arm, the `red-test-writer` agent writes one failing test per acceptance criterion, plus the ticket's edge case that will bite, before any code exists — from the ACs and the planned interfaces only. The worker re-runs them and commits them alone as the **red commit**. In the solo arm, the `solo-builder` writes and commits them itself, before any code.
- The coder makes the red tests pass and never weakens or deletes one. Only exception: renaming a guessed interface (path, schema, prop), recorded in the commit body.
- Bug tickets: the red test is the reproduction.
- **Diff coverage ≥ 80%** on new and changed Python lines — total coverage can stay high while new code is untested. Run `make coverage-<service>` (writes `coverage.xml`), then from the service dir `poetry run diff-cover coverage.xml --compare-branch=origin/exp/agentic --fail-under=80`. Frontend: no tooled threshold yet (§4) — cover every new branch.

## Auth tests

`backend/tests/conftest.py` overrides `verify_auth` for every test (`_bypass_auth`) and mocks `get_db` with an `AsyncMock`: no backend test hits a real database. Route tests may keep both overrides. Tests of auth logic (JWT decode, `verify_auth`/`verify_admin`, OAuth callbacks, the waitlist gate) must remove the `verify_auth` override so the real code path runs (`_real_auth_client` in `backend/tests/test_auth.py`); mock the DB only at the session boundary. Known gap: no real-DB fixture yet.
