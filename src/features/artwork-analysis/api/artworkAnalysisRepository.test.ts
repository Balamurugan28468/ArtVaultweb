import { describe, expect, it, vi } from 'vitest'

const { doc, getDoc } = vi.hoisted(() => ({
  doc: vi.fn(() => ({ path: 'artworkAnalyses/a1' })),
  getDoc: vi.fn(),
}))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return { ...actual, doc, getDoc }
})
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

const { getArtworkAnalysis, mapToArtworkAnalysis, toArtworkAnalysisError } = await import('./artworkAnalysisRepository')

const BASE_DATA = {
  artworkId: 'a1',
  artisticScorePercent: 92,
  style: 'Post-Impressionism',
  notableElements: ['Dynamic brushwork', 'Vibrant color contrast'],
  createdAt: { toDate: () => new Date('2026-01-01') },
  updatedAt: { toDate: () => new Date('2026-01-01') },
}

describe('mapToArtworkAnalysis', () => {
  it('maps a well-formed document', () => {
    const analysis = mapToArtworkAnalysis('a1', BASE_DATA)
    expect(analysis).toMatchObject({ id: 'a1', artworkId: 'a1', artisticScorePercent: 92, style: 'Post-Impressionism' })
    expect(analysis?.notableElements).toEqual(['Dynamic brushwork', 'Vibrant color contrast'])
  })

  it('returns null for a document missing artworkId', () => {
    expect(mapToArtworkAnalysis('a1', { ...BASE_DATA, artworkId: undefined })).toBeNull()
  })

  it('never fabricates a score/style when absent — defaults to null, not a guessed value', () => {
    const analysis = mapToArtworkAnalysis('a1', { artworkId: 'a1' })
    expect(analysis?.artisticScorePercent).toBeNull()
    expect(analysis?.style).toBeNull()
    expect(analysis?.notableElements).toEqual([])
  })
})

describe('getArtworkAnalysis', () => {
  it('returns null when no analysis document exists — the honest, current-truth result for every artwork today', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => false })
    expect(await getArtworkAnalysis('a1')).toBeNull()
  })

  it('returns the real mapped analysis when one exists', async () => {
    getDoc.mockResolvedValueOnce({ exists: () => true, id: 'a1', data: () => BASE_DATA })
    const analysis = await getArtworkAnalysis('a1')
    expect(analysis?.id).toBe('a1')
  })

  it('collapses permission-denied into null rather than throwing', async () => {
    getDoc.mockRejectedValueOnce({ code: 'permission-denied' })
    expect(await getArtworkAnalysis('a1')).toBeNull()
  })

  it('rethrows a genuine network error as a typed ArtworkAnalysisError', async () => {
    getDoc.mockRejectedValueOnce({ code: 'unavailable' })
    await expect(getArtworkAnalysis('a1')).rejects.toEqual({
      code: 'network',
      message: 'Network unavailable. Check your connection and try again.',
    })
  })
})

describe('toArtworkAnalysisError', () => {
  it('falls back to unknown for an unrecognized error', () => {
    expect(toArtworkAnalysisError(new Error('boom'))).toEqual({ code: 'unknown', message: 'Something went wrong. Please try again.' })
  })
})
