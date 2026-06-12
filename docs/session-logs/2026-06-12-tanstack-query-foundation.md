# Session Log — TanStack Query foundation

**Branch:** `chore/tanstack-query-foundation`
**Date:** 2026-06-12
**PR:** not yet
**Issue:** #763
**Spec snapshot:** see `.claude/scratchpad/chore-tanstack-query-foundation/spec.md` while branch lives

## Why this work

Every page that fetches server data hand-rolled `useEffect` + `useState` for
data/loading/error plus a manual cancellation flag — duplicated boilerplate, no
caching, no dedup, no retry. ENGINEERING.md backlog item #5 already flagged this.
This issue lays the TanStack Query foundation (provider, defaults, devtools,
query-key convention) and migrates `WatchesPage` as the reference implementation
for `SearchPage` (#764) and the remaining pages + `useMutation` migration (#765).

## Decisions worth keeping

### Adopt TanStack Query over SWR / hand-rolled effects

- **Context:** three real options — keep hand-rolled effects, SWR, or TanStack Query.
- **Decision:** TanStack Query — built-in devtools, first-class `useMutation` support
  (needed for #765), broad ecosystem, React 19 compatible.
- **Rejected:** hand-rolled effects (boilerplate compounds per page, no caching); SWR
  (smaller API, weaker mutation ergonomics, smaller devtools ecosystem).
- **ADR:** `docs/adrs/0011-tanstack-query.md`

### QueryClient defaults (staleTime 30s, retry 1, refetchOnWindowFocus false)

- **Context:** Victor required new constants/thresholds to be surfaced before
  silently picking defaults. Proposed table in the spec was reviewed and approved
  by Victor up front, with no changes requested.
- **Decision:** `staleTime: 30_000`, `gcTime` = TanStack default (5min), `retry: 1`,
  `refetchOnWindowFocus: false`, `refetchOnReconnect: true` (default). Captured in
  ADR 0011 so future pages inherit the same behavior without re-deciding.
- **Rejected:** n/a — single proposal, validated before implementation started.
- **ADR:** `docs/adrs/0011-tanstack-query.md`

### Query-key convention (flat arrays, co-located key builders)

- **Context:** `['watches', userId]`-style flat arrays vs. nested/object-first keys
  vs. centralized key registry from day one.
- **Decision:** flat arrays, domain first then scoping params, object params passed
  whole (not spread); key-builder objects (e.g. `watchesKeys`) co-located in the
  page that owns the query. Revisit centralizing into `lib/queryKeys.ts` only if
  #764/#765 reveal duplication.
- **Rejected:** centralizing now — premature with only one migrated page.
- **ADR:** `docs/adrs/0011-tanstack-query.md`

## Obstacles + lessons

None — clean run. One pre-existing UX quirk was surfaced by the reviewer (not
introduced by this diff): when the watches-list fetch fails, the dismiss button on
the error banner only clears `removeError`, so the load-error banner stays visible
with a dead-looking dismiss link until the query is retried. Flagged as a follow-up
for #764/#765 — consider wiring a "retry" action via `watchesQuery.refetch()`.

## Final state

- **Files changed:** `frontend/package.json`, `frontend/yarn.lock`,
  `frontend/src/lib/queryClient.ts` (new), `frontend/src/main.tsx`,
  `frontend/src/pages/WatchesPage.tsx`, `frontend/src/pages/WatchesPage.test.tsx`
  (new), `docs/adrs/0011-tanstack-query.md` (new), `docs/ENGINEERING.md`.
- **Tests:** 4 new tests added on top of the initial migration coverage —
  115/115 pass total. `WatchesPage.tsx` coverage: 81.94% lines / 60.24% branches
  (no enforced frontend threshold yet; target ~60% per testing.md — pass).
- **ADRs spawned:** `docs/adrs/0011-tanstack-query.md` — Adopt TanStack Query for
  server state (provider, defaults, query-key convention, devtools).
- **Docs updated:** `docs/ENGINEERING.md` (backlog item #5, TanStack Query
  subsection, React Query Devtools subsection marked done, referencing #763/ADR
  0011); `docs/session-logs/INDEX.md`.
- **Migrations:** no.

## Links

- **PR:** TBD
- **Per-agent pipeline trace:** `.claude/scratchpad/chore-tanstack-query-foundation/log.md`
- **Related ADRs:** `docs/adrs/0011-tanstack-query.md`
- **Related session logs (same surface):** none yet — first frontend session log
  in the index.
- **Forward pointers:** #764 (SearchPage migration), #765 (remaining pages +
  `useMutation` migration, plus the dismiss/retry UX follow-up noted above).
