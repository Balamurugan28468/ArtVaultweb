import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const fetchCategoryArtworkCounts = vi.fn()
vi.mock('../api/marketplaceRepository', () => ({
  fetchCategoryArtworkCounts: (...args: unknown[]) => fetchCategoryArtworkCounts(...args),
}))

const { useCategoryArtworkCounts } = await import('./useCategoryArtworkCounts')

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useCategoryArtworkCounts', () => {
  it('resolves to the real counts the repository returns', async () => {
    fetchCategoryArtworkCounts.mockResolvedValueOnce({
      total: 3,
      byCategory: { painting: 2, sculpture: 1, photography: 0, digital: 0, other: 0 },
    })
    const { result } = renderHook(() => useCategoryArtworkCounts(), { wrapper })

    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toEqual({ total: 3, byCategory: { painting: 2, sculpture: 1, photography: 0, digital: 0, other: 0 } })
  })

  it('reports an error status when the repository rejects, never a fabricated fallback count', async () => {
    fetchCategoryArtworkCounts.mockRejectedValueOnce({ code: 'unknown', message: 'boom' })
    const { result } = renderHook(() => useCategoryArtworkCounts(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
