import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useApiClient } from '@/lib/api'
import type { CellarEntryOut, ProductOut } from '@/lib/types'

// Matches MAX_CELLAR_QUANTITY in backend/config.py
export const MAX_CELLAR_QUANTITY = 999

// User-scoped like watchesKeys: the cache survives logout, so an unscoped key
// would briefly show the previous user's cellar after switching accounts.
export const cellarKeys = {
  list: (userId: number | undefined) => ['cellar', userId] as const,
}

// Single source for the cellar page, card badges and add buttons — every
// caller shares one cached GET /cellar instead of one request per card.
export function useCellar() {
  const { user } = useAuth()
  const apiClient = useApiClient()
  return useQuery({
    queryKey: cellarKeys.list(user?.id),
    queryFn: () => apiClient<CellarEntryOut[]>('/cellar'),
    enabled: !!user,
  })
}

export function useCellarQuantities(): Map<string, number> {
  const { data } = useCellar()
  // useMemo so the Map identity only changes when the cached list does
  return useMemo(() => new Map((data ?? []).map((e) => [e.sku, e.quantity])), [data])
}

// Shared optimistic-update plumbing for the three cellar mutations
function useOptimisticCellarMutation<TVars>(
  mutationFn: (vars: TVars) => Promise<unknown>,
  applyOptimistic: (entries: CellarEntryOut[], vars: TVars) => CellarEntryOut[],
) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const key = cellarKeys.list(user?.id)

  return useMutation({
    mutationFn,
    // onMutate runs before the request: write the expected result into the
    // cache so every card and row reading ['cellar'] updates instantly.
    onMutate: async (vars: TVars) => {
      // Cancel in-flight GETs so a stale response can't overwrite the optimistic write
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CellarEntryOut[]>(key)
      queryClient.setQueryData<CellarEntryOut[]>(key, (prev) => applyOptimistic(prev ?? [], vars))
      return { previous }
    },
    // The context returned by onMutate carries the snapshot to roll back to
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(key, context?.previous)
    },
    // Success or failure, refetch so the cache converges on the server's truth
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useAddToCellar() {
  const apiClient = useApiClient()
  return useOptimisticCellarMutation(
    (product: ProductOut) =>
      apiClient<CellarEntryOut>('/cellar', {
        method: 'POST',
        body: JSON.stringify({ sku: product.sku }),
      }),
    (entries, product) =>
      entries.some((e) => e.sku === product.sku)
        ? entries.map((e) =>
            e.sku === product.sku
              ? { ...e, quantity: Math.min(e.quantity + 1, MAX_CELLAR_QUANTITY) }
              : e,
          )
        : [
            {
              id: 0, // placeholder until the refetch brings the real row
              sku: product.sku,
              quantity: 1,
              added_at: new Date().toISOString(),
              product,
            },
            ...entries,
          ],
  )
}

export function useSetCellarQuantity() {
  const apiClient = useApiClient()
  return useOptimisticCellarMutation(
    ({ sku, quantity }: { sku: string; quantity: number }) =>
      apiClient<CellarEntryOut>(`/cellar/${encodeURIComponent(sku)}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      }),
    (entries, { sku, quantity }) => entries.map((e) => (e.sku === sku ? { ...e, quantity } : e)),
  )
}

export function useRemoveFromCellar() {
  const apiClient = useApiClient()
  return useOptimisticCellarMutation(
    (sku: string) => apiClient(`/cellar/${encodeURIComponent(sku)}`, { method: 'DELETE' }),
    (entries, sku) => entries.filter((e) => e.sku !== sku),
  )
}
