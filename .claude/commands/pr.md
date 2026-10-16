Create or finish the PR for the current branch.

## Steps

1. `git fetch -q origin main`, then `git log --oneline origin/main..HEAD` and `git diff origin/main...HEAD` to see the whole branch.
2. Push the branch if needed: `git push -u origin <branch>` (branch only — never tags).
3. Take the Linear issue id from the branch name (`type/vpa-NN-…`).
4. User-visible change without a matching `[Unreleased]` line in `CHANGELOG.md` → add it first (`rules/docs.md`).
5. Frontend files changed → `cd frontend && yarn lint && yarn build` must pass.
6. Body: follow `.github/pull_request_template.md`.
   - **Related issue:** `Fixes VPA-NN` (moves the Linear issue to Done on squash merge); "none" if the branch has no id.
   - **AC → evidence:** one row per acceptance criterion, built from `.claude/progress.md` — a named test, a runnable command, or an artifact. UI rows link a browser screenshot. Cite the red commit.
   - **Decisions:** choices with rejected alternatives, surfaced constants and thresholds, guessed-interface renames. Longer on the risky lane.
   - **Review:** the reviewer's Review line (verdict + finding IDs fixed).
   - **How to test:** curl examples use port 8001.
   - **Harness friction** (optional): what in `.claude/` tripped the session, and which file.
7. Title: `type: description (VPA-NN)`. Create with `gh pr create` (`--draft` while `/feature` is still working), update with `gh pr edit`, and mark ready with `gh pr ready` once the review passes.
8. Return the PR URL.

## Rules

- Push the branch only, never tags — tag pushes deploy.
- No PR for a user-visible change without a CHANGELOG line.
- **Scope:** this command doesn't review code (`/review`) or audit security (`/security`).
