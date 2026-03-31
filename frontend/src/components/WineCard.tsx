import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatOrigin } from '@/lib/utils'
import type { ProductOut } from '@/lib/types'

interface WineCardProps {
  product: ProductOut
  reason?: string
  storeNames?: Map<string, string>
  storesExpanded?: boolean
  onToggleStores?: () => void
}

// Maps SAQ category to a dot color
const CATEGORY_DOT: Record<string, string> = {
  'Vin rouge': 'bg-red-400/80',
  'Vin blanc': 'bg-amber-100/80',
  'Vin rosé': 'bg-pink-300/80',
  'Vin rosé effervescent': 'bg-pink-300/80',
  'Vin blanc effervescent': 'bg-amber-100/80',
  Champagne: 'bg-amber-100/80',
  Cidre: 'bg-green-300/80',
  'Vin fortifié': 'bg-orange-400/80',
}

const MAX_GRAPES_VISIBLE = 3

function WineCard({ product, reason, storeNames, storesExpanded, onToggleStores }: WineCardProps) {
  const { t } = useTranslation()
  const [grapesExpanded, setGrapesExpanded] = useState(false)
  const origin = formatOrigin(product)
  const hasOnline = product.online_availability === true
  const storeAvail = product.store_availability ?? []

  const matchingIds = storeNames ? storeAvail.filter((id) => storeNames.has(id)) : []
  const hasStores = storeNames && storeNames.size > 0
  const canExpand = matchingIds.length > 1 && onToggleStores

  const storeText =
    matchingIds.length === 1
      ? t('availability.atStore', { store: storeNames?.get(matchingIds[0]) })
      : t('availability.inYourStores', { count: matchingIds.length })

  const storeNode = hasStores ? (
    matchingIds.length > 0 ? (
      canExpand ? (
        <button
          type="button"
          className="text-[10px] text-green-500 hover:underline underline-offset-4 cursor-pointer"
          onClick={onToggleStores}
        >
          {storeText}
        </button>
      ) : (
        <span className="text-[10px] text-green-500">{storeText}</span>
      )
    ) : null
  ) : storeAvail.length > 0 ? (
    <span className="text-[10px] text-green-500">
      {t('availability.inStores', { count: storeAvail.length })}
    </span>
  ) : null

  const grapes = product.grape
    ? product.grape
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
    : []
  const visibleGrapes = grapesExpanded ? grapes : grapes.slice(0, MAX_GRAPES_VISIBLE)
  const hiddenCount = Math.max(0, grapes.length - MAX_GRAPES_VISIBLE)

  const dotColor = product.category
    ? (CATEGORY_DOT[product.category] ?? 'bg-muted-foreground/40')
    : null

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-white/[0.025] transition-colors hover:border-primary/20">
      {/* Warm gradient overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-primary/[0.02] to-transparent" />

      <div className="relative px-[18px] py-4">
        {/* Top row: dot + name + price */}
        <div className="flex items-start gap-2.5">
          {dotColor && (
            <span className={`mt-[5px] w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
          )}
          <div className="flex items-start justify-between gap-3 flex-1 min-w-0">
            <p className="text-[15px] font-medium leading-snug min-w-0 flex-1">
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
              <p className="font-mono text-[22px] font-light text-primary/90 leading-none whitespace-nowrap flex-shrink-0">
                {product.price} $
              </p>
            )}
          </div>
        </div>

        {/* Region pill */}
        {origin && (
          <div className="mt-[6px] ml-[18px]">
            <span className="text-[10px] px-2 py-0.5 rounded border bg-white/[0.04] text-muted-foreground border-white/[0.06]">
              {origin}
            </span>
          </div>
        )}

        {/* Grapes list */}
        {grapes.length > 0 && (
          <div className="mt-2 ml-[18px] flex flex-col gap-0.5">
            {visibleGrapes.map((grape) => (
              <p
                key={grape}
                className="font-mono text-[10px] text-muted-foreground/50 leading-snug"
              >
                {grape}
              </p>
            ))}
            {!grapesExpanded && hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setGrapesExpanded(true)}
                className="text-left font-mono text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
              >
                + {hiddenCount} {t('wineCard.more')}
              </button>
            )}
            {grapesExpanded && grapes.length > MAX_GRAPES_VISIBLE && (
              <button
                type="button"
                onClick={() => setGrapesExpanded(false)}
                className="text-left font-mono text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
              >
                ↑ {t('wineCard.less')}
              </button>
            )}
          </div>
        )}

        {/* Reason / tasting note */}
        {reason && (
          <p className="text-[13px] font-light text-muted-foreground leading-relaxed mt-[10px] pt-[10px] border-t border-border">
            {reason}
          </p>
        )}

        {/* Availability */}
        {(hasOnline || storeNode) && (
          <div className="flex items-center gap-2 mt-3">
            {hasOnline && (
              <span className="text-[10px] text-green-500">{t('availability.online')}</span>
            )}
            {hasOnline && storeNode && (
              <span className="text-[10px] text-muted-foreground/50">·</span>
            )}
            {storeNode}
          </div>
        )}

        {/* Expanded store list */}
        {storesExpanded && matchingIds.length > 1 && (
          <ul className="text-muted-foreground text-xs ml-1 mt-1.5">
            {matchingIds.map((id) => (
              <li key={id}>{storeNames?.get(id)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default WineCard
