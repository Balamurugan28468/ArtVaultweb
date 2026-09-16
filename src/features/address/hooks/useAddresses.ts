import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { subscribeAddresses } from '../api/addressRepository'
import type { AddressListState } from '../types'

/**
 * Owns exactly one realtime Firestore subscription over the signed-in
 * user's own address book — re-subscribing only when the uid actually
 * changes, always cleaning up the previous listener first (same discipline
 * `useUserProfile` already applies). Returns `{ status: 'loading' }`
 * whenever there is no signed-in user, since the address book is
 * inherently an authenticated-only feature — there is no guest mode here,
 * unlike Wishlist/Cart.
 */
export function useAddresses(): AddressListState {
  const { status, user } = useAuth()
  const [state, setState] = useState<AddressListState>({ status: 'loading' })

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      setState({ status: 'loading' })
      return
    }

    setState({ status: 'loading' })
    const unsubscribe = subscribeAddresses(
      user.uid,
      (addresses) => setState({ status: 'loaded', addresses }),
      (error) => setState({ status: 'error', error }),
    )

    return unsubscribe
  }, [status, user])

  return state
}
