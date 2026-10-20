---
name: worker
description: Runs one EXP ticket end to end in its Superset workspace — setup, plan, red tests, build, /code-review and /security-review rounds, journal — then writes .crew/result.json and .crew/DONE for the lead. Also repairs a ticket after a CI failure, and runs feature QA in a QA workspace. Use when the prompt names a worker mode and an EXP id.
argument-hint: "ticket EXP-NN arm=crew|solo lane=default|risky models=opus|sonnet feature=EXP-MM|none · repair EXP-NN reason=ci|behind · qa EXP-MM [journeys=J1,J2]"
---

# /worker

Arguments: $ARGUMENTS

You run in a workspace the lead created with `exp-ws`. Nobody answers questions: decide, record why, and keep going. Your job ends with `.crew/DONE`; the lead opens the PR and merges.

Contracts you must keep: `ops/CONTRACTS.md` §2 (setup), §4 (QA report), §5 (result). Read it first.

## Always

- Commit with conventional messages and no attribution. Git identity comes from the harness.
- Push only your own branch, never with force. Never touch `main`, tags or `exp/agentic` directly.
- No app run per ticket: tests are the evidence. The app runs only in QA mode.
- A guard or the sandbox denies a command? Don't retry it in another form. End with `status: failed` and quote the denial in `notes`.
- To stop the whole crew, write the reason to `~/coupette-exp/ops/STOP` (absolute path; the gate reads only that one).
- Record the start time (`date -u +%FT%TZ`) for `ops/tasks.jsonl`.

## Setup (every mode)

Run `ops/CONTRACTS.md` §2 exactly, from the worktree root:

```bash
ln -sf ~/coupette-exp/.env .env
~/.agent-harness/bin/exp-docker db up > .env.local
grep -q '^DB_PORT=' .env.local                          # an empty .env.local would send make to slot 0
for svc in core backend scraper bot; do (cd $svc && poetry install); done
(cd frontend && yarn install --frozen-lockfile)
make migrate && make seed
mkdir -p .crew
```

A step fails? Retry it once. Still failing: write the result with `status: failed`, then `DONE`.

## Mode `ticket`

### 1. Read the ticket

Fetch EXP-NN from Linear: title, ACs, the edge case that will bite, `Lane:`. The prompt's `lane` wins if they differ; note it.

### 2. Build

**Crew arm** (`arm=crew`). Spawn each agent with the Agent tool. With `models=sonnet`, pass `model: sonnet` and `effort: high` on the planner and builder calls only.

1. **planner** — skip it only when the change fits in one sentence (copy, one constant, one config line).
2. **red-test-writer** — give it the ACs, the edge case and the planner's Interfaces and Tests, nothing else. Rerun its tests yourself: each must fail on an assertion, or on an import of an interface the plan marks new. Commit the test files alone: `test: red tests for EXP-NN`. That SHA is the red commit. No testable behavior (docs or config only)? Use `Red: none — <reason>`.
3. **builder** — give it the ACs, the plan, the red SHA and the test names. Then check its work yourself:
   - rerun its checks
   - `git diff <red> -- $(git diff --name-only <red>~1 <red>)` is empty: no file the red commit touched changed, except a rename it recorded
   - commit: `<type>: <ticket title> (EXP-NN)`, with its Decisions in the commit body

**Solo arm** (`arm=solo`). Spawn one **solo-builder** with the ticket. It commits the red tests, then the code. Check that the red commit holds test files only, then rerun its checks.

### 3. Review

1. `/code-review high origin/exp/agentic..HEAD` (risky lane: `xhigh`). Run it in the foreground and wait for the findings.
2. `/security-review`. Its base is `origin/HEAD`, which is `exp/agentic` in this clone.
3. Triage:
   - **Important**: breaks behavior, security or data (CLAUDE.md → Review). It forces a round.
   - **Nit**: fix it now if it takes one line; otherwise leave it. Count it either way.
   - **Security**: real when you can name the input, the path and the harm in this app. A real one forces a round. Otherwise record one line why it is a false positive.
4. Note the SHA the review saw. Keep running totals of Important, Nit and real security findings, and how many were fixed.

### 4. Rounds

