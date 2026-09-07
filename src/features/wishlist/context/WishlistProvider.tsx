import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useToast } from '@/shared/ui'
import {
  addGuestWishlistId,
  clearGuestWishlist,
  getGuestWishlistIds,
  hasShownGuestSaveToast,
  markGuestSaveToastShown,
  removeGuestWishlistId,
} from '../api/guestWishlistStorage'
import { addWishlistItem, removeWishlistItem, subscribeWishlistIds } from '../api/wishlistRepository'
import { isWishlistError, type WishlistMode } from '../types'

interface WishlistContextValue {
  savedIds: Set<string>
  mode: WishlistMode
  status: 'loading' | 'ready' | 'error'
  isSaved: (artworkId: string) => boolean
  toggle: (artworkId: string) => Promise<void>
}

const WishlistContext = createContext<WishlistContextValue | undefined>(undefined)

/**
 * Mounted once near the app root (see main.tsx) — the single owner of
 * wishlist state for the whole session. Every save button and the
 * /wishlist page read from this same context, so there is exactly one
 * Firestore listener for a signed-in account's wishlist, never one per
 * artwork card (see subscribeWishlistIds).
 *
 * Guest state (signed out) lives entirely in this browser's localStorage;
 * signing in triggers a one-time merge of any locally-saved ids into the
 * account's real Firestore wishlist, then clears local storage — see the
 * effect below. Toggling is optimistic in both modes: the heart updates
 * immediately, with the real write (or localStorage write) happening
 * after; an account-mode failure rolls the optimistic change back and
 * shows an error toast.
 */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth()
  const toast = useToast()

  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(getGuestWishlistIds()))
  const [mode, setMode] = useState<WishlistMode>('guest')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('ready')
  const mergedForUid = useRef<string | null>(null)

  useEffect(() => {
    if (authStatus !== 'authenticated' || !user) {
      // Signed out (or not yet resolved): guest mode, reading whatever is
      // currently in local storage — covers both "never signed in" and
      // "just signed out," so a sign-out doesn't leave a stale account
      // wishlist visible.
      mergedForUid.current = null
      setMode('guest')
      setSavedIds(new Set(getGuestWishlistIds()))
      setStatus('ready')
      return
    }

    setMode('account')
    setStatus('loading')
    const uid = user.uid

    const unsubscribe = subscribeWishlistIds(
      uid,
      (ids) => {
        setSavedIds(ids)
        setStatus('ready')

        if (mergedForUid.current === uid) return
        mergedForUid.current = uid

        const guestIds = getGuestWishlistIds()
        if (guestIds.length === 0) return
        const missing = guestIds.filter((id) => !ids.has(id))

        void (async () => {
          try {
            await Promise.all(missing.map((id) => addWishlistItem(uid, id)))
            clearGuestWishlist()
          } catch {
            // Leave the local guest wishlist intact — nothing is lost, and
            // the merge is retried the next time this uid signs in (see
            // mergedForUid above only ever advancing past this uid once a
            // merge attempt has actually run, not once it has succeeded —
            // a partial/failed merge here is safe to leave for a manual
            // retry rather than silently dropping saved items).
          }
        })()
      },
      () => setStatus('error'),
    )

    return unsubscribe
  }, [authStatus, user])

  const toggle = useCallback(
    async (artworkId: string) => {
      const wasSaved = savedIds.has(artworkId)

      setSavedIds((prev) => {
        const next = new Set(prev)
        if (wasSaved) next.delete(artworkId)
        else next.add(artworkId)
        return next
      })

      if (mode === 'guest') {
        if (wasSaved) {
          removeGuestWishlistId(artworkId)
        } else {
          addGuestWishlistId(artworkId)
          if (!hasShownGuestSaveToast()) {
            toast.info('Saved. Sign in to keep your wishlist across devices.')
            markGuestSaveToastShown()
          }
        }
        return
      }

      if (!user) return
      try {
        if (wasSaved) await removeWishlistItem(user.uid, artworkId)
        else await addWishlistItem(user.uid, artworkId)
      } catch (error) {
        setSavedIds((prev) => {
          const next = new Set(prev)
          if (wasSaved) next.add(artworkId)
          else next.delete(artworkId)
          return next
        })
        toast.error(isWishlistError(error) ? error.message : 'Something went wrong. Please try again.')
      }
    },
    [savedIds, mode, user, toast],
  )

  const value = useMemo<WishlistContextValue>(
    () => ({ savedIds, mode, status, isSaved: (id) => savedIds.has(id), toggle }),
    [savedIds, mode, status, toggle],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist(): WishlistContextValue {
  const context = useContext(WishlistContext)
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider')
  }
  return context
}
