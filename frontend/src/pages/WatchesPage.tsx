import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApiClient, ApiError } from '@/lib/api'
import type { WatchWithProduct } from '@/lib/types'
import { Button } from '@/components/ui/button'

function WatchesPage() {
  const { user } = useAuth()
  const apiClient = useApiClient()

  const [watches, setWatches] = useState<WatchWithProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const userId = `tg:${user?.telegram_id}`

  useEffect(() => {
    let cancelled = false

    async function fetchWatches() {
      try {
        const data = await apiClient<WatchWithProduct[]>(
          `/watches?user_id=${encodeURIComponent(userId)}`
        )
        if (!cancelled) {
          setWatches(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.detail : 'Failed to load watches')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchWatches()

    return () => {
      cancelled = true
    }
  }, [userId, apiClient])

  const handleRemove = useCallback(
    async (sku: string) => {
      setRemoving(sku)
      try {
        await apiClient(`/watches/${sku}?user_id=${encodeURIComponent(userId)}`, {
          method: 'DELETE',
        })
        // Remove from local state — no need to re-fetch the full list
        setWatches((prev) => prev.filter((w) => w.watch.sku !== sku))
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : 'Failed to remove watch')
      } finally {
        setRemoving(null)
      }
    },
    [apiClient, userId]
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground font-mono">Loading watches...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-mono font-bold mb-6">My Watches</h1>

        {error && (
          <p className="text-destructive text-sm font-mono mb-4">{error}</p>
        )}

        {watches.length === 0 ? (
          <p className="text-muted-foreground font-mono">
            No watches yet. Use the Telegram bot to add wines to your watch list.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {watches.map(({ watch, product }) => (
              <li
                key={watch.sku}
                className="border border-border p-4 flex justify-between items-start gap-4"
              >
                <div className="flex-1 min-w-0">
                  {product ? (
                    <>
                      <p className="font-mono font-bold truncate">
                        {product.name}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                        {product.price && <span>${product.price}</span>}
                        {product.country && <span>{product.country}</span>}
                        {product.vintage && <span>{product.vintage}</span>}
                        {product.grape && <span>{product.grape}</span>}
                      </div>
                      {product.online_availability !== null && (
                        <p className="text-sm mt-1">
                          {product.online_availability ? (
                            <span className="text-green-500">Available online</span>
                          ) : (
                            <span className="text-muted-foreground">
                              Not available online
                            </span>
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-muted-foreground font-mono">
                      Product delisted (SKU: {watch.sku})
                    </p>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemove(watch.sku)}
                  disabled={removing === watch.sku}
                >
                  {removing === watch.sku ? 'Removing...' : 'Remove'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default WatchesPage
