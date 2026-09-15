import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const useWishlistArtworks = vi.fn()
vi.mock('@/features/wishlist', () => ({ useWishlistArtworks: () => useWishlistArtworks() }))

const fetchMarketplacePage = vi.fn()
vi.mock('@/features/marketplace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/marketplace')>()
  return { ...actual, fetchMarketplacePage: (...args: unknown[]) => fetchMarketplacePage(...args) }
})

const { useForYouArtworks, useSimilarArtworks } = await import('./useForYouArtworks')

function buildArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'a1',
    sellerId: 's1',
    title: 'Artwork',
    description: 'd',
    price: 1000,
    category: 'painting',
    tags: [],
    images: [],
    inventoryCount: 1,
    status: 'PUBLISHED',
    reviewedAt: null,
    rejectionReason: null,
    likeCount: 0,
    createdAt: { toMillis: () => 1000, toDate: () => new Date(1000) } as never,
    updatedAt: { toMillis: () => 1000, toDate: () => new Date(1000) } as never,
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useForYouArtworks', () => {
  it('falls back to newest-overall, honestly marked not personalized, when the viewer has no real Wishlist activity', async () => {
    useWishlistArtworks.mockReturnValue({ artworks: [], unavailableCount: 0, isLoading: false })
    fetchMarketplacePage.mockResolvedValueOnce({ artworks: [buildArtwork({ id: 'a2' })], nextCursor: null })

    const { result } = renderHook(() => useForYouArtworks(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.personalized).toBe(false)
    expect(result.current.artworks).toEqual([expect.objectContaining({ id: 'a2' })])
  })

  it('uses the real Wishlist categories when the viewer has saved artworks, marked personalized', async () => {
    useWishlistArtworks.mockReturnValue({
      artworks: [buildArtwork({ id: 'wish-1', category: 'sculpture' })],
      unavailableCount: 0,
      isLoading: false,
    })
    fetchMarketplacePage.mockResolvedValueOnce({ artworks: [buildArtwork({ id: 'match-1', category: 'sculpture' })], nextCursor: null })

    const { result } = renderHook(() => useForYouArtworks(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.personalized).toBe(true)
    expect(fetchMarketplacePage).toHaveBeenCalledWith(expect.objectContaining({ category: 'sculpture' }), null)
  })

  it('never re-recommends an artwork already in the viewer\'s Wishlist', async () => {
    useWishlistArtworks.mockReturnValue({
      artworks: [buildArtwork({ id: 'wish-1', category: 'sculpture' })],
      unavailableCount: 0,
      isLoading: false,
    })
    fetchMarketplacePage.mockResolvedValueOnce({
      artworks: [buildArtwork({ id: 'wish-1', category: 'sculpture' }), buildArtwork({ id: 'match-2', category: 'sculpture' })],
      nextCursor: null,
    })

    const { result } = renderHook(() => useForYouArtworks(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.artworks.map((a) => a.id)).toEqual(['match-2'])
  })
})

describe('useSimilarArtworks', () => {
  it('is genuinely empty (not a fabricated fallback) when there is no real Wishlist activity to anchor on', () => {
    useWishlistArtworks.mockReturnValue({ artworks: [], unavailableCount: 0, isLoading: false })
    const { result } = renderHook(() => useSimilarArtworks(), { wrapper })
    expect(result.current).toEqual({ status: 'success', artworks: [], anchorCategory: null })
  })

  it('anchors on the real category of the first Wishlist item', async () => {
    useWishlistArtworks.mockReturnValue({
      artworks: [buildArtwork({ id: 'wish-1', category: 'digital' })],
      unavailableCount: 0,
      isLoading: false,
    })
    fetchMarketplacePage.mockResolvedValueOnce({ artworks: [buildArtwork({ id: 'match-1', category: 'digital' })], nextCursor: null })

    const { result } = renderHook(() => useSimilarArtworks(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.anchorCategory).toBe('digital')
  })
})
