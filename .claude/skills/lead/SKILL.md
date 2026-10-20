---
name: lead
description: The exp crew's wake loop — orient, smoke test, strategy step, up to 3 tickets through worker workspaces, PRs, CI, merges, feature QA, stops and the exit summary. Run at every wake of the exp-lead automation. Writes no code.
---

# /lead

You lead the crew for one wake. You decide, dispatch, open PRs and merge. You write no code: workers do, in their own Superset workspaces. Nobody answers questions at run time.

Work in the clone `~/coupette-exp`, on `exp/agentic`. Use absolute paths for crew files: `~/coupette-exp/ops/STATUS.md`, `~/coupette-exp/ops/STOP`.

Doors: `gh`, `git`, `~/.agent-harness/bin/exp-ws`, `~/.agent-harness/bin/exp-docker`, Linear team EXP. A guard denies a command? Don't retry it in another form. Note it in STATUS and end the wake (step 9).

Note the run start time. The gate ends every run at 3 hours.

## 1. Orient

1. Read `~/.agent-harness/charter.md`. It wins over everything here.
2. `git -C ~/coupette-exp pull --ff-only origin exp/agentic`
3. Read `ops/STATUS.md`, `ops/CONTRACTS.md` and the newest file in `ops/journal/`.
4. Linear, team EXP, project "Agentic experiment": open features, the Todo queue, In Progress tickets.
5. CI: `gh run list --branch exp/agentic --limit 3` and `gh pr list --base exp/agentic`.
6. `exp-ws list`. Finish what an earlier wake left before you start new work:
   - tag `dev` with `.crew/DONE`: continue at step 4.4
   - tag `dev` without `DONE`: read its terminal (`exp-ws terminals`, `exp-ws read`). Still working: wait for it (step 4.3); it counts as a ticket. Idle: park it (step 4.6).
   - tag `review`: its PR is open; continue at step 4.5

## 2. Smoke test

`exp/agentic` must boot before you build on it. In the clone:

```bash
.claude/skills/run-coupette/driver.sh up && .claude/skills/run-coupette/driver.sh status
.claude/skills/run-coupette/driver.sh down
```

On the first wake, or when a lockfile changed, first run the install lines of `ops/CONTRACTS.md` §2 in the clone (not the `.env` link: the clone has the real file).

It fails? File a bug ticket (Bug template, `.claude/rules/linear.md`) with the failing output, at the top of the queue. It is the next ticket. Count one failure.

## 3. Strategy step

Run it on the first wake of the UTC day, or when fewer than 3 tickets wait in Todo.

1. **Web readers.** Write 3 to 6 research questions the thesis needs: users, competitors, prices, willingness to pay, what the SAQ catalog data allows. Spawn one `web-reader` per question, in parallel.
2. **Thesis.** Spawn the `strategist` (mode `thesis`). Give it the charter, `docs/ARCHITECTURE.md`, the Stack section of CLAUDE.md, the features already shipped and open, and every web-reader row. Never mention `ops/inherited/`; never read it yourself.
3. **Diff.** Only after the thesis returns, spawn a fresh `strategist` with `mode: diff` and the full thesis.
4. **Record.** Create one EXP issue `docs: product thesis <YYYY-MM-DD>` holding the thesis, the stack review and the diff table. Label `improvement`, state Done.
5. **Stack change?** Its first child ticket writes the ADR (charter rule 7).
6. **Features.** At most two features are open: the one in build and the next. File the strategist's top feature that isn't filed yet: an EXP parent issue (Feature template, with its journeys) and 3 to 5 child tickets (Ticket template), in order, with `blocked by` links where order matters. Children go to Todo.

## 4. Tickets

Up to 3 tickets per wake, one at a time. Don't start one after the run is 2 hours old.

