import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useApiClient, ApiError } from '@/lib/api'
import { WineDetailProvider } from '@/contexts/WineDetailContext'
import { cellarEntry } from '@/tests/factories'
import type { CellarEntryOut } from '@/lib/types'
import CellarPage from './CellarPage'

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

// Stateful fake of the cellar API: mutations change what the next GET returns
function fakeCellarApi(initial: CellarEntryOut[], { failDelete = false } = {}) {
  let cellar = initial
  mockApiClient.mockImplementation((url: string, options?: { method?: string; body?: string }) => {
    const sku = decodeURIComponent(url.split('/')[2] ?? '')
    if (options?.method === 'DELETE') {
      if (failDelete) return Promise.reject(new ApiError(500, 'Server error'))
      cellar = cellar.filter((e) => e.sku !== sku)
      return Promise.resolve(undefined)
    }
    if (options?.method === 'PATCH') {
      const { quantity } = JSON.parse(options.body ?? '{}')
      cellar = cellar.map((e) => (e.sku === sku ? { ...e, quantity } : e))
      return Promise.resolve(cellar.find((e) => e.sku === sku))
    }
    if (url === '/cellar') return Promise.resolve(cellar)
    return Promise.reject(new Error(`unexpected api call: ${url}`))
  })
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/cellar']}>
        <WineDetailProvider>
          <Routes>
            <Route path="/cellar" element={<CellarPage />} />
            <Route path="/search" element={<p>Search page</p>} />
          </Routes>
        </WineDetailProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockApiClient.mockReset()
  vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as ReturnType<typeof useAuth>)
  vi.mocked(useApiClient).mockReturnValue(mockApiClient)
})

describe('CellarPage', () => {
  it('renders skeleton rows while the cellar is loading', () => {
    mockApiClient.mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4)
  })

  it('renders a row with the wine name, quantity and added date', async () => {
    fakeCellarApi([cellarEntry({ quantity: 3 })])
    renderPage()
    expect(await screen.findByText('Château Test')).toBeInTheDocument()
    expect(screen.getByText('×3')).toBeInTheDocument()
    expect(screen.getByText(/Added Jan 15, 2026/)).toBeInTheDocument()
  })

  it('renders the empty state with a CTA that navigates to search', async () => {
    const user = userEvent.setup()
    fakeCellarApi([])
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'Browse the catalog' }))

    expect(screen.getByText('Search page')).toBeInTheDocument()
  })

  it('decrements to ×1 without prompting when quantity is 2', async () => {
    const user = userEvent.setup()
    fakeCellarApi([cellarEntry({ quantity: 2 })])
    renderPage()
    await screen.findByText('×2')

    await user.click(screen.getByRole('button', { name: 'Remove a bottle' }))

    expect(await screen.findByText('×1')).toBeInTheDocument()
    expect(screen.queryByText('Did you drink it?')).not.toBeInTheDocument()
  })

  it('removes the row and shows the inline prompt when −1 brings quantity to 0', async () => {
    const user = userEvent.setup()
    fakeCellarApi([cellarEntry({ quantity: 1 })])
    renderPage()
    await screen.findByText('×1')

    await user.click(screen.getByRole('button', { name: 'Remove a bottle' }))

    expect(await screen.findByText('Did you drink it?')).toBeInTheDocument()
    expect(screen.queryByText('×1')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the tasting form with the removed wine preselected on Log tasting', async () => {
    const user = userEvent.setup()
    fakeCellarApi([cellarEntry({ quantity: 1 })])
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Remove from my cellar' }))

    await user.click(await screen.findByRole('button', { name: 'Log tasting' }))

    expect(screen.getByText('Add a note')).toBeInTheDocument()
    expect(screen.getByText('Château Test')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('clears the prompt and shows the empty state on No thanks', async () => {
    const user = userEvent.setup()
    fakeCellarApi([cellarEntry({ quantity: 1 })])
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Remove from my cellar' }))

    await user.click(await screen.findByRole('button', { name: 'No thanks' }))

    expect(screen.queryByText('Did you drink it?')).not.toBeInTheDocument()
    expect(await screen.findByText('Your cellar is empty')).toBeInTheDocument()
  })

  it('restores the row and drops the prompt when the removal fails', async () => {
    const user = userEvent.setup()
    fakeCellarApi([cellarEntry({ quantity: 1 })], { failDelete: true })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Remove from my cellar' }))

    expect(await screen.findByText('Server error')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('×1')).toBeInTheDocument())
    expect(screen.queryByText('Did you drink it?')).not.toBeInTheDocument()
  })
})
