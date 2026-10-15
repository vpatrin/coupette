import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  MinusIcon as Minus,
  PlusIcon as Plus,
  WineIcon as Wine,
  XIcon as X,
} from '@phosphor-icons/react'
import { ApiError } from '@/lib/api'
import type { CellarEntryOut, ProductOut } from '@/lib/types'
import { formatOrigin, CATEGORY_DOT } from '@/lib/utils'
import {
  MAX_CELLAR_QUANTITY,
  useAddToCellar,
  useCellar,
  useRemoveFromCellar,
  useSetCellarQuantity,
} from '@/hooks/useCellar'
import EmptyState from '@/components/EmptyState'
import TastingForm from '@/components/TastingForm'
import { useWineDetail } from '@/contexts/WineDetailContext'

type Row = { entry: CellarEntryOut; removed: boolean }

const byNewest = (a: Row, b: Row) => b.entry.added_at.localeCompare(a.entry.added_at)

function CellarPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { selectedSku, setSelectedSku } = useWineDetail()

  const cellarQuery = useCellar()
  const addBottle = useAddToCellar()
  const setQuantity = useSetCellarQuantity()
  const removeEntry = useRemoveFromCellar()

  // Entries just removed: the cache no longer holds them, so we keep a snapshot
  // to render the « Tu l'as bue ? » prompt in the slot the row occupied.
  const [removed, setRemoved] = useState<Map<string, CellarEntryOut>>(new Map())
  const [tastingProduct, setTastingProduct] = useState<ProductOut | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const entries = cellarQuery.data ?? []
  const liveSkus = new Set(entries.map((e) => e.sku))
  const rows: Row[] = [
    ...entries.map((entry) => ({ entry, removed: false })),
    // A removed SKU re-added elsewhere is live again — drop its stale prompt
    ...[...removed.values()]
      .filter((e) => !liveSkus.has(e.sku))
      .map((entry) => ({ entry, removed: true })),
  ].sort(byNewest)
  const totalBottles = entries.reduce((sum, e) => sum + e.quantity, 0)

  const dateFmt = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const onMutationError = (err: Error) =>
    setActionError(err instanceof ApiError ? err.detail : t('cellar.failedToUpdate'))

  const dismissPrompt = (sku: string) =>
    setRemoved((prev) => {
      const next = new Map(prev)
      next.delete(sku)
      return next
    })

  const handleRemove = (entry: CellarEntryOut) => {
    setActionError(null)
    setRemoved((prev) => new Map(prev).set(entry.sku, entry))
    removeEntry.mutate(entry.sku, {
      // The hook already rolled the row back into the cache — drop the prompt too
      onError: (err) => {
        dismissPrompt(entry.sku)
        onMutationError(err)
      },
    })
  }

  const handleDecrement = (entry: CellarEntryOut) => {
    if (entry.quantity <= 1) {
      handleRemove(entry)
      return
    }
    setActionError(null)
    setQuantity.mutate(
      { sku: entry.sku, quantity: entry.quantity - 1 },
      { onError: onMutationError },
    )
  }

  const handleIncrement = (entry: CellarEntryOut) => {
    if (!entry.product) return
    setActionError(null)
    addBottle.mutate(entry.product, { onError: onMutationError })
  }

  if (cellarQuery.isLoading) {
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
          <div className="mb-6 flex items-baseline gap-2.5">
            <h1 className="text-2xl font-light">{t('cellar.title')}</h1>
            {totalBottles > 0 && (
              <span className="text-muted-foreground/60 font-mono text-[11px] tabular-nums">
                {t('cellar.bottles', { count: totalBottles })}
              </span>
            )}
          </div>

          {cellarQuery.isError && (
            <p className="text-destructive mb-4 text-[13px]">
              {t('cellar.failedToLoad')}{' '}
              <button
                type="button"
                className="hover:text-destructive/80 underline underline-offset-4"
                onClick={() => cellarQuery.refetch()}
              >
                {t('cellar.retry')}
              </button>
            </p>
          )}

          {actionError && (
            <p className="text-destructive mb-4 text-[13px]">
              {actionError}{' '}
              <button
                type="button"
                className="hover:text-destructive/80 underline underline-offset-4"
                onClick={() => setActionError(null)}
              >
                {t('cellar.dismissError')}
              </button>
            </p>
          )}

          {rows.length === 0 && !cellarQuery.isError ? (
            <EmptyState
              icon={<Wine size={28} />}
              title={t('cellar.emptyTitle')}
              description={t('cellar.emptyDesc')}
              cta={{ label: t('cellar.emptyCta'), onClick: () => navigate('/search') }}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map(({ entry, removed: isRemoved }) => {
                const { product } = entry
                const name = product?.name ?? entry.sku

                if (isRemoved) {
                  return (
                    <li
                      key={entry.sku}
                      className="border-primary/20 flex items-center gap-3 rounded-xl border bg-white/[0.025] px-[18px] py-3.5"
                    >
                      <p className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]">
                        {t('cellar.removed', { name })}{' '}
                        <span className="text-foreground font-medium">{t('cellar.drankIt')}</span>
                      </p>
                      {product && (
                        <button
                          type="button"
                          onClick={() => setTastingProduct(product)}
                          className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors"
                        >
                          {t('cellar.logTasting')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => dismissPrompt(entry.sku)}
                        className="border-border text-muted-foreground hover:text-foreground shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors"
                      >
                        {t('cellar.dismiss')}
                      </button>
                    </li>
                  )
                }

                const dotColor = product?.category
                  ? (CATEGORY_DOT[product.category] ?? 'bg-muted-foreground/30')
                  : 'bg-muted-foreground/30'
                const meta = product
                  ? [formatOrigin(product), product.vintage].filter(Boolean).join(' · ')
                  : null

                return (
                  <li
                    key={entry.sku}
                    onClick={() =>
                      product && setSelectedSku(selectedSku === entry.sku ? null : entry.sku)
                    }
                    className={`group border-border hover:border-primary/20 relative overflow-hidden rounded-xl border bg-white/[0.025] px-[18px] py-3.5 transition-colors ${product ? 'cursor-pointer' : ''}`}
                  >
                    <div className="from-primary/[0.02] pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br to-transparent" />

                    <div className="relative flex items-center gap-2.5">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor}`} />

                      <div className="min-w-0 flex-1">
                        {product ? (
                          <p className="truncate text-[14px] leading-snug font-medium">{name}</p>
                        ) : (
                          <p className="text-muted-foreground text-[13px]">
                            {t('cellar.delisted', { sku: entry.sku })}
                          </p>
                        )}
                        <p className="text-muted-foreground/60 mt-0.5 truncate text-[11px] leading-snug">
                          {meta && <span>{meta} · </span>}
                          <span className="font-mono">
                            {t('cellar.addedOn', {
                              date: dateFmt.format(new Date(entry.added_at)),
                            })}
                          </span>
                        </p>
                      </div>

                      {/* Quantity controls — stopPropagation keeps clicks off the row's panel toggle */}
                      <div
                        className="flex flex-shrink-0 items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleDecrement(entry)}
                          aria-label={t('cellar.decrement')}
                          className="text-muted-foreground hover:text-foreground hover:bg-surface-hover flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                        >
                          <Minus size={12} weight="bold" />
                        </button>
                        <span className="text-primary/90 w-8 text-center font-mono text-[13px] tabular-nums">
                          ×{entry.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleIncrement(entry)}
                          disabled={!product || entry.quantity >= MAX_CELLAR_QUANTITY}
                          aria-label={t('cellar.increment')}
                          className="text-muted-foreground hover:text-foreground hover:bg-surface-hover flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:opacity-40"
                        >
                          <Plus size={12} weight="bold" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(entry)}
                          aria-label={t('cellar.remove')}
                          className="text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 ml-1 flex h-6 w-6 items-center justify-center rounded-md transition-colors"
                        >
                          <X size={13} weight="bold" />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Same portaled host as TastingsPage's add-note modal */}
      {tastingProduct &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setTastingProduct(null)}
            />
            <div className="border-border relative mx-4 w-full max-w-lg rounded-xl border bg-[#0e0e12] p-6 shadow-2xl">
              <p className="mb-4 text-[14px] font-medium">{t('tastingForm.addTitle')}</p>
              <TastingForm
                initialProduct={tastingProduct}
                onSave={() => {
                  dismissPrompt(tastingProduct.sku)
                  setTastingProduct(null)
                }}
                onCancel={() => setTastingProduct(null)}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

export default CellarPage
