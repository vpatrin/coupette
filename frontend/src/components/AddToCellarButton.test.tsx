import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { useApiClient, ApiError } from '@/lib/api'
import { useCellarQuantities } from '@/hooks/useCellar'
import { cellarEntry, product } from '@/tests/factories'
import type { CellarEntryOut } from '@/lib/types'
import WineCard from './WineCard'
import AddToCellarButton from './AddToCellarButton'

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

// Wired exactly like SearchPage: the badge reads the same cache the button writes
function CardWithCellar() {
  const quantities = useCellarQuantities()
  const p = product()
  return (
    <WineCard
      product={p}
      cellarSlot={<AddToCellarButton product={p} />}
      cellarQuantity={quantities.get(p.sku)}
    />
  )
}

// POST returns a promise the test settles by hand. With `hangRefetch`, every GET
// after the first never resolves — so only the hook's own rollback can restore
// the badge after a failure.
function apiWithPendingPost(cellar: CellarEntryOut[], { hangRefetch = false } = {}) {
  let settle: { resolve: (v: unknown) => void; reject: (e: Error) => void } = {
    resolve: () => {},
    reject: () => {},
  }
  let gets = 0
  mockApiClient.mockImplementation((url: string, options?: { method?: string }) => {
    if (url === '/cellar' && options?.method === 'POST')
      return new Promise((resolve, reject) => {
        settle = { resolve, reject }
      })
    if (url === '/cellar')
      return hangRefetch && gets++ > 0 ? new Promise(() => {}) : Promise.resolve(cellar)
    return Promise.reject(new Error(`unexpected api call: ${url}`))
  })
  return () => settle
}

async function clickAddThenFail(pending: ReturnType<typeof apiWithPendingPost>) {
  const user = userEvent.setup()
  expect(await screen.findByText('In your cellar')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Add to my cellar' }))
  expect(await screen.findByText('In your cellar (×2)')).toBeInTheDocument()
  // The POST is sent after the optimistic write — wait for it before failing it
  await waitFor(() =>
    expect(mockApiClient).toHaveBeenCalledWith(
      '/cellar',
      expect.objectContaining({ method: 'POST' }),
    ),
  )
  pending().reject(new ApiError(500, 'boom'))
}

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <CardWithCellar />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockApiClient.mockReset()
  vi.mocked(useAuth).mockReturnValue({ user: { id: 1 } } as ReturnType<typeof useAuth>)
  vi.mocked(useApiClient).mockReturnValue(mockApiClient)
})

describe('AddToCellarButton', () => {
  it('increments the badge to ×2 before the server responds', async () => {
    const user = userEvent.setup()
    apiWithPendingPost([cellarEntry({ quantity: 1 })])
    renderCard()
    expect(await screen.findByText('In your cellar')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add to my cellar' }))

    expect(await screen.findByText('In your cellar (×2)')).toBeInTheDocument()
  })

  it('rolls the badge back to ×1 when the add fails', async () => {
    const pending = apiWithPendingPost([cellarEntry({ quantity: 1 })], { hangRefetch: true })
    renderCard()

    await clickAddThenFail(pending)

    expect(await screen.findByText('In your cellar')).toBeInTheDocument()
    expect(screen.queryByText('In your cellar (×2)')).not.toBeInTheDocument()
  })

  it('shows a retry label on the button when the add fails', async () => {
    const pending = apiWithPendingPost([cellarEntry({ quantity: 1 })])
    renderCard()

    await clickAddThenFail(pending)

    expect(await screen.findByRole('button', { name: 'Failed — retry' })).toBeInTheDocument()
  })

  it('shows the in-cellar badge optimistically on the first add', async () => {
    const user = userEvent.setup()
    apiWithPendingPost([])
    renderCard()
    const button = await screen.findByRole('button', { name: 'Add to my cellar' })

    await user.click(button)

    expect(await screen.findByText('In your cellar')).toBeInTheDocument()
  })
})
