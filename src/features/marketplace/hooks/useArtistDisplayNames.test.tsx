import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getArtistDisplayName = vi.fn()
vi.mock('@/features/artist-profile', () => ({
  getArtistDisplayName: (...args: unknown[]) => getArtistDisplayName(...args),
}))

beforeEach(() => {
  getArtistDisplayName.mockClear()
})

const { useArtistDisplayNames } = await import('./useArtistDisplayNames')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useArtistDisplayNames', () => {
  it('resolves a display name per distinct sellerId', async () => {
    getArtistDisplayName.mockImplementation((id: string) => Promise.resolve(id === 'alice' ? 'Alice Fine Art' : null))
    const { result } = renderHook(() => useArtistDisplayNames(['alice', 'bob']), { wrapper })

    await waitFor(() => expect(result.current).toEqual({ alice: 'Alice Fine Art', bob: null }))
  })

  it('only fetches each distinct sellerId once, even with duplicates', async () => {
    getArtistDisplayName.mockResolvedValue('Alice Fine Art')
    renderHook(() => useArtistDisplayNames(['alice', 'alice', 'alice']), { wrapper })

    await waitFor(() => expect(getArtistDisplayName).toHaveBeenCalledTimes(1))
  })

  it('returns an empty map for no sellerIds', () => {
    const { result } = renderHook(() => useArtistDisplayNames([]), { wrapper })
    expect(result.current).toEqual({})
  })
})
