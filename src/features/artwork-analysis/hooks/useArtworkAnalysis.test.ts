import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const getArtworkAnalysis = vi.fn()
vi.mock('../api/artworkAnalysisRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/artworkAnalysisRepository')>()
  return { ...actual, getArtworkAnalysis: (id: string) => getArtworkAnalysis(id) }
})

const { useArtworkAnalysis } = await import('./useArtworkAnalysis')

describe('useArtworkAnalysis', () => {
  it('is unavailable when no artworkId is given', () => {
    const { result } = renderHook(() => useArtworkAnalysis(undefined))
    expect(result.current).toEqual({ status: 'unavailable' })
  })

  it('is unavailable when no real analysis document exists — never fabricates one', async () => {
    getArtworkAnalysis.mockResolvedValueOnce(null)
    const { result } = renderHook(() => useArtworkAnalysis('a1'))
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
  })

  it('loads the real analysis when one exists', async () => {
    getArtworkAnalysis.mockResolvedValueOnce({ id: 'a1', artworkId: 'a1' })
    const { result } = renderHook(() => useArtworkAnalysis('a1'))
    await waitFor(() => expect(result.current.status).toBe('loaded'))
  })

  it('surfaces a real fetch failure as an error state', async () => {
    getArtworkAnalysis.mockRejectedValueOnce({ code: 'unknown', message: 'boom' })
    const { result } = renderHook(() => useArtworkAnalysis('a1'))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
})
