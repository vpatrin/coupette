# ADR 0011: Adopt TanStack Query for Server State

**Date:** 2026-06-12
**Status:** Accepted

## Context

Every page that fetches server data (`WatchesPage`, `SearchPage`, etc.) hand-rolls the
same pattern: `useEffect` + `useState` for `data`/`loading`/`error`, plus a manual
`cancelled` flag to avoid setting state after unmount. This duplicates boilerplate per
page, has no caching (every nav refetches), no request deduplication, and no retry.
`docs/ENGINEERING.md` already flagged this as backlog item #5 ("Add
`tanstack/react-query`").

This ADR introduces TanStack Query as the canonical server-state layer and migrates
`WatchesPage` (#763) as the reference implementation for `SearchPage` (#764) and the
remaining pages + `useMutation` migration (#765).

## Options considered

1. **Keep hand-rolled effects** — works, but every page repeats cancellation,
   loading/error state, and has no caching. Tech debt compounds as more pages are added.
2. **SWR** — smaller API surface, decent caching, but weaker mutation ergonomics and a
   smaller devtools ecosystem. Less suited to the multi-page migration planned across
   #764/#765.
3. **TanStack Query** — built-in devtools, first-class mutation support (needed for
   #765), broad ecosystem/docs, React 19 compatible.

## Decision

Adopt **TanStack Query** (`@tanstack/react-query` + `@tanstack/react-query-devtools`).

A single `QueryClient` is created in `frontend/src/lib/queryClient.ts` and mounted via
`QueryClientProvider` in `main.tsx`, inside `AuthProvider` (query functions depend on
`useApiClient`, which reads `AuthContext`).

### QueryClient defaults

| Option | Value | Rationale |
|---|---|---|
| `staleTime` | `30_000` (30s) | Watch/search data changes on a scraper schedule, not in real time — avoids refetch storms on nav within a short window |
| `gcTime` | `5 * 60_000` (TanStack default) | Keeps cached data briefly for back-navigation without holding memory indefinitely |
| `retry` | `1` | One retry absorbs transient network blips, matches "errors inline and recoverable" |
| `refetchOnWindowFocus` | `false` | Not a live dashboard — refetching on tab focus would surprise users |
| `refetchOnReconnect` | `true` (default) | Cheap correctness win after a dropped connection |

### Query-key convention

- Flat array, first element = resource domain, subsequent elements = scoping params,
  in stable order: `['watches', userId]`, `['storePreferences']`,
  `['products', { search: query, filters }]`.
- Object params (e.g. filters) passed as a single object, not spread — TanStack
  serializes objects deterministically for cache-key comparison.
- No manual key string concatenation — always arrays.
- Co-locate key-builder objects near the page/hook that owns the query (e.g.
  `watchesKeys` in `WatchesPage.tsx`). Revisit centralizing into `lib/queryKeys.ts`
  if #764/#765 reveal duplication across pages.

### Devtools

`ReactQueryDevtools` is statically imported in `main.tsx` but rendered only when
`import.meta.env.DEV` is true. Vite statically evaluates this to `false` in production
builds and tree-shakes the branch (and the devtools bundle) entirely — verified via
`yarn build` + `grep` on `dist/assets/*.js`.

## Rationale

- Eliminates manual cancellation/loading/error boilerplate per page — `isLoading`/
  `isError`/`error`/`data` come from `useQuery` directly.
- Caching + deduplication mean navigating back to a page within `staleTime` shows
  cached data instantly instead of refetching.
- Built-in devtools make cache state, staleness, and refetches visible during
  development — useful while Victor builds a mental model of the cache.
- `useMutation` (deferred to #765) gives a structured place for optimistic updates
  with built-in rollback, replacing today's ad-hoc try/catch patterns.

## Consequences

- New runtime dependency: `@tanstack/react-query` (+8.6 kB brotli to the prod bundle,
  180.6 kB / 200 kB size-limit cap after this change — comfortable margin).
  `@tanstack/react-query-devtools` adds no prod bundle weight (dev-only, tree-shaken).
- The query-key convention above is load-bearing for #764/#765 — getting it wrong
  here means rework across three issues.
- The `QueryClient` defaults (staleTime, retry, etc.) become app-wide behavior —
  future changes to these need care, as they affect every migrated page.
- `WatchesPage`'s remove-watch flow now reads/writes the `['watches', userId]` cache
  entry directly via `queryClient.setQueryData` for its optimistic update/rollback,
  instead of local `useState` — the cache is now the single source of truth for
  watch data. Migration to `useMutation` is deferred to #765.
