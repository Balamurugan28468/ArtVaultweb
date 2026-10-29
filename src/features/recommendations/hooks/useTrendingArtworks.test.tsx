import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const getRecommendationPage = vi.fn()
vi.mock('../api/recommendationRepository', () => ({ getRecommendationPage: (...args: unknown[]) => getRecommendationPage(...args) }))
vi.mock('@/app/providers/AuthProvider', () => ({ useAuth: () => ({ status: 'unauthenticated', user: null }) }))
vi.mock('@/features/wishlist/context/WishlistProvider', () => ({ useWishlist: () => ({ savedIds: new Set(), status: 'ready' }) }))

const { useTrendingArtworks } = await import('./useTrendingArtworks')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useTrendingArtworks', () => {
  it('resolves to the real, unpersonalized trending list — no sign-in/activity required', async () => {
    getRecommendationPage.mockResolvedValueOnce({ items: [{ artwork: { id: 'a1' }, reason: 'Real marketplace engagement', score: 60 }], personalized: false })
    const { result } = renderHook(() => useTrendingArtworks(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toEqual([{ id: 'a1' }])
    expect(getRecommendationPage).toHaveBeenCalledWith('trending', undefined, undefined)
  })
})
