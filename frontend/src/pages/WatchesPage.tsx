import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MagnifyingGlass, BookmarkSimple, X } from '@phosphor-icons/react'
import { useAuth } from '@/contexts/AuthContext'
import { useApiClient, ApiError } from '@/lib/api'
import type { ProductOut, WatchWithProduct, UserStorePreferenceOut } from '@/lib/types'
import { formatOrigin, CATEGORY_DOT } from '@/lib/utils'
import EmptyState from '@/components/EmptyState'
import { useWineDetail } from '@/contexts/WineDetailContext'

// Co-located query-key builders — keeps cache keys consistent between the
// query and any code (handleRemove) that reads/writes the same cache entry.
const watchesKeys = {
  list: (userId: string) => ['watches', userId] as const,
}
const storePrefsKeys = ['storePreferences'] as const

function AvailabilityStatus({
  product,
  sku,
  storeNames,
  expandedStores,
  onToggleExpand,
}: {
  product: ProductOut
  sku: string
  storeNames: Map<string, string>
  expandedStores: Set<string>
  onToggleExpand: (sku: string) => void
}) {
  const { t } = useTranslation()
  const storeAvail = product.store_availability ?? []
  const matchingIds = storeAvail.filter((id) => storeNames.has(id))
  const hasSavedStores = storeNames.size > 0
  const isOnline = product.online_availability === true
  const inStore = matchingIds.length > 0
  const isExpanded = expandedStores.has(sku)
  const canExpand = inStore && matchingIds.length > 1

  const storeText =
    matchingIds.length === 1
      ? t('availability.atStore', { store: storeNames.get(matchingIds[0]) })
      : t('availability.inYourStores', { count: matchingIds.length })

  const genericStoreCount = storeAvail.length
  const storeNode =
    hasSavedStores && inStore ? (
      canExpand ? (
        <button
          type="button"
          className="cursor-pointer text-[10px] text-green-500 underline-offset-4 hover:underline"
          onClick={() => onToggleExpand(sku)}
        >
          {storeText}
        </button>
      ) : (
        <span className="text-[10px] text-green-500">{storeText}</span>
      )
    ) : !hasSavedStores && genericStoreCount > 0 ? (
      <span className="text-[10px] text-green-500">
        {t('availability.inStores', { count: genericStoreCount })}
      </span>
    ) : null

  const unavailable = !isOnline && !inStore

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex flex-wrap gap-x-1 gap-y-1">
        {unavailable && hasSavedStores ? (
          <span className="text-muted-foreground/60 text-[10px]">
            {t('availability.unavailable')}
          </span>
        ) : (
          <>
            {isOnline && (
              <span className="text-[10px] text-green-500">{t('availability.online')}</span>
            )}
            {isOnline && storeNode && (
              <span className="text-muted-foreground/50 text-[10px]">·</span>
            )}
            {storeNode}
          </>
        )}
      </div>
      {isExpanded && canExpand && (
        <ul className="text-muted-foreground mt-0.5 ml-1 flex flex-col gap-0.5 text-[10px]">
          {matchingIds.map((id) => (
            <li key={id}>{storeNames.get(id)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function WatchesPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { selectedSku, setSelectedSku } = useWineDetail()

  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')

  const userId = `user:${user?.id}`

  const watchesQuery = useQuery({
    queryKey: watchesKeys.list(userId),
    queryFn: () => apiClient<WatchWithProduct[]>(`/watches?user_id=${encodeURIComponent(userId)}`),
  })

  // Independent of the watches query — failure here degrades silently
  // (storeNames just stays empty), so we don't surface isError/error.
  const storePrefsQuery = useQuery({
    queryKey: storePrefsKeys,
    queryFn: () => apiClient<UserStorePreferenceOut[]>('/stores/preferences'),
  })

  const watches = watchesQuery.data ?? []
  const storeNames = new Map(
    (storePrefsQuery.data ?? []).map((p) => [p.saq_store_id, p.store.name]),
  )

  const loadError = watchesQuery.isError
    ? watchesQuery.error instanceof ApiError
      ? watchesQuery.error.detail
      : t('watches.failedToLoad')
    : null

  const handleRemove = useCallback(
    async (sku: string) => {
      const key = watchesKeys.list(userId)
      const previous = queryClient.getQueryData<WatchWithProduct[]>(key)

      // Optimistic remove — write directly into the query cache so the UI
      // (which reads from the same cache via useQuery) updates immediately.
      queryClient.setQueryData<WatchWithProduct[]>(key, (prev) =>
        (prev ?? []).filter((w) => w.watch.sku !== sku),
      )
      setRemoving(sku)
      try {
        await apiClient(`/watches/${sku}?user_id=${encodeURIComponent(userId)}`, {
          method: 'DELETE',
        })
      } catch (err) {
        // Roll back to the pre-optimistic snapshot on failure
        queryClient.setQueryData(key, previous)
        setRemoveError(err instanceof ApiError ? err.detail : t('watches.failedToRemove'))
      } finally {
        setRemoving(null)
      }
    },
    [apiClient, userId, t, queryClient],
  )

  const handleToggleExpand = useCallback((sku: string) => {
    setExpandedStores((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) {
        next.delete(sku)
      } else {
        next.add(sku)
      }
      return next
    })
  }, [])

  const query = filter.trim().toLowerCase()
  const filtered = query
    ? watches.filter(({ product }) => product?.name?.toLowerCase().includes(query))
    : watches

  if (watchesQuery.isLoading) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="border-border h-[72px] animate-pulse rounded-xl border bg-white/[0.025]"
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        className={`h-full overflow-y-auto p-8 transition-[padding-right] duration-300 ease-out ${selectedSku ? 'pr-[376px]' : ''}`}
      >
        <div className="mx-auto max-w-2xl">
          {/* Header */}
          <div className="mb-6 flex items-baseline gap-2.5">
            <h1 className="text-2xl font-light">{t('watches.title')}</h1>
            {watches.length > 0 && (
              <span className="text-muted-foreground/60 font-mono text-[11px] tabular-nums">
                {watches.length}
              </span>
            )}
          </div>

          {(loadError || removeError) && (
            <p className="text-destructive mb-4 text-[13px]">
              {loadError || removeError}{' '}
              <button
                type="button"
                className="hover:text-destructive/80 underline underline-offset-4"
                onClick={() => setRemoveError(null)}
              >
                {t('watches.failedToRemove')}
              </button>
            </p>
          )}

          {watches.length === 0 ? (
            <EmptyState
              icon={<BookmarkSimple size={28} />}
              title={t('watches.emptyTitle')}
              description={t('watches.emptyDesc')}
              cta={{ label: t('watches.emptyCta'), onClick: () => navigate('/search') }}
            />
          ) : (
            <>
              {/* Local search filter */}
              <div className="relative mb-5">
                <MagnifyingGlass
                  size={14}
                  className="text-muted-foreground/50 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('watches.filterPlaceholder')}
                  className="border-border placeholder:text-muted-foreground/40 focus:border-primary/30 h-9 w-full rounded-lg border bg-white/[0.04] pr-3 pl-8 text-[13px] transition-colors focus:outline-none"
                />
              </div>

              {filtered.length === 0 ? (
                <EmptyState icon={<MagnifyingGlass size={28} />} title={t('watches.noMatch')} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {filtered.map(({ watch, product }) => {
                    const dotColor = product?.category
                      ? (CATEGORY_DOT[product.category] ?? 'bg-muted-foreground/30')
                      : 'bg-muted-foreground/30'
                    const origin = product ? formatOrigin(product) : null
                    const meta = product
                      ? [origin, product.vintage].filter(Boolean).join(' · ')
                      : null

                    return (
                      <li
                        key={watch.sku}
                        onClick={() =>
                          product && setSelectedSku(selectedSku === watch.sku ? null : watch.sku)
                        }
                        className={`group border-border hover:border-primary/20 relative overflow-hidden rounded-xl border bg-white/[0.025] px-[18px] py-3.5 transition-colors ${product ? 'cursor-pointer' : ''}`}
                      >
                        {/* Warm gradient overlay */}
                        <div className="from-primary/[0.02] pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br to-transparent" />

                        <div className="relative flex items-start gap-2.5">
                          {/* Availability dot */}
                          <span
                            className={`mt-[5px] h-2 w-2 flex-shrink-0 rounded-full ${dotColor}`}
                          />

                          <div className="min-w-0 flex-1">
                            {product ? (
                              <>
                                {/* Name + price row */}
                                <div className="flex items-start justify-between gap-3">
                                  <p className="min-w-0 flex-1 truncate text-[14px] leading-snug font-medium">
                                    {product.url ? (
                                      <a
                                        href={product.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:text-primary transition-colors"
                                      >
                                        {product.name}
                                      </a>
                                    ) : (
                                      product.name
                                    )}
                                  </p>
                                  {product.price && (
                                    <p className="text-primary/90 flex-shrink-0 font-mono text-[14px] font-light whitespace-nowrap">
                                      {product.price} $
                                    </p>
                                  )}
                                </div>

                                {/* Meta */}
                                {meta && (
                                  <p className="text-muted-foreground/60 mt-0.5 text-[11px] leading-snug">
                                    {meta}
                                  </p>
                                )}

                                <AvailabilityStatus
                                  product={product}
                                  sku={watch.sku}
                                  storeNames={storeNames}
                                  expandedStores={expandedStores}
                                  onToggleExpand={handleToggleExpand}
                                />
                              </>
                            ) : (
                              <p className="text-muted-foreground text-[13px]">
                                {t('watches.delisted', { sku: watch.sku })}
                              </p>
                            )}
                          </div>

                          {/* Remove button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemove(watch.sku)
                            }}
                            disabled={removing === watch.sku}
                            className="text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40"
                            aria-label={t('watches.remove')}
                          >
                            <X size={13} weight="bold" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default WatchesPage
