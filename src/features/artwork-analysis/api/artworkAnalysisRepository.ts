import { createClient } from '@/lib/supabase/client'
import { dataError, result } from '@/lib/supabase/data'
import { Timestamp, timestamp } from '@/lib/supabase/timestamp'
import type { ArtworkAnalysis } from '../types'

export const toArtworkAnalysisError = dataError

/** Defensive against a malformed/partial document — a client never assumes every field is present. */
export function mapToArtworkAnalysis(id: string, data: Record<string, unknown>): ArtworkAnalysis | null {
  const artworkId = typeof data.artwork_id === 'string' ? data.artwork_id : data.artworkId
  if (typeof artworkId !== 'string') return null
  const notableElements = data.notable_elements ?? data.notableElements
  return {
    analysisMethod: data.analysis_method === 'HEURISTIC' ? 'HEURISTIC' : data.analysis_method === 'VISION' ? 'VISION' : 'LEGACY',
    id,
    artworkId,
    artisticScorePercent: typeof (data.artistic_score_percent ?? data.artisticScorePercent) === 'number' ? Number(data.artistic_score_percent ?? data.artisticScorePercent) : null,
    style: typeof data.style === 'string' ? data.style : null,
    styleMatchPercent: typeof (data.style_match_percent ?? data.styleMatchPercent) === 'number' ? Number(data.style_match_percent ?? data.styleMatchPercent) : null,
    colorPalette: typeof data.color_palette === 'string' ? data.color_palette : typeof data.colorPalette === 'string' ? data.colorPalette : null,
    colorMatchPercent: typeof (data.color_match_percent ?? data.colorMatchPercent) === 'number' ? Number(data.color_match_percent ?? data.colorMatchPercent) : null,
    composition: typeof data.composition === 'string' ? data.composition : null,
    compositionMatchPercent: typeof (data.composition_match_percent ?? data.compositionMatchPercent) === 'number' ? Number(data.composition_match_percent ?? data.compositionMatchPercent) : null,
    emotion: typeof data.emotion === 'string' ? data.emotion : null,
    emotionMatchPercent: typeof (data.emotion_match_percent ?? data.emotionMatchPercent) === 'number' ? Number(data.emotion_match_percent ?? data.emotionMatchPercent) : null,
    description: typeof data.description === 'string' ? data.description : null,
    notableElements: Array.isArray(notableElements) ? notableElements.filter((element): element is string => typeof element === 'string') : [],
    createdAt: typeof data.created_at === 'string' ? timestamp(data.created_at) : data.createdAt instanceof Timestamp ? data.createdAt : Timestamp.now(),
    updatedAt: typeof data.updated_at === 'string' ? timestamp(data.updated_at) : data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.now(),
  }
}

/** One RLS-protected analysis, or null when no supported result exists. */
export async function getArtworkAnalysis(artworkId: string): Promise<ArtworkAnalysis | null> {
  try {
    const row = await result(createClient().from('artwork_analyses').select('*').eq('artwork_id', artworkId).maybeSingle())
    return row ? mapToArtworkAnalysis(row.id, row) : null
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && String(error.code) === 'permission-denied') return null
    throw toArtworkAnalysisError(error)
  }
}
