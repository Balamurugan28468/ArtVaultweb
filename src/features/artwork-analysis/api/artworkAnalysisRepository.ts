import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { ArtworkAnalysis, ArtworkAnalysisError } from '../types'

function isFirestoreErrorLike(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error
}

export function toArtworkAnalysisError(error: unknown): ArtworkAnalysisError {
  if (isFirestoreErrorLike(error)) {
    if (error.code === 'permission-denied') {
      return { code: 'permission-denied', message: 'You do not have permission to view this analysis.' }
    }
    if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
      return { code: 'network', message: 'Network unavailable. Check your connection and try again.' }
    }
  }
  return { code: 'unknown', message: 'Something went wrong. Please try again.' }
}

/** Defensive against a malformed/partial document — a client never assumes every field is present. */
export function mapToArtworkAnalysis(id: string, data: Record<string, unknown>): ArtworkAnalysis | null {
  if (typeof data.artworkId !== 'string') return null
  return {
    id,
    artworkId: data.artworkId,
    artisticScorePercent: typeof data.artisticScorePercent === 'number' ? data.artisticScorePercent : null,
    style: typeof data.style === 'string' ? data.style : null,
    styleMatchPercent: typeof data.styleMatchPercent === 'number' ? data.styleMatchPercent : null,
    colorPalette: typeof data.colorPalette === 'string' ? data.colorPalette : null,
    colorMatchPercent: typeof data.colorMatchPercent === 'number' ? data.colorMatchPercent : null,
    composition: typeof data.composition === 'string' ? data.composition : null,
    compositionMatchPercent: typeof data.compositionMatchPercent === 'number' ? data.compositionMatchPercent : null,
    emotion: typeof data.emotion === 'string' ? data.emotion : null,
    emotionMatchPercent: typeof data.emotionMatchPercent === 'number' ? data.emotionMatchPercent : null,
    description: typeof data.description === 'string' ? data.description : null,
    notableElements: Array.isArray(data.notableElements) ? data.notableElements.filter((el): el is string => typeof el === 'string') : [],
    createdAt: data.createdAt as ArtworkAnalysis['createdAt'],
    updatedAt: data.updatedAt as ArtworkAnalysis['updatedAt'],
  }
}

/**
 * One artwork's real analysis document, if one exists — `null` for every
 * artwork today, since no trusted AI gateway has ever written to
 * `artworkAnalyses` (see firestore.rules and this feature's own types.ts
 * header comment). That is the honest, correct result, not a bug.
 */
export async function getArtworkAnalysis(artworkId: string): Promise<ArtworkAnalysis | null> {
  try {
    const snapshot = await getDoc(doc(db, 'artworkAnalyses', artworkId))
    return snapshot.exists() ? mapToArtworkAnalysis(snapshot.id, snapshot.data()) : null
  } catch (error) {
    if (isFirestoreErrorLike(error) && error.code === 'permission-denied') return null
    throw toArtworkAnalysisError(error)
  }
}
