import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { subscribeOrders } from '../api/orderRepository'
import type { OrderListState } from '../types'

/**
 * Exactly one Firestore listener per signed-in buyer, same discipline as
 * useUserProfile/WishlistProvider. Genuinely returns `{ status: 'loaded',
 * orders: [] }` for every account today — no order-creation path exists
 * yet (see orderRepository's own comment) — which My Orders renders as an
 * honest "No orders yet" empty state, never a fabricated list.
 */
export function useOrders(): OrderListState {
  const { status: authStatus, user } = useAuth()
  const [state, setState] = useState<OrderListState>({ status: 'loading' })

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) {
      setState({ status: 'loading' })
      return
    }

    setState({ status: 'loading' })
    const unsubscribe = subscribeOrders(
      user.uid,
      (orders) => setState({ status: 'loaded', orders }),
      (error) => setState({ status: 'error', error }),
    )

    return unsubscribe
  }, [authStatus, user])

  return state
}
