import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useApiClient, ApiError } from '@/lib/api'
import { cellarEntry, fakeNote, product } from '@/tests/factories'
import type { CellarEntryOut } from '@/lib/types'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import WineDetailPanel from './WineDetailPanel'

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

function renderPanel(sku: string | null, onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WineDetailPanel sku={sku} onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function apiReturning(
  p: ReturnType<typeof product>,
  overrides?: { watchPost?: () => Promise<unknown>; tastingPost?: () => Promise<unknown> },
) {
  // Stateful like the server: the refetch after a POST returns the added entry
  let cellar: CellarEntryOut[] = []
  mockApiClient.mockImplementation((url: string, opts?: RequestInit) => {
    if (url.startsWith('/products/')) return Promise.resolve(p)
    if (url.includes('/watches') && opts?.method === 'POST')
      return overrides?.watchPost?.() ?? Promise.resolve({})
    if (url.includes('/watches')) return Promise.resolve([])
    if (url.includes('/stores/preferences')) return Promise.resolve([])
    if (url === '/cellar' && opts?.method === 'POST') {
      cellar = [cellarEntry({ sku: p.sku, product: p })]
      return Promise.resolve(cellar[0])
    }
    if (url === '/cellar') return Promise.resolve(cellar)
    if (url === '/tastings' && opts?.method === 'POST')
      return overrides?.tastingPost?.() ?? Promise.resolve(fakeNote({ sku: p.sku }))
    return Promise.reject(new Error(`unexpected api call: ${url}`))
  })
}

beforeEach(() => {
  mockApiClient.mockReset()
  vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as ReturnType<typeof useAuth>)
  vi.mocked(useApiClient).mockReturnValue(mockApiClient)
})

afterEach(() => {
  vi.useRealTimers()
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
    expect(await screen.findByText('24.95 $')).toBeInTheDocument()
  })

  it('renders grape variety when present', async () => {
    apiReturning(product())
    renderPanel('SKU001')
    expect(await screen.findByText('Merlot')).toBeInTheDocument()
  })

  it('omits grape section when grape is null', async () => {
    apiReturning(product({ grape: null }))
    renderPanel('SKU001')
    // Wait for loaded state (h2 present), then assert absence
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

  it('optimistically switches to Watching on watch click', async () => {
    apiReturning(product())
    renderPanel('SKU001')
    await screen.findByRole('heading', { level: 2 })
    fireEvent.click(screen.getByRole('button', { name: /watch$/i }))
    expect(await screen.findByRole('button', { name: /watching/i })).toBeInTheDocument()
  })

  it('rolls back to Watch when watch API call fails', async () => {
    apiReturning(product(), {
      watchPost: () => Promise.reject(new Error('network')),
    })
    renderPanel('SKU001')
    await screen.findByRole('heading', { level: 2 })
    fireEvent.click(screen.getByRole('button', { name: /watch$/i }))
    // During the request, button shows "..." (busy state masks the optimistic text)
    expect(screen.getByRole('button', { name: '...' })).toBeDisabled()
    // After rejection settles: rolls back to Watch
    await waitFor(() => expect(screen.getByRole('button', { name: /watch$/i })).toBeInTheDocument())
  })

  it('shows the in-cellar badge after clicking Add to my cellar', async () => {
    apiReturning(product())
    renderPanel('SKU001')
    fireEvent.click(await screen.findByRole('button', { name: 'Add to my cellar' }))
    expect(await screen.findByText('In your cellar')).toBeInTheDocument()
  })
})

