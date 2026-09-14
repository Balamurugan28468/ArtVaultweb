import { useEffect, useState } from 'react'
import { fetchAllAuctions, toAuctionError } from '../api/auctionsRepository'
import { isAuctionError, type AuctionListState } from '../types'

/** One-shot fetch of every auction — see fetchAllAuctions for why this is a single small read, not a listener or paginated query. Callers bucket the result into Upcoming/Live/Past themselves via deriveAuctionStatus. */
export function useAuctions(): AuctionListState {
  const [state, setState] = useState<AuctionListState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })

    void (async () => {
      try {
        const auctions = await fetchAllAuctions()
        if (!active) return
        setState({ status: 'loaded', auctions })
      } catch (error) {
        if (!active) return
        setState({ status: 'error', error: isAuctionError(error) ? error : toAuctionError(error) })
      }
    })()

    return () => {
      active = false
    }
  }, [])

  return state
}
