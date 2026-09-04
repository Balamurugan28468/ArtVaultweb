import { useEffect, useState } from 'react'
import { subscribeArtwork } from '../api/artworkRepository'
import type { ArtworkState } from '../types'

/** `id` is `undefined` in the create-form's route — always returns `missing` without subscribing. */
export function useArtwork(id: string | undefined): ArtworkState {
  const [state, setState] = useState<ArtworkState>({ status: 'loading' })

  useEffect(() => {
    if (!id) {
      setState({ status: 'missing' })
      return
    }

    setState({ status: 'loading' })
    const unsubscribe = subscribeArtwork(
      id,
      (artwork) => setState(artwork ? { status: 'loaded', artwork } : { status: 'missing' }),
      (error) => setState({ status: 'error', error }),
    )

    return unsubscribe
  }, [id])

  return state
}
