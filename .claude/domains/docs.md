# Documentation Rules

> Read when adding a new doc, updating an existing one, writing an ADR, or marking a roadmap item.

README is the table of contents — one-line descriptions linking to `docs/`. Details live in one place only.

## Rules

- Each doc has a single owner topic
- Cross-reference between docs with relative links, don't duplicate content
- Keep docs concise — if it's long, split it
- Update docs when architecture changes, not as a standalone task
- README lists all docs with a one-liner
- Roadmap maintenance: when work completes a capability tracked in `docs/ROADMAP.md`, mark it `[x]` with the issue ref. Only add new items for meaningful capabilities — roadmaps are strategic, not operational. This check is part of the `/pr` flow.

## Documentation boundaries

| Document | Repo | Scope |
|---|---|---|
| `docs/ROADMAP.md` | coupette | Product phases + cross-cutting UX/CD pipeline |
| `docs/ENGINEERING.md` backlog | coupette | App-level engineering quality |
| `docs/ROADMAP.md` | infra | Platform infrastructure |

User-noticeable change → coupette ROADMAP. Builds-better-not-user-visible → ENGINEERING. VPS / shared services → infra ROADMAP.

## ADRs

Significant technical decisions recorded in `docs/decisions/` using: Context, Options, Decision, Rationale, Consequences.

Write an ADR for: choosing between real alternatives, decisions that are hard to reverse, decisions that need explaining to a future contributor.

Skip an ADR for: framework conventions, tooling with no meaningful alternative, implementation details that live in code comments.

Format: `NNNN-short-description.md`. Keep concise (30-50 lines). Capture *why*, not *how*.

## Session logs

Lifecycle and skip rules live in [`docs/session-logs/README.md`](../../docs/session-logs/README.md). The documenter agent writes one per pipeline run automatically.
