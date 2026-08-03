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

Frontend threshold set at ~60% once component extraction is complete (tracked in `docs/ENGINEERING.md`).

## 5. Tests must be falsifiable

A test that can't fail is not a test — it's a comment with overhead.

**The delete test:** mentally delete the function under test. Would the test fail? If not, the assertion is wrong.

- Assert the *outcome*, not just that something ran: `assert result == expected_wine`, not `assert result is not None`
- After HTTP, assert the body — a 200 can return garbage
- After a DB write, query the DB and assert the row — don't just assert the mock was called

**Hard to arrange = design smell.** Arrange block needs 10+ lines or 3+ mocks → fix the code, not the test.

**Don't test what the type system covers.** mypy/TS verifies fields exist with the right type. Tests verify runtime behavior.

## Auth/DB-touching tests

Use real DB sessions (no mocking `AsyncSession`, `get_db`, `verify_auth`). See `rules/auth.md`.
