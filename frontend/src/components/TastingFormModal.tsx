import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import TastingForm from '@/components/TastingForm'
import type { ProductOut, TastingOut } from '@/lib/types'

interface TastingFormModalProps {
  // Skips the wine search step when set
  initialProduct?: ProductOut
  onSave: (note: TastingOut) => void
  onClose: () => void
}

// Portaled to body to escape overflow:hidden on <main>
function TastingFormModal({ initialProduct, onSave, onClose }: TastingFormModalProps) {
  const { t } = useTranslation()
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="border-border relative mx-4 w-full max-w-lg rounded-xl border bg-[#0e0e12] p-6 shadow-2xl">
        <p className="mb-4 text-[14px] font-medium">{t('tastingForm.addTitle')}</p>
        <TastingForm initialProduct={initialProduct} onSave={onSave} onCancel={onClose} />
      </div>
    </div>,
    document.body,
  )
}

export default TastingFormModal