describe('WineDetailPanel rating entry point', () => {
  async function openTastingForm() {
    await screen.findByRole('heading', { level: 2 })
    fireEvent.click(await screen.findByRole('button', { name: 'Add a tasting note' }))
    await screen.findByText('Add a note')
  }

  function tastingPostCalls() {
    return mockApiClient.mock.calls.filter(
      ([url, opts]) => url === '/tastings' && (opts as RequestInit | undefined)?.method === 'POST',
    )
  }

  it('renders an enabled Add a tasting note button without the Soon tooltip', async () => {
    apiReturning(product())
    renderPanel('SKU001')
    const pencil = await screen.findByRole('button', { name: 'Add a tasting note' })
    expect(pencil).toBeEnabled()
    expect(pencil).not.toHaveAttribute('title', 'Soon')
  })

  it('defines the pencil labels in both en and fr locales', () => {
    const enDetail = en.wineDetail as Record<string, string>
    const frDetail = fr.wineDetail as Record<string, string>
    for (const key of ['addNote', 'noteSaved']) {
      expect(enDetail[key]).toEqual(expect.stringMatching(/\S/))
      expect(frDetail[key]).toEqual(expect.stringMatching(/\S/))
    }
  })

  it('opens the tasting form with the panel wine pre-selected and no wine search', async () => {
    apiReturning(product())
    renderPanel('SKU001')
    await openTastingForm()
    expect(screen.getByRole('button', { name: 'Change wine' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search a wine…')).not.toBeInTheDocument()
  })

  it('sends POST /tastings with the panel SKU on save, closes the form, and keeps the panel open', async () => {
    apiReturning(product({ sku: 'SKU042' }))
    const onClose = vi.fn()
    renderPanel('SKU042', onClose)
    await openTastingForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByText('Add a note')).not.toBeInTheDocument())
    const calls = tastingPostCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('/tastings')
    expect(calls[0][1]).toEqual(expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse((calls[0][1] as RequestInit).body as string).sku).toBe('SKU042')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Château Test')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows Note saved on the pencil for 2 seconds after a successful save, then reverts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    apiReturning(product())
    renderPanel('SKU001')
    await openTastingForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Note saved' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByRole('button', { name: 'Note saved' })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByRole('button', { name: 'Add a tasting note' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Note saved' })).not.toBeInTheDocument()
  })

  it('closes only the tasting form when Cancel is clicked', async () => {
    apiReturning(product())
    const onClose = vi.fn()
    renderPanel('SKU001', onClose)
    await openTastingForm()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Add a note')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Château Test')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes only the tasting form when the backdrop is clicked', async () => {
    apiReturning(product())
    const onClose = vi.fn()
    renderPanel('SKU001', onClose)
    await openTastingForm()
    const backdrop = document.body.querySelector('.bg-black\\/60')
    expect(backdrop).not.toBeNull()
    fireEvent.click(backdrop as Element)
    expect(screen.queryByText('Add a note')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Château Test')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the form open with the inline save error and retry when POST /tastings fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    apiReturning(product(), { tastingPost: () => Promise.reject(new ApiError(500, 'boom')) })
    const onClose = vi.fn()
    renderPanel('SKU001', onClose)
    await openTastingForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Couldn't save/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByText('Add a note')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('closes only the tasting form on Escape and keeps the panel open', async () => {
    apiReturning(product())
    const onClose = vi.fn()
    renderPanel('SKU001', onClose)
    await openTastingForm()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Add a note')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Château Test')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose on Escape when the tasting form is closed', async () => {
    apiReturning(product())
    const onClose = vi.fn()
    renderPanel('SKU001', onClose)
    await screen.findByRole('heading', { level: 2 })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps the pencil label when the saved note belongs to another wine', async () => {
    apiReturning(product(), { tastingPost: () => Promise.resolve(fakeNote({ sku: 'SKU999' })) })
    renderPanel('SKU001')
    await openTastingForm()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByText('Add a note')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Add a tasting note' })).toBeInTheDocument()
  })

  it('keeps the form and the panel open on keys other than Escape', async () => {
    apiReturning(product())
    const onClose = vi.fn()
    renderPanel('SKU001', onClose)
    await openTastingForm()
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByText('Add a note')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('drops the open tasting form when the panel closes on a route change', async () => {
    apiReturning(product())
    const { rerender } = renderPanel('SKU001')
    await openTastingForm()
    const tree = (sku: string | null) => (
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <WineDetailPanel sku={sku} onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    )
    rerender(tree(null))
    rerender(tree('SKU001'))
    await screen.findByRole('heading', { level: 2 })
    expect(screen.queryByText('Add a note')).not.toBeInTheDocument()
  })
})
