# Journal

One file per day: `ops/journal/YYYY-MM-DD.md` (UTC date). Each worker appends one entry
for its ticket and commits it in the ticket branch, so the entry merges with the code.
The PR body links the day's file.

## Entry format

```
## EXP-NN <ticket title> — ready | parked | failed

- What changed: <outcome first, one or two short sentences>
- Decisions: <choice> over <rejected option>, because <reason> | none
- Findings: code review <n> Important, <n> Nit (fixed <n>); security <n> real (fixed <n>)
- Friction: <what in .claude/ slowed the run, and which file> | none
```

## Rules

- No arm, model, planner or round count here. The PR links this file, and the day-7
  spot-check is blind. Those go in `ops/tasks.jsonl`.
- Append only. Never edit another ticket's entry.
- Short sentences, active voice, plain words (see CLAUDE.md → Writing for Victor).
