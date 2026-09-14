import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const fetchAllAuctions = vi.fn()
vi.mock('../api/auctionsRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/auctionsRepository')>()
  return { ...actual, fetchAllAuctions: () => fetchAllAuctions() }
})

const { useAuctions } = await import('./useAuctions')

describe('useAuctions', () => {
  it('starts loading, then resolves to the real fetched list', async () => {
    fetchAllAuctions.mockResolvedValueOnce([{ id: 'a1' }])
    const { result } = renderHook(() => useAuctions())

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('loaded'))
    expect(result.current).toEqual({ status: 'loaded', auctions: [{ id: 'a1' }] })
  })

  it('resolves to an empty list rather than fabricating auctions when none exist', async () => {
    fetchAllAuctions.mockResolvedValueOnce([])
    const { result } = renderHook(() => useAuctions())
    await waitFor(() => expect(result.current.status).toBe('loaded'))
    expect(result.current).toEqual({ status: 'loaded', auctions: [] })
  })

  it('surfaces a real fetch failure as an error state', async () => {
    fetchAllAuctions.mockRejectedValueOnce({ code: 'unknown', message: 'boom' })
    const { result } = renderHook(() => useAuctions())
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
