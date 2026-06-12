import { QueryClient } from '@tanstack/react-query'

// Single shared QueryClient instance — holds the cache for all server-state
// queries across the app (one "store" per browser tab, similar to a
// per-request cache layer but kept alive between page navigations).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 30s — nav between pages within that
      // window reuses the cache instead of refetching. Catalog/watch data
      // changes on a scraper schedule, not in real time.
      staleTime: 30_000,
      // Keep unused query data in memory for 5min (TanStack default) so
      // back-navigation can show cached data instantly while refetching.
      gcTime: 5 * 60_000,
      // One retry absorbs a transient network blip before surfacing the
      // inline error UI — matches "errors inline and recoverable".
      retry: 1,
      // Not a live dashboard — refetching every time the tab regains focus
      // would be a surprise, not a feature.
      refetchOnWindowFocus: false,
      // Cheap correctness win after a dropped connection — keep default.
      refetchOnReconnect: true,
    },
  },
})
