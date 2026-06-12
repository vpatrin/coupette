import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useApiClient, ApiError } from '@/lib/api'
import { WineDetailProvider } from '@/contexts/WineDetailContext'
import { product } from '@/tests/factories'
import type { WatchWithProduct } from '@/lib/types'
import WatchesPage from './WatchesPage'

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

function watch(overrides: Partial<WatchWithProduct> = {}): WatchWithProduct {
  return {
    watch: { id: 1, user_id: 'user:1', sku: 'SKU001', created_at: '2026-01-01T00:00:00Z' },
    product: product(),
    ...overrides,
  }
}

function apiReturning(watches: WatchWithProduct[] | Error) {
  mockApiClient.mockImplementation((url: string) => {
    if (url.startsWith('/watches')) {
      return watches instanceof Error ? Promise.reject(watches) : Promise.resolve(watches)
    }
    if (url.includes('/stores/preferences')) return Promise.resolve([])
    return Promise.reject(new Error(`unexpected api call: ${url}`))
  })
}

// Initial GET succeeds with `watches`; subsequent DELETE on `/watches/:sku`
// resolves/rejects per `deleteResult`.
function apiWithDelete(watches: WatchWithProduct[], deleteResult: 'ok' | Error) {
  mockApiClient.mockImplementation((url: string, options?: { method?: string }) => {
    if (options?.method === 'DELETE') {
      return deleteResult === 'ok' ? Promise.resolve(undefined) : Promise.reject(deleteResult)
    }
    if (url.startsWith('/watches')) return Promise.resolve(watches)
    if (url.includes('/stores/preferences')) return Promise.resolve([])
    return Promise.reject(new Error(`unexpected api call: ${url}`))
  })
}

function renderPage() {
  // Fresh QueryClient per test, retries disabled — errors surface immediately
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WineDetailProvider>
          <WatchesPage />
        </WineDetailProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...result, queryClient }
}

beforeEach(() => {
  mockApiClient.mockReset()
  vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as ReturnType<typeof useAuth>)
  vi.mocked(useApiClient).mockReturnValue(mockApiClient)
})

describe('WatchesPage', () => {
  it('renders skeleton rows while watches are loading', () => {
    mockApiClient.mockImplementation(() => new Promise(() => {}))
    const { container } = renderPage()
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4)
  })

  it('shows error message with dismiss when watches fetch fails', async () => {
    apiReturning(new ApiError(500, 'Server error'))
    renderPage()
    expect(await screen.findByText('Server error')).toBeInTheDocument()
  })

  it('renders watch list when watches load successfully', async () => {
    apiReturning([watch()])
    renderPage()
    expect(await screen.findByText('Château Test')).toBeInTheDocument()
  })

  it('renders empty state when no watches exist', async () => {
    apiReturning([])
    renderPage()
    expect(await screen.findByText('No wines watched yet')).toBeInTheDocument()
  })

  it('renders watch list when store preferences fetch fails', async () => {
    mockApiClient.mockImplementation((url: string) => {
      if (url.startsWith('/watches')) return Promise.resolve([watch()])
      if (url.includes('/stores/preferences')) return Promise.reject(new ApiError(500, 'boom'))
      return Promise.reject(new Error(`unexpected api call: ${url}`))
    })
    renderPage()
    expect(await screen.findByText('Château Test')).toBeInTheDocument()
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
  })

  it('removes the watch from the list and query cache on successful remove', async () => {
    const user = userEvent.setup()
    apiWithDelete([watch()], 'ok')
    const { queryClient } = renderPage()
    expect(await screen.findByText('Château Test')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(screen.queryByText('Château Test')).not.toBeInTheDocument())
    expect(queryClient.getQueryData(['watches', 'user:1'])).toEqual([])
  })

  it('restores the watch and shows an error when remove fails', async () => {
    const user = userEvent.setup()
    apiWithDelete([watch()], new ApiError(500, 'Server error'))
    const { queryClient } = renderPage()
    expect(await screen.findByText('Château Test')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(await screen.findByText('Server error')).toBeInTheDocument()
    expect(screen.getByText('Château Test')).toBeInTheDocument()
    expect(queryClient.getQueryData(['watches', 'user:1'])).toEqual([watch()])
  })

  it('dismisses the remove error without affecting the watch list', async () => {
    const user = userEvent.setup()
    apiWithDelete([watch()], new ApiError(500, 'Server error'))
    renderPage()
    expect(await screen.findByText('Château Test')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Server error')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Failed to remove watch' }))

    expect(screen.queryByText('Server error')).not.toBeInTheDocument()
    expect(screen.getByText('Château Test')).toBeInTheDocument()
  })
})
