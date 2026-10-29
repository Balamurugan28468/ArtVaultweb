import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const fetchMarketplacePage = vi.fn()
vi.mock('@/features/recommendations/api/recommendationRepository', () => ({
  getRecommendationPage: async (...args: unknown[]) => {
    const page = await fetchMarketplacePage(...args)
    return { items: page.artworks.map((artwork: { id: string }) => ({ artwork, reason: 'Similar category', score: 50 })), personalized: false }
  },
}))
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => ({ status: 'unauthenticated', user: null }) }))
vi.mock('@/features/wishlist/context/WishlistProvider', () => ({ useWishlist: () => ({ savedIds: new Set(), status: 'ready' }) }))

const { useRelatedArtworks } = await import('./useRelatedArtworks')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useRelatedArtworks', () => {
  it('does nothing (no fetch) when no category is given yet — e.g. the artwork is still loading', () => {
    const { result } = renderHook(() => useRelatedArtworks(undefined, undefined), { wrapper })
    expect(fetchMarketplacePage).not.toHaveBeenCalled()
    expect(result.current.artworks).toEqual([])
  })

  it('fetches other artworks in the same category', async () => {
    fetchMarketplacePage.mockResolvedValueOnce({
      artworks: [{ id: 'a2' }, { id: 'a3' }],
      nextCursor: null,
    })
    const { result } = renderHook(() => useRelatedArtworks('painting', 'a1'), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(fetchMarketplacePage).toHaveBeenCalledWith(
      'related', 'a1', undefined,
    )
    expect(result.current.artworks).toEqual([{ id: 'a2' }, { id: 'a3' }])
  })

  it('excludes the artwork being viewed from its own "more like this" results', async () => {
    fetchMarketplacePage.mockResolvedValueOnce({
      artworks: [{ id: 'a1' }, { id: 'a2' }],
      nextCursor: null,
    })
    const { result } = renderHook(() => useRelatedArtworks('painting', 'a1'), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.artworks).toEqual([{ id: 'a2' }])
  })

  it('caps the result at 4 artworks', async () => {
    fetchMarketplacePage.mockResolvedValueOnce({
      artworks: Array.from({ length: 8 }, (_, i) => ({ id: `a${i}` })),
      nextCursor: null,
    })
    const { result } = renderHook(() => useRelatedArtworks('painting', undefined), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.artworks).toHaveLength(4)
  })
})
