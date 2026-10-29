import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Artwork } from '@/features/artwork'

const useWishlistArtworks = vi.fn()
vi.mock('@/features/wishlist/context/WishlistProvider', () => ({ useWishlist: () => {
  const state = useWishlistArtworks()
  return { savedIds: new Set(state.artworks.map((a: Artwork) => a.id)), status: state.isLoading ? 'loading' : 'ready' }
} }))
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => ({ status: 'unauthenticated', user: null }) }))

const getRecommendationPage = vi.fn()
vi.mock('../api/recommendationRepository', () => ({ getRecommendationPage: (...args: unknown[]) => getRecommendationPage(...args) }))
function page(artworks: Artwork[], personalized = false) {
  return { items: artworks.map(artwork => ({ artwork, reason: 'Similar category', score: 50 })), personalized, nextCursor: undefined }
}

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
    getRecommendationPage.mockResolvedValueOnce(page([buildArtwork({ id: 'a2' })]))

    const { result } = renderHook(() => useForYouArtworks(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.personalized).toBe(false)
    expect(result.current.artworks).toEqual([expect.objectContaining({ id: 'a2' })])
  })

  it('uses the real Wishlist categories when the viewer has saved artworks, marked personalized', async () => {
    useWishlistArtworks.mockReturnValue({
      artworks: [buildArtwork({ id: '00000000-0000-4000-8000-000000000001', category: 'sculpture' })],
      unavailableCount: 0,
      isLoading: false,
    })
    getRecommendationPage.mockResolvedValueOnce(page([buildArtwork({ id: 'match-1', category: 'sculpture' })], true))

    const { result } = renderHook(() => useForYouArtworks(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.personalized).toBe(true)
    expect(getRecommendationPage).toHaveBeenLastCalledWith('for-you', '00000000-0000-4000-8000-000000000001', undefined)
  })

  it('never re-recommends an artwork already in the viewer\'s Wishlist', async () => {
    useWishlistArtworks.mockReturnValue({
      artworks: [buildArtwork({ id: 'wish-1', category: 'sculpture' })],
      unavailableCount: 0,
      isLoading: false,
    })
    getRecommendationPage.mockResolvedValueOnce(page([buildArtwork({ id: 'wish-1', category: 'sculpture' }), buildArtwork({ id: 'match-2', category: 'sculpture' })], true))

    const { result } = renderHook(() => useForYouArtworks(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.artworks.map((a) => a.id)).toEqual(['match-2'])
  })
})

describe('useSimilarArtworks', () => {
  it('uses an honestly unpersonalized public discovery fallback without Wishlist activity', async () => {
    useWishlistArtworks.mockReturnValue({ artworks: [], unavailableCount: 0, isLoading: false })
    getRecommendationPage.mockResolvedValueOnce(page([]))
    const { result } = renderHook(() => useSimilarArtworks(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.artworks).toEqual([])
    expect(result.current.personalized).toBe(false)
    expect(result.current.anchorCategory).toBeNull()
  })

  it('anchors on the real category of the first Wishlist item', async () => {
    useWishlistArtworks.mockReturnValue({
      artworks: [buildArtwork({ id: '00000000-0000-4000-8000-000000000001', category: 'digital' })],
      unavailableCount: 0,
      isLoading: false,
    })
    getRecommendationPage.mockResolvedValueOnce(page([buildArtwork({ id: 'match-1', category: 'digital' })], true))

    const { result } = renderHook(() => useSimilarArtworks(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.artworks[0]?.category).toBe('digital')
    expect(getRecommendationPage).toHaveBeenLastCalledWith('related', '00000000-0000-4000-8000-000000000001', undefined)
  })
})
