import { useEffect, useState } from 'react'
import { getOrder, getOrderItems, toOrderError } from '../api/orderRepository'
import { isOrderError, type OrderState } from '../types'

/**
 * A one-shot read (not a listener — Order Details doesn't need live
 * updates any more than ArtworkDetailPage's own usePublicArtwork does),
 * for one order plus its item snapshots. `permission-denied` collapses
 * into 'missing' exactly like usePublicArtwork's own `getPublicArtwork`
 * does for a private artwork — a guessed/forged order id belonging to
 * another buyer must stay indistinguishable from one that never existed.
 */
export function useOrder(orderId: string | undefined): OrderState {
  const [state, setState] = useState<OrderState>({ status: 'loading' })

  useEffect(() => {
    if (!orderId) {
      setState({ status: 'missing' })
      return
    }

    let active = true
    setState({ status: 'loading' })

    void (async () => {
      try {
        const order = await getOrder(orderId)
        if (!active) return
        if (!order) {
          setState({ status: 'missing' })
          return
        }
        const items = await getOrderItems(orderId)
        if (!active) return
        setState({ status: 'loaded', order, items })
      } catch (error) {
        if (!active) return
        setState({ status: 'error', error: isOrderError(error) ? error : toOrderError(error) })
      }
    })()

    return () => {
      active = false
    }
  }, [orderId])

  return state
}
