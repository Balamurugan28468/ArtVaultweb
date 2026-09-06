import { useEffect, useState } from 'react'
import { subscribeArtistProfile } from '../api/artistProfileRepository'
import type { ArtistProfileState } from '../types'

/**
 * Public — works whether or not anyone is signed in (see firestore.rules).
 * `uid` is `undefined` when a route param hasn't resolved yet — always
 * returns `missing` without subscribing, matching useArtwork.ts's precedent
 * for the same situation.
 */
export function useArtistProfile(uid: string | undefined): ArtistProfileState {
  const [state, setState] = useState<ArtistProfileState>({ status: 'loading' })

  useEffect(() => {
    if (!uid) {
      setState({ status: 'missing' })
      return
    }

    setState({ status: 'loading' })
    const unsubscribe = subscribeArtistProfile(
      uid,
      (profile) => setState(profile ? { status: 'loaded', profile } : { status: 'missing' }),
      (error) => setState({ status: 'error', error }),
    )

    return unsubscribe
  }, [uid])

  return state
}
