import { useEffect, useState } from 'react'
import { fetchAllAuctions, toAuctionError } from '../api/auctionsRepository'
import { isAuctionError, type AuctionListState } from '../types'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/app/providers/AuthProvider'

/** Bounded public catalog read; trusted event/lot changes refresh the view. */
export function useAuctions(): AuctionListState {
  const { user } = useAuth()
  const viewerId = user?.uid ?? null
  const [state, setState] = useState<AuctionListState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    let revision = 0
    setState({ status: 'loading' })

    const load = async () => {
      const current = ++revision
      try {
        const auctions = await fetchAllAuctions()
        if (!active || current !== revision) return
        setState({ status: 'loaded', auctions })
      } catch (error) {
        if (!active || current !== revision) return
        setState({ status: 'error', error: isAuctionError(error) ? error : toAuctionError(error) })
      }
    }
    const refresh = () => { if (active) void load() }
    void load()
    window.addEventListener('focus', refresh)
    let unsubscribe: (() => void) | undefined
    try {
      const client = createClient()
      const channel = client.channel('auction-catalog-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_realtime_signals' }, () => { void load() })
        .subscribe((status) => { if (status === 'SUBSCRIBED') refresh() })
      unsubscribe = () => { void client.removeChannel(channel) }
    } catch { /* The initial read still works when Realtime is unavailable. */ }

    return () => {
      active = false
      window.removeEventListener('focus', refresh)
      unsubscribe?.()
    }
  }, [viewerId])

  return state
}
