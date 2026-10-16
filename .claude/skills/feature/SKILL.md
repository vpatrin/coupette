---
name: feature
description: Implement a Linear ticket (VPA-NN) end to end in this workspace — ticket check, plan, red tests by a separate agent, code until green, fresh-context review, PR with an AC → evidence table. Use when asked to implement, build, or fix a VPA ticket.
argument-hint: "VPA-NN"
---

# /feature — one ticket, one PR

Ticket: $ARGUMENTS

You write the code. Two subagents help: `red-test-writer` before the code, `reviewer` after it. Victor's touchpoints are the approved ticket, non-obvious choices, the risky-lane plan checkpoint, and the merge. Everything else runs without stopping to ask "proceed?".

While `.claude/progress.md` exists, the project Stop hook ([`stop-check.sh`](stop-check.sh)) runs lint + tests (+ the frontend build) for every service the branch touches. A failure blocks the stop — fix it.

## 1. Ticket

- Fetch the ticket with the Linear MCP tools — title, description, labels, comments. **The ticket is the spec.**
- It needs falsifiable acceptance criteria, an "edge case that will bite", and an end-to-end verification line. Vague or missing on a larger feature → interview Victor with `AskUserQuestion` (edge cases, trade-offs), update the ticket in Linear, then go on. **Bug ticket:** "Steps to reproduce" + "Expected vs actual" are the AC — the red test is the reproduction.
- Lane: the ticket's `Lane:` field. If absent: **risky** when the change touches auth (`rules/auth.md`), migrations (`core/db/`, `core/alembic/`), or RAG prompts, retrieval, or embeddings (`rules/rag.md`); **default** otherwise.
- Branch: keep the workspace branch if it already reads `<type>/vpa-NN-<short>`; otherwise `git fetch origin main && git checkout -b <type>/vpa-NN-<short> origin/main` (`type` from the ticket title prefix). Set the issue to In Progress.
- Write `.claude/progress.md` (format below) — this also arms the Stop hook.
- Skills can't run `/rename` or `/goal` — whoever launches the worker does: `claude -n VPA-NN`, `/feature VPA-NN`, then `/goal every AC in .claude/progress.md passes and lint/tests are green`. If neither is set, say so once in your first message and carry on.

## 2. Recon and plan

- Read the `.claude/rules/` file and `docs/specs/` page for each touched surface. Use the built-in Explore agent only when the surface is wide (several services, unfamiliar code).
- Plan before code when the change spans several files or the approach is uncertain; skip the plan when the diff fits in one sentence. The plan **names the interfaces**: endpoint paths and methods, schema names (`*In`/`*Out`) and fields, function signatures, component props.
- Consult the advisor before committing to the approach.
- A non-obvious product or technical choice → `AskUserQuestion`, recommendation first. On a Learning topic (LLM evals, frontend fundamentals, lower-level depth), present the options and let Victor choose before implementing.
- **Risky lane:** show the plan and wait for Victor's OK (plan checkpoint). A RAG plan states the `make eval` run it needs — it costs API money, and the OK covers it.

## 3. Red tests — a separate writer

- Spawn `red-test-writer` (Agent tool) with **only** the ACs verbatim, the edge case that will bite, the planned interfaces, and the test directories. No implementation ideas.
- Re-run its tests yourself: every one must fail, on an assertion — or on an import only for an interface the plan marks new. Keep its report (AC → test → failure kind, and the ACs it found untestable) for the reviewer.
- Commit the test files alone: `test: red tests for VPA-NN`. Write `Red: <sha>` into `.claude/progress.md`. A ticket with no testable behavior (docs, tooling) writes `Red: none — <reason>` instead.

## 4. Green

- Write code until the red tests pass. **Never weaken, skip, or delete a red test.** Only exception: renaming a guessed interface, recorded as a decision.
- Follow the rules for each touched surface. Migrations: `make revision` is yours, `make migrate` never is.
- Add tests for implementation branches the ACs don't name until diff coverage ≥ 80% (`rules/testing.md` §6).
- UI ACs: run the app (`run` skill or a browser tool) and save a browser screenshot to `.claude/evidence/`.
- Run the ticket's end-to-end verification line; its result is an evidence row.
- Update docs in the same PR: specs, rules, CHANGELOG, ROADMAP (`rules/docs.md`).
- Commit each finished slice (conventional commit) and rewrite `.claude/progress.md`. **Record each decision in the body of the commit that made it** (`git commit -m "<title>" -m "Decision: <choice> over <rejected>, because <why>"`) — git keeps it through `/clear` and compaction, and `/pr` compiles the PR's Decisions section from these bodies.
- Push only once lint and tests are green: `.githooks/pre-push` runs the suites, and red tests fail it by design. Never bypass it.
- Two failed attempts at the same fix → stop and report BLOCKED with what you tried; recommend `/clear` and a sharper prompt.
- Before declaring done, consult the advisor.

## 5. Review — fresh context

- Commit everything first: the reviewer won't review a dirty tree.
- Draft the AC → evidence table (from `.claude/progress.md`, screenshot paths, the e2e result, eval scores) and the Decisions list (from commit bodies).
- Spawn `reviewer` (Agent tool) with the ticket id, ACs verbatim, lane, red SHA, the red-test-writer report, the evidence table, and the Decisions. Risky lane: pass `effort: "xhigh"`.
- Risky lane also: auth → run `/security` and fix any Critical or High; RAG prompt or retrieval → `make eval`, scores into the evidence table.
- BLOCK → fix exactly the cited findings, or rebut one in writing with evidence. One fix loop, then re-run the reviewer. Still BLOCK → stop and report to Victor.

## 6. Ship

- Push, then create the PR with `/pr`: AC → evidence table, Decisions (longer on the risky lane), the reviewer's Review line, Harness friction if something in `.claude/` tripped you. GitHub's CLI can't attach images — name the screenshot file in its evidence row.
- Report the PR URL. Victor merges.

## `.claude/progress.md`

State only — rewritten whole at each commit, never appended, no narrative. Gitignored. A line like "tried X, dropped it because Y" is a decision: it goes in a commit body, never here. A `SessionStart` hook prints this file into any new, resumed, cleared, or compacted session.

```
# VPA-19 — add-to-cellar button
Lane: default · Red: 3f2c1ab
- [x] AC1 button on search, chat, detail panel → WineCard.test.tsx "renders add button"
- [x] AC2 optimistic add, rollback on error     → useCellar.test.ts "rolls back on 500"
- [ ] AC3 second click increments quantity
- [ ] AC4 FR/EN labels
Next: AC3 — PATCH quantity in useCellar mutation
```