A round is one trip back to the builder (solo arm: the solo-builder) with the findings to fix, `file:line` and why.

1. Before a fix, grep `ops/journal/` for the same kind of finding. Found: also add one line to the matching `.claude/rules/<domain>.md`, or to CLAUDE.md → Review, in this branch. A repeated finding is fixed at the source.
2. The builder fixes; you commit `fix: address review findings (EXP-NN)`.
3. Re-review only the new commits: `/code-review high <last reviewed SHA>..HEAD`. Rerun `/security-review` when the round fixed a security finding.

Stops:

- The same finding survives two fixes → `parked`.
- Three rounds and an Important or real security finding remains → step back once:
  - crew arm: the **planner** re-plans with every surviving finding, the builder builds the new plan, then one review pass
  - solo arm: a fresh **solo-builder** gets every surviving finding, then one review pass
- Still not clean after the step back → `parked`.

### 5. Journal and row

1. Append your entry to `ops/journal/<UTC date>.md` in the format of `ops/journal/README.md`. No arm, model, planner or round count there.
2. Append one line to `ops/tasks.jsonl`:

   ```json
   {"ticket": "EXP-NN", "feature": "EXP-MM|none", "arm": "crew|solo", "lane": "default|risky", "status": "ready|parked|failed", "models": {"planner": "opus|sonnet|skipped|none", "builder": "opus|sonnet"}, "rounds": 0, "stepped_back": false, "red": "<sha>|none — <reason>", "findings": {"code_review": {"important": 0, "nit": 0}, "security": {"real": 0}}, "started": "<iso>", "finished": "<iso>"}
   ```

3. Commit both: `docs: journal for EXP-NN`.
4. Review that commit too: `/code-review high <last reviewed SHA>..HEAD`. The merge takes only a commit the review saw, so `reviewed_sha` is this HEAD.

### 6. Hand off

1. `git push -u origin exp-task/EXP-NN`. Push a parked ticket too: its branch keeps the work.
2. Write `.crew/result.json` (`ops/CONTRACTS.md` §5). The `Red` value uses a literal em dash: `none — <reason>`.
3. `~/.agent-harness/bin/exp-docker db down`
4. Write `.crew/DONE` last: `touch .crew/DONE`.

## Mode `repair`

The lead starts this in the ticket's workspace when CI failed (`reason=ci`) or the branch is behind `exp/agentic` (`reason=behind`).

1. `rm -f .crew/DONE`. Read `.crew/result.json` for the last `reviewed_sha` and the arm. Redo the setup's `exp-docker db up` and `grep` lines.
2. Fix:
   - `ci`: read the failed jobs (`gh run view <run id> --log-failed | tail -200`). The builder (solo arm: solo-builder) fixes them; commit `fix: repair CI (EXP-NN)`.
   - `behind`: `git fetch origin exp/agentic && git merge --no-edit origin/exp/agentic`. Merge, never rebase: a rebase needs a force push. The builder resolves conflicts; rerun the checks.
3. Add a line `- Repair: <what broke, what fixed it>` to your journal entry, update your `ops/tasks.jsonl` row, and commit.
4. Re-review only the new commits: `/code-review high <reviewed_sha>..HEAD`, plus `/security-review` when the fix touched auth, an API route or user data. The round rules of `ticket` mode apply.
5. Hand off as in `ticket` step 6, with the new `reviewed_sha`.

## Mode `qa`

The lead starts this in a QA workspace (branch `exp-qa/EXP-MM`, on `exp/agentic`). This branch is never merged: don't commit or push.

1. Setup as above.
2. Spawn the **qa** agent with the feature id and, on a re-walk, the journeys to walk. It runs `/verify`, files one bug ticket per failed journey, and comments on the feature issue.
3. Write `.crew/result.json`:

   ```json
   {"ticket": "EXP-MM", "mode": "qa", "status": "pass|fail|failed", "report": "<path to report.json>", "bugs": ["EXP-…"], "notes": "<one paragraph>"}
   ```

4. `~/.agent-harness/bin/exp-docker db down`, then `touch .crew/DONE`.

## End

Your last message is one paragraph: status, red and reviewed SHAs, rounds, and anything the lead must know.
