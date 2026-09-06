import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { MarketplaceFilters } from '../types'

const fetchMarketplacePage = vi.fn()
vi.mock('../api/marketplaceRepository', () => ({
  fetchMarketplacePage: (...args: unknown[]) => fetchMarketplacePage(...args),
}))

const { useMarketplaceArtworks } = await import('./useMarketplaceArtworks')

const FILTERS: MarketplaceFilters = { category: null, minPrice: null, maxPrice: null, sort: 'newest' }

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useMarketplaceArtworks', () => {
  it('fetches the first page with a null cursor', async () => {
    fetchMarketplacePage.mockResolvedValueOnce({ artworks: [{ id: 'a1' }], nextCursor: null })
    const { result } = renderHook(() => useMarketplaceArtworks(FILTERS), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchMarketplacePage).toHaveBeenCalledWith(FILTERS, null)
    expect(result.current.data?.pages[0].artworks).toEqual([{ id: 'a1' }])
  })

  it('fetches the next page using the previous page’s cursor', async () => {
    fetchMarketplacePage
      .mockResolvedValueOnce({ artworks: [{ id: 'a1' }], nextCursor: { primary: 1, id: 'a1' } })
      .mockResolvedValueOnce({ artworks: [{ id: 'a2' }], nextCursor: null })
    const { result } = renderHook(() => useMarketplaceArtworks(FILTERS), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.hasNextPage).toBe(true)

    await result.current.fetchNextPage()

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(fetchMarketplacePage).toHaveBeenLastCalledWith(FILTERS, { primary: 1, id: 'a1' })
    expect(result.current.hasNextPage).toBe(false)
  })

  it('reports an error status when the repository rejects', async () => {
    fetchMarketplacePage.mockRejectedValueOnce({ code: 'unknown', message: 'boom' })
    const { result } = renderHook(() => useMarketplaceArtworks(FILTERS), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
