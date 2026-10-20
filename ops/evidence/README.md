# Evidence

Files that back a claim in a PR or a journal entry, when a test name or a command is not
enough: an eval run, a benchmark output, a screenshot.

- One folder per ticket: `ops/evidence/EXP-NN/`.
- Small files only: text, JSON, PNG under 300 KB. Never secrets, tokens or `.env` content.
- The PR's Evidence section names the file.

Feature QA reports stay out of git: the `verify` skill writes them under
`~/.cache/coupette-run/qa/` and the QA agent posts the summary on the feature issue
(`ops/CONTRACTS.md` §4).
