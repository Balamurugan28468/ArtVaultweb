import { useEffect, useState } from 'react'
import { getPublicArtwork } from '@/features/artwork'
import { getAuction, toAuctionError } from '../api/auctionsRepository'
import { isAuctionError, type AuctionDetailState } from '../types'

/**
 * One auction plus its linked artwork (title/images/artist — the "seller
 * artwork auction-status display" requirement), one-shot like useOrder.
 * `permission-denied` on the auction read collapses to 'missing' exactly
 * like useOrder/usePublicArtwork do — a guessed/forged id must stay
 * indistinguishable from one that never existed. The artwork join uses
 * `getPublicArtwork` (real network errors surface, only permission-denied
 * collapses to null) — a real, currently-unreachable artwork on an
 * otherwise-loaded auction shows as "artwork unavailable" rather than
 * silently hiding the whole auction.
 */
export function useAuction(auctionId: string | undefined): AuctionDetailState {
  const [state, setState] = useState<AuctionDetailState>({ status: 'loading' })

  useEffect(() => {
    if (!auctionId) {
      setState({ status: 'missing' })
      return
    }

    let active = true
    setState({ status: 'loading' })

    void (async () => {
      try {
        const auction = await getAuction(auctionId)
        if (!active) return
        if (!auction) {
          setState({ status: 'missing' })
          return
        }
        const artwork = await getPublicArtwork(auction.artworkId)
        if (!active) return
        setState({ status: 'loaded', auction, artwork })
      } catch (error) {
        if (!active) return
        setState({ status: 'error', error: isAuctionError(error) ? error : toAuctionError(error) })
      }
    })()

    return () => {
      active = false
    }
  }, [auctionId])

  return state
}
