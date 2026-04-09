import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useApiClient, ApiError } from '@/lib/api'
import '../i18n'
import TastingForm from './TastingForm'
import type { ProductOut, TastingNoteOut } from '@/lib/types'

vi.mock('@/lib/api', () => ({
  useApiClient: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    detail: string
    constructor(status: number, detail: string) {
      super(detail)
      this.status = status
      this.detail = detail
    }
  },
}))

// Stub WineSearch — its API calls are out of scope for TastingForm tests
vi.mock('@/components/WineSearch', () => ({
  default: ({ onCancel }: { onSelect: unknown; onCancel: () => void }) => (
    <button type="button" onClick={onCancel}>
      Cancel
    </button>
  ),
}))

const mockApiClient = vi.fn()

function product(overrides: Partial<ProductOut> = {}): ProductOut {
  return {
    sku: 'SKU001',
    name: 'Château Test',
    category: 'Vin rouge',
    country: 'France',
    region: 'Bordeaux',
    size: '750 ml',
    price: '24.95',
    url: 'https://saq.com/SKU001',
    online_availability: false,
    store_availability: [],
    rating: null,
    review_count: null,
    appellation: null,
    designation: null,
    classification: null,
    grape: 'Merlot',
    grape_blend: null,
    alcohol: '13.5%',
    sugar: null,
    producer: null,
    vintage: '2021',
    taste_tag: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as ProductOut
}

function fakeNote(overrides: Partial<TastingNoteOut> = {}): TastingNoteOut {
  return {
    id: 1,
    sku: 'SKU001',
    rating: 87,
    notes: null,
    pairing: null,
    tasted_at: '2026-01-01',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    product_name: 'Château Test',
    product_category: 'Vin rouge',
    product_region: 'Bordeaux',
    product_grape: 'Merlot',
    product_price: '24.95',
    ...overrides,
  }
}

beforeEach(() => {
  mockApiClient.mockReset()
  vi.mocked(useApiClient).mockReturnValue(mockApiClient)
})

describe('TastingForm', () => {
  it('renders rating slider and impressions section when initialProduct provided', () => {
    render(<TastingForm initialProduct={product()} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('slider')).toBeInTheDocument()
    expect(screen.getByText('Impressions')).toBeInTheDocument()
  })

  it('pre-fills rating and notes from initial values', () => {
    render(
      <TastingForm
        initialProduct={product()}
        initialRating={92}
        initialNotes="Lovely finish"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    // Rating value is rendered in a span next to the slider
    expect(screen.getByText('92')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Lovely finish')).toBeInTheDocument()
  })

  it('calls onSave with correct sku and rating after successful POST', async () => {
    mockApiClient.mockResolvedValue(fakeNote({ rating: 87 }))
    const onSave = vi.fn()
    render(<TastingForm initialProduct={product()} onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ sku: 'SKU001', rating: 87 }))
  })

  it('shows saving label and disables button while request is in flight', async () => {
    let resolve: (n: TastingNoteOut) => void
    const pending = new Promise<TastingNoteOut>((r) => {
      resolve = r
    })
    mockApiClient.mockReturnValue(pending)
    render(<TastingForm initialProduct={product()} onSave={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByRole('button', { name: /saving/i })).toBeDisabled()
    resolve!(fakeNote())
  })

  it('shows error message with retry when save fails', async () => {
    mockApiClient.mockRejectedValue(new ApiError(500, 'DB error'))
    render(<TastingForm initialProduct={product()} onSave={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/Couldn't save/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('calls onCancel when cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<TastingForm initialProduct={product()} onSave={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('hides rating and notes form when no initialProduct provided', () => {
    render(<TastingForm onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByText('Impressions')).not.toBeInTheDocument()
  })
})
