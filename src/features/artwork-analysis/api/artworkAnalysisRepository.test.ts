import { describe, expect, it, vi } from 'vitest'

const { createClient, result } = vi.hoisted(() => {
  const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.maybeSingle.mockReturnValue(builder)
  return {
    createClient: vi.fn(() => ({ from: vi.fn(() => builder) })),
    result: vi.fn(),
  }
})

vi.mock('@/lib/supabase/client', () => ({ createClient }))
vi.mock('@/lib/supabase/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase/data')>()),
  result,
}))

const { getArtworkAnalysis, mapToArtworkAnalysis, toArtworkAnalysisError } = await import('./artworkAnalysisRepository')

const BASE_DATA = {
  artwork_id: 'a1',
  artistic_score_percent: 92,
  style: 'Post-Impressionism',
  notable_elements: ['Dynamic brushwork', 'Vibrant color contrast'],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('mapToArtworkAnalysis', () => {
  it('identifies heuristic analysis without fabricating visual scores',()=>{
    expect(mapToArtworkAnalysis('a1',{artwork_id:'a1',analysis_method:'HEURISTIC'})).toMatchObject({analysisMethod:'HEURISTIC',artisticScorePercent:null,style:null,composition:null})
  })
  it('maps a well-formed document', () => {
    const analysis = mapToArtworkAnalysis('a1', BASE_DATA)
    expect(analysis).toMatchObject({ id: 'a1', artworkId: 'a1', artisticScorePercent: 92, style: 'Post-Impressionism' })
    expect(analysis?.notableElements).toEqual(['Dynamic brushwork', 'Vibrant color contrast'])
  })

  it('returns null for a document missing artworkId', () => {
    expect(mapToArtworkAnalysis('a1', { ...BASE_DATA, artwork_id: undefined })).toBeNull()
  })

  it('never fabricates a score/style when absent — defaults to null, not a guessed value', () => {
    const analysis = mapToArtworkAnalysis('a1', { artwork_id: 'a1' })
    expect(analysis?.artisticScorePercent).toBeNull()
    expect(analysis?.style).toBeNull()
    expect(analysis?.notableElements).toEqual([])
  })
})

describe('getArtworkAnalysis', () => {
  it('returns null when no analysis document exists — the honest, current-truth result for every artwork today', async () => {
    result.mockResolvedValueOnce(null)
    expect(await getArtworkAnalysis('a1')).toBeNull()
  })

  it('returns the real mapped analysis when one exists', async () => {
    result.mockResolvedValueOnce({ id: 'a1', ...BASE_DATA })
    const analysis = await getArtworkAnalysis('a1')
    expect(analysis?.id).toBe('a1')
  })

  it('collapses permission-denied into null rather than throwing', async () => {
    result.mockRejectedValueOnce({ code: 'permission-denied' })
    expect(await getArtworkAnalysis('a1')).toBeNull()
  })

  it('rethrows a genuine network error as a typed ArtworkAnalysisError', async () => {
    result.mockRejectedValueOnce(new TypeError('offline'))
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
