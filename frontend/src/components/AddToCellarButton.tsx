import { useTranslation } from 'react-i18next'
import { useAddToCellar } from '@/hooks/useCellar'
import type { ProductOut } from '@/lib/types'

// Always adds one bottle — a second click increments. Owned quantity is shown
// by the "In your cellar" badge, which reads the same optimistic cache.
function AddToCellarButton({ product }: { product: ProductOut }) {
  const { t } = useTranslation()
  const addToCellar = useAddToCellar()

  return (
    <button
      type="button"
      onClick={(e) => {
        // Cards are clickable (open the detail panel) — keep this click local
        e.stopPropagation()
        addToCellar.mutate(product)
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-center text-[12px] whitespace-nowrap transition-colors ${
        addToCellar.isError
          ? 'border-destructive/40 text-destructive'
          : 'border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {addToCellar.isError ? t('cellar.addFailed') : t('cellar.add')}
    </button>
  )
}

export default AddToCellarButton
