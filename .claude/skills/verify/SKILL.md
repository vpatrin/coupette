---
name: verify
description: Walk an EXP feature's user journeys in the running Coupette app, as a user, with the run-coupette driver; write the QA report and screenshots (ops/CONTRACTS.md §4) and exit non-zero when any journey fails. Use for feature QA after a feature's last ticket merges, or to re-walk failed journeys after their fixes.
argument-hint: "EXP-MM [J1,J3]"
---

# /verify

Arguments: $ARGUMENTS — the feature issue id, then optionally the journeys to walk (all by default).

This skill replaces the built-in `/verify`. It runs in a QA workspace on `exp/agentic`, after the worker's setup (`ops/CONTRACTS.md` §2).

## 1. Read the journeys

Fetch the feature issue from Linear. Its `## Journeys` section holds the contract, in this shape (`.claude/rules/linear.md` → Feature):

```
J1 <title>
1. <do> → <expect>
2. <do> → <expect>
```

Walk them exactly as written. Don't add, merge or soften a step.

## 2. Start the app

1. `/Users/victor/.agent-harness/bin/exp-docker db up` — its own Bash command, by this absolute path, with no chain or redirect. It writes `.env.local` with the DB and Redis values.
2. `grep -q '^DB_PORT=' .env.local` — must succeed.
3. Then:

   ```bash
   .claude/skills/run-coupette/driver.sh up    # reads DB and Redis from .env.local; migrate, seed, embed, backend, frontend, dev login; prints the URLs
   ```

4. Create the QA dir `~/.cache/coupette-run/qa/EXP-MM/<YYYYMMDD-HHMM>` (UTC) with `mkdir -p`.

Each Bash call starts a new shell, so variables don't carry over. Write the driver path and the QA dir in full in every command. Below, `<qa dir>` is that path.

The driver makes no Docker calls. Its run files live in `~/.cache/coupette-run/runs/<id>`.

`up` fails? Every journey fails with `observed: "app did not start: <last error line>"`. Write the report (section 4), then run section 5 and stop.

## 3. Walk each journey

Map each step to driver calls (step syntax in `.claude/skills/run-coupette/SKILL.md`):

- a UI step → `.claude/skills/run-coupette/driver.sh browse <path> --fill … --click … --wait … --shot J1-s2`
- an API step → `.claude/skills/run-coupette/driver.sh api <METHOD> <path> [json]`

For each step:

1. Run it and read the full output: the step result, console errors, and `/api/*` responses ≥ 400.
2. Open the screenshot with Read (`browse` prints its path). Copy it into `<qa dir>`.
3. Write `observed` as what you saw, in one sentence, with numbers and status codes.
4. The step passes only when `observed` matches `expect`. A driver error, a console error or an API response ≥ 400 during the step fails it.

After the first failed step, the journey is `fail`. Record the remaining steps with `observed: "not run"` and `screenshot: null`.

## 4. Write the report and check it

Write `<qa dir>/report.json` in the shape of `ops/CONTRACTS.md` §4. `sha` is `git rev-parse HEAD`; `bug` stays `null` until a bug ticket exists. Then:

```bash
python3 .claude/skills/verify/check_report.py <qa dir>/report.json
```

It prints the summary and owns the exit code: 0 when every journey passed, 1 when one failed, 2 when the report breaks the contract. Fix a 2 and rerun. After bug ids are filled in, rerun with `--require-bugs`.

## 5. Stop the app

```bash
.claude/skills/run-coupette/driver.sh down
```

Then `/Users/victor/.agent-harness/bin/exp-docker db down`, as its own command.

Return the report path, the summary line, and the checker's exit code.

## Rules

- Never fetch `saq.com`. Never run `scrape-*` targets. The seed is the only catalog.
- Never edit app code, tests or docs here.
- The seed has 58 embedded products. A journey that expects results the seed can't hold fails, and the bug says so.
