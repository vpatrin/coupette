# Contracts between the crew's parts

Fixed interfaces. The lead, the worker, the QA agent, CI and the harness (`~/.agent-harness`) all rely on them. Change one only with every side that reads it.

## 1. PR body (the lead opens every PR from this template)

```
## EXP-NN <title>
Feature: EXP-MM | none
Lane: default | risky
Red: <sha> | none — <reason, 10+ characters>

### What changed
<outcome first; short sentences>

### Evidence
- Tests: <files>
- Code review: <n> Important, <n> Nit (fixed: <n>)
- Security review: clean | <n> real findings (fixed: <n>)

### Journal
ops/journal/<YYYY-MM-DD>.md
```

- CI parses one line: `^Red: ([0-9a-f]{7,40}|none — .{10,})$`. Anything else fails the red-test integrity check.
- No arm, model, planner or round counts in the PR body: the day-7 spot-check is blind. They go in `ops/tasks.jsonl`.

## 2. Worktree setup (the worker's first steps in a ticket or QA workspace)

Superset's setup script is empty on exp, so the worker prepares its worktree itself, inside the sandbox. One Bash command per step:

1. `[ -e .env ] || ln -s /Users/victor/coupette-exp/.env .env` — shared dev values and the two capped app keys; never replaces an existing `.env`
2. `/Users/victor/.agent-harness/bin/exp-docker db up` — writes `.env.local` (`DB_*`, `REDIS_URL` for this worktree) and prints it. A second `up` reuses the running pair.
3. `grep -q '^DB_PORT=' .env.local`
4. `for svc in core backend scraper bot; do (cd $svc && poetry install); done` — never `poetry lock`
5. `(cd frontend && yarn install --frozen-lockfile)`
6. `make migrate && make seed && make embed-sync` — throwaway DB only, synthetic catalog (58 products)

Call `exp-docker` and `exp-ws` each as its own Bash command, by its absolute path: never inside a script, a loop, a chain, a subshell or a redirect. A sandboxed process can't reach them. On every exit path, including a failure, run `exp-docker db down` the same way.

The Makefile includes `.env.local` last, so its values win. App ports derive from the DB slot (section 3).

## 3. run-coupette driver (`.claude/skills/run-coupette/driver.sh`)

- `up`: reads DB and Redis from `.env.local` (section 2, step 2), then migrate, seed, embed-sync, backend and frontend, dev-login token cached. Prints the URLs. No `.env.local`: it stops and says so.
- `status`, `token`, `logs`, `down`: as today.
- `api <METHOD> <path> [json]`: calls the backend with the token; prints the status and the body.
- `browse <path> [steps…]`: headless Chrome via Playwright; saves screenshots to `$RUN_DIR/shots/`; prints their paths.
- Ports: slot `n = (DB_PORT - 5434) / 10`; backend `8101 + 10n`, frontend `5273 + 10n`. They never collide with main's 8001 / 5173.
- No `docker` calls: the sandbox blocks the Docker socket. Readiness checks use TCP, not `docker exec`.
- Run files: `~/.cache/coupette-run/runs/<id>`, where `<id>` matches exp-docker's container names.

## 4. QA report (the `verify` skill writes it; the QA agent posts its summary to Linear)

Path: `~/.cache/coupette-run/qa/<FEATURE-ID>/<YYYYMMDD-HHMM>/report.json`, with screenshots next to it.

```
{"feature": "EXP-12", "sha": "<exp/agentic sha>", "started": "<iso>",
 "journeys": [{"id": "J1", "title": "...", "status": "pass|fail",
               "steps": [{"do": "...", "expect": "...", "observed": "...", "screenshot": "<path>|null"}],
               "bug": null}],
 "summary": {"pass": 0, "fail": 0}}
```

The skill exits non-zero when any journey fails. The QA agent files one EXP bug ticket per failed journey and writes its id into `bug`.

## 5. Worker result (the lead waits for it)

Path: `<worktree>/.crew/result.json`, plus `<worktree>/.crew/DONE` written last. `.crew/` is gitignored.

```
{"ticket": "EXP-NN", "arm": "crew|solo", "lane": "default|risky",
 "status": "ready|parked|failed", "branch": "exp-task/EXP-NN",
 "reviewed_sha": "<sha the reviews saw>", "red": "<sha>|none — <reason>",
 "rounds": 0, "stepped_back": false,
 "findings": {"code_review": {"important": 0, "nit": 0}, "security": {"real": 0}},
 "notes": "<one paragraph>"}
```

- `ready`: the lead opens the PR from section 1, waits for CI, then merges with `--match-head-commit <reviewed_sha>`.
- `parked` or `failed`: the lead comments on the ticket and retags the workspace `parked`.

A QA workspace writes a different shape (`mode: qa`). `fail` means journeys failed and bugs were filed; `failed` means the run itself broke:

```
{"ticket": "EXP-MM", "mode": "qa", "status": "pass|fail|failed",
 "report": "<path to report.json>", "bugs": ["EXP-…"], "notes": "<one paragraph>"}
```

## 6. Names

- Branches: `exp-task/EXP-NN` (ticket), `exp-qa/EXP-NN` (QA, never merged).
- Agents (`.claude/agents/`): `strategist`, `web-reader`, `planner`, `red-test-writer`, `builder`, `solo-builder`, `qa`.
- Skills (`.claude/skills/`): `lead`, `worker`, `verify`, `run-coupette`, `adr`, `eval-pipeline`, `pr`.
- Arm: solo when the lane is default and the EXP number mod 3 == 0; crew otherwise. Fixed before day 1.
