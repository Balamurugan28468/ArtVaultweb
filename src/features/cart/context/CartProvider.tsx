import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useToast } from '@/shared/ui'
import {
  clearGuestCart,
  getGuestCartQuantities,
  removeGuestCartItem,
  setGuestCartItemQuantity,
} from '../api/guestCartStorage'
import { clampCartQuantity, createCartItem, removeCartItem, subscribeCartQuantities, updateCartItemQuantity } from '../api/cartRepository'
import { isCartError, type CartMode } from '../types'

interface CartContextValue {
  /** artworkId -> quantity. A Map (not a plain object) so insertion order — oldest-added-first — is preserved for free. */
  quantities: Map<string, number>
  mode: CartMode
  status: 'loading' | 'ready' | 'error'
  itemCount: number
  isPending: (artworkId: string) => boolean
  getQuantity: (artworkId: string) => number
  addItem: (artworkId: string, quantity?: number) => Promise<boolean>
  setQuantity: (artworkId: string, quantity: number) => Promise<boolean>
  removeItem: (artworkId: string) => Promise<boolean>
}

const CartContext = createContext<CartContextValue | undefined>(undefined)

/**
 * Mounted once near the app root (see main.tsx), right alongside
 * WishlistProvider — the single owner of cart state for the whole session,
 * so there is exactly one Firestore listener for a signed-in account's
 * cart, never one per cart-item row or per "Add to Cart" button.
 *
 * Guest state (signed out) lives entirely in this browser's localStorage,
 * exactly like WishlistProvider; signing in triggers a one-time merge of
 * any locally-added quantities into the account's real Firestore cart
 * (added on top of whatever is already there server-side, never silently
 * overwritten), then clears local storage. Every mutation is optimistic in
 * both modes: the UI updates immediately, with the real write happening
 * after; an account-mode failure rolls the optimistic change back and
 * shows an error toast — same contract as WishlistProvider's toggle.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth()
  const toast = useToast()

  const [quantities, setQuantities] = useState<Map<string, number>>(() => getGuestCartQuantities())
  const [mode, setMode] = useState<CartMode>('guest')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('ready')
  const pendingIds = useRef(new Set<string>())
  const [pending, setPending] = useState(new Set<string>())
  const runMutation = useCallback(async (id: string, action: () => Promise<boolean>) => {
    if (pendingIds.current.has(id)) return false
    pendingIds.current.add(id)
    setPending(new Set(pendingIds.current))
    try { return await action() } finally {
      pendingIds.current.delete(id)
      setPending(new Set(pendingIds.current))
    }
  }, [])
  const mergedForUid = useRef<string | null>(null)

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) {
      mergedForUid.current = null
      setMode('guest')
      setQuantities(getGuestCartQuantities())
      setStatus('ready')
      return
    }

    setMode('account')
    setStatus('loading')
    const uid = user.uid

    const unsubscribe = subscribeCartQuantities(
      uid,
      (nextQuantities) => {
        setQuantities(nextQuantities)
        setStatus('ready')

        if (mergedForUid.current === uid) return
        mergedForUid.current = uid

        const guestEntries = getGuestCartQuantities()
        if (guestEntries.size === 0) return

        void (async () => {
          try {
            await Promise.all(
              Array.from(guestEntries.entries()).map(([artworkId, quantity]) =>
                nextQuantities.has(artworkId)
                  ? updateCartItemQuantity(uid, artworkId, (nextQuantities.get(artworkId) ?? 0) + quantity)
                  : createCartItem(uid, artworkId, quantity),
              ),
            )
            clearGuestCart()
          } catch {
            // Leave the local guest cart intact — nothing is lost, and the
            // merge is retried the next time this uid signs in (same
            // reasoning as WishlistProvider's own merge — see its comment).
          }
        })()
      },
      () => setStatus('error'),
    )

    return unsubscribe
  }, [authStatus, user])

  const performAdd = useCallback(
    async (artworkId: string, quantity = 1) => {
      if (mode === 'account' && !user) return false
      const previousQuantity = quantities.get(artworkId)
      const nextQuantity = clampCartQuantity((previousQuantity ?? 0) + quantity)

      setQuantities((prev) => {
        const next = new Map(prev)
        next.set(artworkId, nextQuantity)
        return next
      })

      if (mode === 'guest') {
        setGuestCartItemQuantity(artworkId, nextQuantity)
        return true
      }

      if (!user) return false
      try {
        if (previousQuantity === undefined) await createCartItem(user.uid, artworkId, nextQuantity)
        else await updateCartItemQuantity(user.uid, artworkId, nextQuantity)
      } catch (error) {
        setQuantities((prev) => {
          const next = new Map(prev)
          if (previousQuantity === undefined) next.delete(artworkId)
          else next.set(artworkId, previousQuantity)
          return next
        })
        toast.error(isCartError(error) ? error.message : 'Something went wrong. Please try again.')
        return false
      }
      return true
    },
    [quantities, mode, user, toast],
  )

  const performSet = useCallback(
    async (artworkId: string, quantity: number) => {
      quantity = clampCartQuantity(quantity)
      const previousQuantity = quantities.get(artworkId)
      if (previousQuantity === undefined) return false

      setQuantities((prev) => {
        const next = new Map(prev)
        next.set(artworkId, quantity)
        return next
      })

      if (mode === 'guest') {
        setGuestCartItemQuantity(artworkId, quantity)
        return true
      }

      if (!user) return false
      try {
        await updateCartItemQuantity(user.uid, artworkId, quantity)
      } catch (error) {
        setQuantities((prev) => {
          const next = new Map(prev)
          next.set(artworkId, previousQuantity)
          return next
        })
        toast.error(isCartError(error) ? error.message : 'Something went wrong. Please try again.')
        return false
      }
      return true
    },
    [quantities, mode, user, toast],
  )

  const performRemove = useCallback(
    async (artworkId: string) => {
      const previousQuantity = quantities.get(artworkId)
      if (previousQuantity === undefined) return false

      setQuantities((prev) => {
        const next = new Map(prev)
        next.delete(artworkId)
        return next
      })

      if (mode === 'guest') {
        removeGuestCartItem(artworkId)
        return true
      }

      if (!user) return false
      try {
        await removeCartItem(user.uid, artworkId)
      } catch (error) {
        setQuantities((prev) => {
          const next = new Map(prev)
          next.set(artworkId, previousQuantity)
          return next
        })
        toast.error(isCartError(error) ? error.message : 'Something went wrong. Please try again.')
        return false
      }
      return true
    },
    [quantities, mode, user, toast],
  )

  const addItem = useCallback((id: string, quantity = 1) => runMutation(id, () => performAdd(id, quantity)), [runMutation, performAdd])
  const setQuantity = useCallback((id: string, quantity: number) => runMutation(id, () => performSet(id, quantity)), [runMutation, performSet])
  const removeItem = useCallback((id: string) => runMutation(id, () => performRemove(id)), [runMutation, performRemove])

  const itemCount = useMemo(
    () => Array.from(quantities.values()).reduce((sum, quantity) => sum + quantity, 0),
    [quantities],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      quantities,
      mode,
      status,
      itemCount,
      isPending: (id) => pending.has(id),
      getQuantity: (artworkId) => quantities.get(artworkId) ?? 0,
      addItem,
      setQuantity,
      removeItem,
    }),
    [quantities, mode, status, pending, itemCount, addItem, setQuantity, removeItem],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