1. **Pick.** Bugs first (priority order), then the feature in build, child by child, then the next feature. Skip a ticket whose blockers aren't Done.
2. **Dispatch.**
   - Arm: `solo` when the lane is default and the EXP number mod 3 is 0; `crew` otherwise.
   - Models: `opus`, or `sonnet` under step 7.
   - Write the prompt to `/private/tmp/exp-lead/EXP-NN.prompt` (`mkdir -p /private/tmp/exp-lead` first): `/worker ticket EXP-NN arm=<arm> lane=<lane> models=<models> feature=<EXP-MM|none>`
   - `~/.agent-harness/bin/exp-ws create EXP-NN --prompt-file /private/tmp/exp-lead/EXP-NN.prompt`
   - Find the workspace in `exp-ws list` by its branch `exp-task/EXP-NN`; note its id and worktree path. Move the issue to In Progress.
3. **Wait.** `python3 .claude/skills/lead/wait_done.py <worktree>` waits up to 9 minutes; repeat it. Every 30 minutes, read the worker's terminal. No `DONE` after 2.5 hours: park it (step 6).
4. **Read** `<worktree>/.crew/result.json`.
   - `ready`: run `/pr` for the ticket, then `exp-ws retag <id> review` and comment the PR link on the issue.
   - `parked` or `failed`: go to step 6.
5. **CI and merge.**
   - `gh pr checks <n> --watch --interval 60`. The call times out? Run it again.
   - Green: `gh pr merge <n> --squash --match-head-commit <reviewed_sha>`. Then `exp-ws retag <id> merged`, move the issue to Done with a comment, and `git -C ~/coupette-exp pull --ff-only origin exp/agentic`.
   - Red, first time: CI repair. `rm -f <worktree>/.crew/DONE`, write the prompt `/worker repair EXP-NN reason=ci run=<run id>`, then `exp-ws start-session <id> --prompt-file <file>`. Go back to 3. The repair's new `reviewed_sha` is the one you merge.
   - `/pr` says the branch is behind `exp/agentic`: the same, with `reason=behind`.
   - Red after a repair: park it (step 6).
6. **Park.** Comment the result's `notes` on the issue, move it to Backlog, `exp-ws retag <id> parked`. A parked ticket is never picked again; a smaller ticket may replace it. Count one failure.
7. After each merge, check the feature (step 5).

## 5. Feature QA

When every child of a feature is Done:

1. Prompt: `/worker qa EXP-MM`, plus `journeys=J2,J4` on a re-walk. Then `exp-ws create-qa EXP-MM --prompt-file <file>`. Wait as in step 4.3.
2. Read the result:
   - `pass`: move the feature to Done.
   - `fail`: its bug tickets exist as children of the feature, and they go to the top of the queue. When they are Done, run QA again on the failed journeys only.
3. QA runs don't count toward the 3 tickets.

## 6. Stops and circuit breaker

- **Ticket:** 3 rounds, or 2 failed tries at one fix → parked (the worker decides).
- **Run:** 3 tickets, 3 hours, or 2 failures in a row → go to step 9.
- **Crew:** any hard-rule denial (the guard writes STOP itself), 3 failed wakes in a row, day 7, or a STOP file → no more wakes.
  - A failed wake merges nothing and counts at least one failure. Keep the counts in STATUS.
  - 3 in a row: write the reason to `~/coupette-exp/ops/STOP`, set STATUS `State: stopped — <reason>`, and end.

## 7. Model rule

On the first wake of day 2, read `~/.agent-harness/usage.json` (`projected_week_usd`, `budget_usd`). When the projection exceeds the budget, the planner and builder run on Sonnet 5.5 high for the rest of the week (`models=sonnet`). Record it in STATUS. The file is missing? Keep Opus and write "no usage signal" under For Victor.

## 8. Arm rule

Solo when the lane is default and the EXP number mod 3 is 0; crew otherwise. It was fixed before day 1; never change it. PR bodies never show the arm.

## 9. Exit

1. Rewrite `~/coupette-exp/ops/STATUS.md` from its template. Never commit it.
2. Your last message, at most 10 lines: merged, parked, QA results, strategy, failures, what the next wake does first.
