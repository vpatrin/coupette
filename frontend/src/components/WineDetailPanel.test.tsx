import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { useAuth } from '@/contexts/AuthContext'
import { useApiClient, ApiError } from '@/lib/api'
import '../i18n'
import WineDetailPanel from './WineDetailPanel'
import type { ProductOut } from '@/lib/types'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
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

function renderPanel(sku: string | null, onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <WineDetailPanel sku={sku} onClose={onClose} />
    </MemoryRouter>,
  )
}

function apiReturning(p: ProductOut) {
  mockApiClient.mockImplementation((url: string) => {
    if (url.startsWith('/products/')) return Promise.resolve(p)
    if (url.includes('/watches')) return Promise.resolve([])
    if (url.includes('/stores/preferences')) return Promise.resolve([])
    return Promise.reject(new Error(`unexpected api call: ${url}`))
  })
}

beforeEach(() => {
  mockApiClient.mockReset()
  vi.mocked(useAuth).mockReturnValue({
    user: { id: 1, display_name: 'Victor', role: 'user', locale: 'en' },
    login: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    isLoading: false,
  } as ReturnType<typeof useAuth>)
  vi.mocked(useApiClient).mockReturnValue(mockApiClient)
})

describe('WineDetailPanel', () => {
  it('renders wine name in heading when product loads', async () => {
    apiReturning(product())
    renderPanel('SKU001')
    expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent('Château Test')
  })

  it('renders price with currency symbol', async () => {
    apiReturning(product())
    renderPanel('SKU001')
    await screen.findByRole('heading', { level: 2 })
    expect(screen.getByText('24.95 $')).toBeInTheDocument()
  })

  it('renders grape variety when present', async () => {
    apiReturning(product({ grape: 'Merlot' }))
    renderPanel('SKU001')
    await screen.findByRole('heading', { level: 2 })
    expect(screen.getByText('Merlot')).toBeInTheDocument()
  })

  it('omits grape section when grape is null', async () => {
    apiReturning(product({ grape: null }))
    renderPanel('SKU001')
    await screen.findByRole('heading', { level: 2 })
    expect(screen.queryByText('Grapes')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    apiReturning(product())
    const onClose = vi.fn()
    renderPanel('SKU001', onClose)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows error message with retry when product fetch fails', async () => {
    mockApiClient.mockImplementation((url: string) => {
      if (url.startsWith('/products/')) return Promise.reject(new ApiError(500, 'Server error'))
      return Promise.resolve([])
    })
    renderPanel('SKU001')
    await waitFor(() => expect(screen.getByText(/Server error/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
