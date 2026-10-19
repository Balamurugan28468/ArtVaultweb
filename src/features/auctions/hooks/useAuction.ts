import { useCallback, useEffect, useState } from 'react'
import { getPublicArtwork } from '@/features/artwork'
import { createClient } from '@/lib/supabase/client'
import { getAuction, toAuctionError } from '../api/auctionsRepository'
import { isAuctionError, type AuctionDetailState } from '../types'

/**
 * Loads an auction and its artwork, supporting reload and Supabase Realtime subscriptions.
 */
export function useAuction(auctionId: string | undefined): AuctionDetailState & { reload: () => Promise<void> } {
  const [state, setState] = useState<AuctionDetailState>({ status: 'loading' })

  const load = useCallback(async () => {
    if (!auctionId) {
      setState({ status: 'missing' })
      return
    }

    try {
      const auction = await getAuction(auctionId)
      if (!auction) {
        setState({ status: 'missing' })
        return
      }
      const artwork = await getPublicArtwork(auction.artworkId)
      setState({ status: 'loaded', auction, artwork })
    } catch (error) {
      setState({ status: 'error', error: isAuctionError(error) ? error : toAuctionError(error) })
    }
  }, [auctionId])

  useEffect(() => {
    setState({ status: 'loading' })
    void load()

    if (!auctionId) return
    let client: ReturnType<typeof createClient> | null = null
    try {
      client = createClient()
      const channel = client
        .channel(`auction-live-${auctionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bids' },
          () => {
            void load()
          }
        )
        .subscribe()

      return () => {
        if (client && channel) {
          void client.removeChannel(channel)
        }
      }
    } catch {
      // In test or non-browser environments, Realtime can be unavailable
    }
  }, [auctionId, load])

  const result = { ...state }
  Object.defineProperty(result, 'reload', {
    value: load,
    writable: true,
    configurable: true,
    enumerable: false,
  })

  return result as AuctionDetailState & { reload: () => Promise<void> }
}
