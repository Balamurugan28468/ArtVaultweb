import { useEffect, useState } from 'react'
import { getArtworkAnalysis, toArtworkAnalysisError } from '../api/artworkAnalysisRepository'
import { isArtworkAnalysisError, type ArtworkAnalysisState } from '../types'

/**
 * One-shot read of an artwork's real analysis document, if one exists.
 * `unavailable` (not `error`) is the expected, honest result for every
 * artwork today — see types.ts's own header comment on why.
 */
export function useArtworkAnalysis(artworkId: string | undefined): ArtworkAnalysisState {
  const [state, setState] = useState<ArtworkAnalysisState>({ status: 'loading' })

  useEffect(() => {
    if (!artworkId) {
      setState({ status: 'unavailable' })
      return
    }

    let active = true
    setState({ status: 'loading' })

    void (async () => {
      try {
        const analysis = await getArtworkAnalysis(artworkId)
        if (!active) return
        setState(analysis ? { status: 'loaded', analysis } : { status: 'unavailable' })
      } catch (error) {
        if (!active) return
        setState({ status: 'error', error: isArtworkAnalysisError(error) ? error : toArtworkAnalysisError(error) })
      }
    })()

    return () => {
      active = false
    }
  }, [artworkId])

  return state
}
