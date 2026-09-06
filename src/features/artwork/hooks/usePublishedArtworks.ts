import { useEffect, useState } from 'react'
import { subscribePublishedArtworks } from '../api/artworkRepository'
import type { ArtworkListState } from '../types'

/**
 * A seller's real, publicly-visible catalog — for the public artist page
 * (Module 06/07), never Seller Studio (which uses useSellerArtworks to see
 * everything regardless of status). Public — works whether or not anyone is
 * signed in. `sellerId` is `undefined` when a route param hasn't resolved
 * yet — always returns `loaded` with an empty list without subscribing,
 * matching useArtwork.ts's precedent for the same situation.
 */
export function usePublishedArtworks(sellerId: string | undefined): ArtworkListState {
  const [state, setState] = useState<ArtworkListState>({ status: 'loading' })

  useEffect(() => {
    if (!sellerId) {
      setState({ status: 'loaded', artworks: [] })
      return
    }

    setState({ status: 'loading' })
    const unsubscribe = subscribePublishedArtworks(
      sellerId,
      (artworks) => setState({ status: 'loaded', artworks }),
      (error) => setState({ status: 'error', error }),
    )

    return unsubscribe
  }, [sellerId])

  return state
}
