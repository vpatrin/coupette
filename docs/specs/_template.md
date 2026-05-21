# <Subsystem Name>

> One-sentence "what this subsystem does."

## Contract

What this subsystem exposes to the rest of Coupette: HTTP routes, events emitted, CLI commands, library functions. Anyone calling into this subsystem reads this section.

## How it works

Typical request/operation flow through the subsystem. 2–4 paragraphs. Mermaid diagram if helpful.

## Files

| Concern | Where |
|---|---|
| Entry point | `path:lineno` |
| Core logic | `path` |
| Data access | `path` |
| Tests | `path` |

## Dependencies

What other subsystems this relies on. What would break if those changed.

## Cross-cutting concerns

How this subsystem handles each: one line per concern.

- **Auth:** ...
- **Logging:** ...
- **Errors:** ...
- **Observability:** ...
- **Rate limiting:** ...

## Operational notes

Env vars, secrets, prod gotchas, things that page someone at 3am.

## Related

- **ADRs:** `docs/adrs/NNNN-*.md`, etc.
- **Agent rules (imperative form):** [`.claude/rules/<name>.md`](../../.claude/rules/<name>.md)
- **Recent session logs:** look up via [`../session-logs/INDEX.md`](../session-logs/INDEX.md)
