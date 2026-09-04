import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { subscribeSellerArtworks } from '../api/artworkRepository'
import type { ArtworkListState } from '../types'

export function useSellerArtworks(): ArtworkListState {
  const { status, user } = useAuth()
  const [state, setState] = useState<ArtworkListState>({ status: 'loading' })

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      setState({ status: 'loading' })
      return
    }

    setState({ status: 'loading' })
    const unsubscribe = subscribeSellerArtworks(
      user.uid,
      (artworks) => setState({ status: 'loaded', artworks }),
      (error) => setState({ status: 'error', error }),
    )

    return unsubscribe
  }, [status, user])

  return state
}
