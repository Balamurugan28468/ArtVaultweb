import type { Timestamp } from 'firebase/firestore'

/**
 * UI-05 — AI Artwork Analysis. Matches the `analyzeArtwork` return shape
 * docs/AI_ARCHITECTURE.md's provider-agnostic `AIProvider` interface
 * implies, stored (once a real trusted AI gateway exists) at
 * `artworkAnalyses/{artworkId}` — see firestore.rules for why that
 * collection is already real (public read, write always false) even
 * though nothing populates it yet. Every field is optional/nullable
 * because a real analysis document, once one exists, may not fill in
 * every dimension — this type never assumes a complete result.
 */
export interface ArtworkAnalysis {
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
