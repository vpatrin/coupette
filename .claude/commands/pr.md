Create a PR for the current branch. Follow the Pre-PR Checklist from CLAUDE.md.

## Steps

1. Run `git log --oneline main..HEAD` to understand all commits on this branch.
2. Run `git diff main` to see the full diff.
3. Verify the branch has been pushed to remote (`git branch -vv`). If not, push it: `git push -u origin <branch>` (branch only — never tags). **Main session only** — a pipeline subagent (pr-creator) must not push; it returns BLOCKED per its own rules.
4. Determine which Linear issue(s) (`VPA-NN`) this branch closes from the commit history and branch name.
5. Verify CHANGELOG.md and ROADMAP.md are already updated (done in `/review`). If the PR changes deployed behavior and `[Unreleased]` has no matching entry, warn and stop.
6. Run frontend lint and build checks (only if frontend files changed):
   - `cd frontend && yarn lint` — must pass with 0 errors (warnings are OK if pre-existing on main)
   - `cd frontend && yarn build` — must succeed. If either fails, stop and fix before creating the PR.
7. Create the PR using `gh pr create` with:
   - Title in conventional commits format: `type: description (VPA-NN)` — take the id from the branch name (`type/vpa-NN-…`); omit the suffix if the branch carries no issue id
   - Body following `.github/pull_request_template.md` (Summary, Related issue(s), Changes, How to test if applicable)
   - Reference each Linear issue as `VPA-NN` in the Related issue(s) section (issues live in Linear; `Closes #XX` GitHub syntax no longer applies). If nothing to reference, write "none".
   - If "How to test" includes curl commands, use port 8001 (backend runs on 8001, not 8000)
8. Return the PR URL.

## Rules

- Push the branch only, never tags (`git push -u origin <branch>` — tag pushes trigger deploys)
- Do NOT create the PR if CHANGELOG.md is missing an entry for user-visible changes — warn and stop
- Prerequisite: `/review` must have passed. If unsure, ask Victor before proceeding.
- **Scope note:** this command does not re-check code quality — that's `/review`'s job. It also does not run a security audit (`/security`).
