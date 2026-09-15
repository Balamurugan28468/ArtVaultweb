import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const fetchTrendingArtworks = vi.fn()
vi.mock('@/features/marketplace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/marketplace')>()
  return { ...actual, fetchTrendingArtworks: () => fetchTrendingArtworks() }
})

const { useTrendingArtworks } = await import('./useTrendingArtworks')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useTrendingArtworks', () => {
  it('resolves to the real, unpersonalized trending list — no sign-in/activity required', async () => {
    fetchTrendingArtworks.mockResolvedValueOnce([{ id: 'a1' }])
    const { result } = renderHook(() => useTrendingArtworks(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toEqual([{ id: 'a1' }])
  })
})
