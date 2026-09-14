import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const getAuction = vi.fn()
vi.mock('../api/auctionsRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/auctionsRepository')>()
  return { ...actual, getAuction: (id: string) => getAuction(id) }
})

const getPublicArtwork = vi.fn()
vi.mock('@/features/artwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/artwork')>()
  return { ...actual, getPublicArtwork: (id: string) => getPublicArtwork(id) }
})

const { useAuction } = await import('./useAuction')

describe('useAuction', () => {
  it('is missing when no auctionId is given', () => {
    const { result } = renderHook(() => useAuction(undefined))
    expect(result.current).toEqual({ status: 'missing' })
  })

  it('is missing when the auction genuinely does not exist — never a fabricated auction', async () => {
    getAuction.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useAuction('a1'))
    await waitFor(() => expect(result.current.status).toBe('missing'))
  })

  it('loads the real auction plus its linked artwork', async () => {
    getAuction.mockResolvedValueOnce({ id: 'a1', artworkId: 'artwork-1' })
    getPublicArtwork.mockResolvedValueOnce({ id: 'artwork-1', title: 'Starry Reflections' })
    const { result } = renderHook(() => useAuction('a1'))

    await waitFor(() => expect(result.current.status).toBe('loaded'))
    expect(result.current).toEqual({
      status: 'loaded',
      auction: { id: 'a1', artworkId: 'artwork-1' },
      artwork: { id: 'artwork-1', title: 'Starry Reflections' },
    })
  })

  it('still loads the auction when the linked artwork is unavailable, rather than hiding the whole auction', async () => {
    getAuction.mockResolvedValueOnce({ id: 'a1', artworkId: 'artwork-1' })
    getPublicArtwork.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useAuction('a1'))

    await waitFor(() => expect(result.current.status).toBe('loaded'))
    expect(result.current).toMatchObject({ status: 'loaded', artwork: null })
  })
})
