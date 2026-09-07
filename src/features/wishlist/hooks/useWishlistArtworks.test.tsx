import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useWishlist = vi.fn()
vi.mock('../context/WishlistProvider', () => ({ useWishlist: () => useWishlist() }))

const getArtwork = vi.fn()
vi.mock('@/features/artwork', () => ({ getArtwork: (...args: unknown[]) => getArtwork(...args) }))

beforeEach(() => {
  getArtwork.mockReset()
})

const { useWishlistArtworks } = await import('./useWishlistArtworks')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useWishlistArtworks', () => {
  it('resolves each saved id to its current artwork data', async () => {
    useWishlist.mockReturnValue({ savedIds: new Set(['a1', 'a2']), status: 'ready' })
    getArtwork.mockImplementation((id: string) => Promise.resolve({ id, title: `Artwork ${id}` }))

    const { result } = renderHook(() => useWishlistArtworks(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.artworks.map((a) => a.id).sort()).toEqual(['a1', 'a2'])
    expect(result.current.unavailableCount).toBe(0)
  })

  it('excludes an id whose artwork no longer resolves (deleted or unpublished) and counts it', async () => {
    useWishlist.mockReturnValue({ savedIds: new Set(['a1', 'gone']), status: 'ready' })
    getArtwork.mockImplementation((id: string) => Promise.resolve(id === 'gone' ? null : { id, title: 'Still here' }))

    const { result } = renderHook(() => useWishlistArtworks(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.artworks.map((a) => a.id)).toEqual(['a1'])
    expect(result.current.unavailableCount).toBe(1)
  })

  it('returns an empty result for an empty wishlist, without calling getArtwork', () => {
    useWishlist.mockReturnValue({ savedIds: new Set(), status: 'ready' })
    const { result } = renderHook(() => useWishlistArtworks(), { wrapper })
    expect(result.current.artworks).toEqual([])
    expect(getArtwork).not.toHaveBeenCalled()
  })

  it('reports isLoading while the underlying wishlist itself is still loading', () => {
    useWishlist.mockReturnValue({ savedIds: new Set(), status: 'loading' })
    const { result } = renderHook(() => useWishlistArtworks(), { wrapper })
    expect(result.current.isLoading).toBe(true)
  })
})
