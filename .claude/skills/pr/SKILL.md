---
name: pr
description: Create or finish the pull request for the current branch — CHANGELOG and ROADMAP checks, AC → evidence table, Decisions compiled from commit bodies, Review line. Use when asked to open, create, or update a PR.
---

Create or finish the PR for the current branch.

## Steps

1. `git fetch -q origin main`, then `git log --oneline origin/main..HEAD` and `git diff origin/main...HEAD` to see the whole branch.
2. Push the branch if needed: `git push -u origin <branch>` (branch only — never tags).
3. Take the Linear issue id from the branch name (`type/vpa-NN-…`).
4. User-visible change without a matching `[Unreleased]` line in `CHANGELOG.md` → add it first. A PR that starts or ends a phase → update `docs/ROADMAP.md` (`rules/docs.md` → Roadmap maintenance).
5. Frontend files changed → `cd frontend && yarn lint && yarn build` must pass.
6. Body: follow `.github/pull_request_template.md`.
   - **Related issue:** `Fixes VPA-NN` (moves the Linear issue to Done on squash merge); "none" if the branch has no id.
   - **AC → evidence:** one row per acceptance criterion, built from `.claude/progress.md` — a named test, a runnable command, or an artifact. Commands must run from a fresh clone: no session-scratchpad paths; commit the script or paste it in the PR. UI rows name the screenshot file under `.claude/evidence/` (the CLI can't upload images). Cite the red commit.
   - **Decisions:** compiled from the branch's commit bodies (`git log --format=%B origin/main..HEAD`) — choices with rejected alternatives, surfaced constants and thresholds, guessed-interface renames. Longer on the risky lane.
   - **Review:** the reviewer's Review line (verdict + finding IDs fixed).
   - **How to test:** curl examples use port 8001.
   - **Harness friction** (optional): what in `.claude/` tripped the session, and which file.
7. Title: `type: description (VPA-NN)`. Create with `gh pr create`, update with `gh pr edit`.
8. Return the PR URL.

## Rules

- Push the branch only, never tags — tag pushes deploy.
- No PR for a user-visible change without a CHANGELOG line.
- **Scope:** this skill doesn't review code (`/review`) or audit security (`/review security`).
