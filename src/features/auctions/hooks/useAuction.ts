import { useCallback, useEffect, useRef, useState } from 'react'
import { getPublicArtwork } from '@/features/artwork'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/app/providers/AuthProvider'
import { getAuction, toAuctionError } from '../api/auctionsRepository'
import { isAuctionError, type AuctionDetailState } from '../types'

/**
 * Loads an auction and its artwork, supporting reload and Supabase Realtime subscriptions.
 */
export function useAuction(auctionId: string | undefined,auctionItemId?:string): AuctionDetailState & { reload: () => Promise<void> } {
  const { user } = useAuth()
  const viewerId = user?.uid ?? null
  const [state, setState] = useState<AuctionDetailState>({ status: 'loading' })
  const active = useRef(false)
  const request = useRef(0)

  const load = useCallback(async () => {
    const version = ++request.current
    if (!auctionId) {
      setState({ status: 'missing' })
      return
    }

    try {
      const auction = await getAuction(auctionId,auctionItemId)
      if (!active.current || version !== request.current) return
      if (!auction) {
        setState({ status: 'missing' })
        return
      }
      const artwork = await getPublicArtwork(auction.artworkId)
      if (!active.current || version !== request.current) return
      setState({ status: 'loaded', auction, artwork })
    } catch (error) {
      if (!active.current || version !== request.current) return
      setState({ status: 'error', error: isAuctionError(error) ? error : toAuctionError(error) })
    }
  }, [auctionId,auctionItemId])

  useEffect(() => {
    let current = true
    active.current = true
    setState({ status: 'loading' })
    void load()

    // A callback from a removed channel must not refresh its old lot after a
    // new route/account has reactivated this hook's shared active ref.
    const refresh = () => { if (current && active.current) void load() }
    window.addEventListener('focus', refresh)

    if (!auctionId) return () => { current = false; active.current = false; request.current += 1; window.removeEventListener('focus', refresh) }
    let client: ReturnType<typeof createClient> | null = null
    try {
      client = createClient()
      const channel = client
        .channel(`auction-live-${auctionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'auction_realtime_signals', filter: `auction_id=eq.${auctionId}` },
          refresh,
        )
        .subscribe((status) => { if (status === 'SUBSCRIBED') refresh() })

      return () => {
        current = false
        active.current = false
        request.current += 1
        window.removeEventListener('focus', refresh)
        if (client && channel) {
          void client.removeChannel(channel)
        }
      }
    } catch {
      // In test or non-browser environments, Realtime can be unavailable
    }
    return () => { current = false; active.current = false; request.current += 1; window.removeEventListener('focus', refresh) }
  }, [auctionId, load, viewerId])

  return { ...state, reload: load }
}
