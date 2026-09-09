import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '@/app/providers/AuthProvider'
import { useToast } from '@/shared/ui'
import { getAuthoritativeLikeState, hasLiked, likeArtwork, unlikeArtwork } from '../api/likeRepository'
import { isLikeError } from '../types'

export interface UseLikeResult {
  /** Whether the signed-in caller currently likes this artwork; always false while signed out. */
  liked: boolean
  /** The artwork's real like count, including this hook's own optimistic delta. */
  count: number
  /** True while a like/unlike write is in flight — used to disable the control and block duplicate activation. */
  pending: boolean
  /** Signed in: toggles like state via one atomic batch. Signed out: redirects to sign-in, same as any other authenticated-only action in this app. */
  toggle: () => void
}

/**
 * Likes are sign-in required and Detail-Page-only (Module 12) — unlike
 * Wishlist, there is no guest/local mode and no need for one shared
 * app-root listener, so this hook owns its own small piece of state per
 * mount rather than reusing WishlistProvider's context pattern.
 *
 * Whether the caller likes this artwork is a one-shot TanStack Query read
 * (`hasLiked`), matching `usePublicArtwork`'s own one-shot convention — not
 * a listener, and re-run automatically if `artworkId` or the signed-in uid
 * changes, which is what gives refresh-survival and cross-account isolation
 * for free (TanStack Query keys the cache by `[artworkId, uid]`, so signing
 * out and a different account signing in can never read the previous
 * account's cached result).
 *
 * `count` starts from `initialLikeCount` (the artwork document's own real
 * `likeCount`, already read by the caller) and only ever moves by this
 * hook's own optimistic +1/-1 — never a second, independent counter. Rapid
 * repeat activation from a single mount is blocked by `pending` rather than
 * allowed to queue more than one in-flight batch.
 *
 * A rejected batch is ambiguous, not automatically a failure: under genuine
 * concurrent activation of the same uid+artwork (e.g. two tabs on the same
 * account), the real Firestore emulator has been observed to reject a
 * batch's client promise even when it did commit server-side (Module 12
 * Phase 4). So a rejection first re-reads authoritative state
 * (`getAuthoritativeLikeState`) and only reconciles `liked`/`count` to it
 * when that read *proves* this call's own desired end state actually
 * happened — never merely because the write was rejected. A genuine denial
 * (signed out, a non-PUBLISHED artwork, tampering) leaves Firestore's real
 * state unchanged from before the attempt, so that same re-read correctly
 * fails to prove anything and the ordinary rollback + error toast still
 * fires — a real authorization failure is never converted into a false
 * success.
 */
export function useLike(artworkId: string | undefined, initialLikeCount: number): UseLikeResult {
  const { status: authStatus, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const uid = user?.uid ?? null

  const likedQuery = useQuery({
    queryKey: ['likes', artworkId, uid],
    queryFn: () => hasLiked(artworkId as string, uid as string),
    enabled: Boolean(artworkId) && Boolean(uid),
  })

  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null)
  const [optimisticDelta, setOptimisticDelta] = useState(0)
  const [pending, setPending] = useState(false)

  // A new signed-in account must never inherit the previous account's
  // optimistic override — real state for the new uid is re-fetched above
  // via the query key change, but any optimistic leftover from the
  // previous account needs an explicit reset here too.
  useEffect(() => {
    setOptimisticLiked(null)
    setOptimisticDelta(0)
  }, [uid, artworkId])

  const liked = optimisticLiked ?? likedQuery.data ?? false
  const count = Math.max(0, initialLikeCount + optimisticDelta)

  function toggle() {
    if (pending || !artworkId) return

    if (authStatus !== 'authenticated' || !uid) {
      navigate('/sign-in', { state: { from: location.pathname } })
      return
    }

    const wasLiked = liked
    setPending(true)
    setOptimisticLiked(!wasLiked)
    setOptimisticDelta((delta) => delta + (wasLiked ? -1 : 1))

    const write = wasLiked ? unlikeArtwork(artworkId, uid) : likeArtwork(artworkId, uid)
    write
      .catch(async (error: unknown) => {
        // A rejected batch is ambiguous under genuine concurrent activation
        // of this same uid+artwork (e.g. two tabs) — the real emulator can
        // reject both racing writes' promises even though one of them did
        // commit (see Module 12 Phase 4). Re-read ground truth before
        // deciding what to show: only adopt it as success if it *proves*
        // the write this call was trying to make actually landed. Anything
        // else — including the reconciliation read itself failing — falls
        // through to the ordinary rollback, so a genuine denial (signed
        // out, non-PUBLISHED artwork, tampering) is never hidden.
        const desiredLiked = !wasLiked
        try {
          const authoritative = await getAuthoritativeLikeState(artworkId, uid)
          if (authoritative.liked === desiredLiked) {
            setOptimisticLiked(authoritative.liked)
            setOptimisticDelta(authoritative.likeCount - initialLikeCount)
            return
          }
        } catch {
          // Reconciliation read itself failed — fall through to rollback.
        }

        setOptimisticLiked(wasLiked)
        setOptimisticDelta((delta) => delta + (wasLiked ? 1 : -1))
        toast.error(isLikeError(error) ? error.message : 'Something went wrong. Please try again.')
      })
      .finally(() => setPending(false))
  }

  return { liked, count, pending, toggle }
}
