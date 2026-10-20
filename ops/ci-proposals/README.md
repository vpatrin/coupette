# CI proposals

CI is frozen for the crew (charter rule 6). To change CI, write a proposal here.
Victor reads it and applies it on his own schedule. The crew keeps working meanwhile.

## Format

One file per proposal: `YYYY-MM-DD-<short-name>.md`, committed in a ticket branch.

```
# <what to change>

Why: <the failure or cost it removes, with a PR or run link>
Change: <the exact diff to .github/workflows/ci.yml or another CI file>
Risk: <what it could break>
Ticket: EXP-NN
```

Add one line under "For Victor" in `ops/STATUS.md` that names the file.
