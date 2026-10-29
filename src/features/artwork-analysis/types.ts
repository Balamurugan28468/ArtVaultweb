import type { Timestamp } from '@/lib/supabase/timestamp'

/** RLS-protected public analysis fields. Heuristic metadata findings never
 * populate unsupported visual scores, style, composition or authenticity.
 */
export interface ArtworkAnalysis {
  analysisMethod?: 'LEGACY' | 'HEURISTIC' | 'VISION'
  id: string
  artworkId: string
  artisticScorePercent: number | null
  style: string | null
  styleMatchPercent: number | null
  colorPalette: string | null
  colorMatchPercent: number | null
  composition: string | null
  compositionMatchPercent: number | null
  emotion: string | null
  emotionMatchPercent: number | null
  description: string | null
  notableElements: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type ArtworkAnalysisErrorCode = 'permission-denied' | 'network' | 'unknown'

export interface ArtworkAnalysisError {
  code: ArtworkAnalysisErrorCode
  message: string
}

export function isArtworkAnalysisError(value: unknown): value is ArtworkAnalysisError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value
}

export type ArtworkAnalysisState =
  | { status: 'loading' }
  // The honest, current-truth state for every real artwork today — no AI
  // gateway has ever written a document here (see this file's own header
  // comment). Never treated as an error: it's the expected result.
  | { status: 'unavailable' }
  | { status: 'loaded'; analysis: ArtworkAnalysis }
  | { status: 'error'; error: ArtworkAnalysisError }
