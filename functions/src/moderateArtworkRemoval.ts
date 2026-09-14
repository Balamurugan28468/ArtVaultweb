/**
 * Admin moderation override (UI-03 final correction) — the trusted
 * business logic behind the Admin Control Center's "Suspend" action.
 * Exactly like `publishArtwork.ts`'s `decideArtworkByArtworkId`, this
 * performs no authorization check of its own — its only caller,
 * `handleSuspendArtwork` in adminActions.ts, MUST authorize the caller
 * (ADMIN/SUPER_ADMIN only) before ever invoking it.
 *
 * Deliberately does not hard-delete anything, for any starting status.
 * `allow delete` in firestore.rules only ever matches DRAFT/REJECTED for
 * the *owner*, and a seller's own record (title/price/images) may be
 * referenced by past orders, carts, wishlists, or other relational data the
 * instant it was ever PUBLISHED — which a REJECTED or even a DRAFT artwork
 * (reachable from PUBLISHED via the existing "edit a live listing"
 * resubmission branch) can no longer be assumed never to have been. Moving
 * every status uniformly to SUSPENDED — never a hard delete — means this
 * function never has to re-derive, case by case, which statuses are
 * "provably safe" to destroy; it simply never destroys anything, which
 * trivially satisfies "only hard-delete where the data model proves it
 * safe" by not attempting it at all. SUSPENDED is also not publicly
 * readable (firestore.rules' `allow read`'s only public branch requires
 * `status == 'PUBLISHED'`), so the artwork disappears from every public
 * marketplace/search/category/artist-profile surface immediately — every
 * one of those already queries `where('status', '==', 'PUBLISHED')`.
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

export interface SuspendArtworkResult {
  previousStatus: string
}

/**
 * The read-check-write (and the audit-log write) all run inside one
 * Firestore transaction, for the same reason `decideArtworkByArtworkId`
 * does: two near-simultaneous admin actions on the same artwork must never
 * both silently apply, and the audit log must never exist without the
 * moderation write actually having happened (or vice versa) — one atomic
 * commit, not two separate writes that could partially fail.
 */
export async function suspendArtworkByAdmin(artworkId: string, reason: string, adminUid: string): Promise<SuspendArtworkResult> {
  const db = getFirestore()
  const artworkRef = db.collection('artworks').doc(artworkId)
  const logRef = db.collection('adminLogs').doc()

  return db.runTransaction(async (transaction) => {
    const artworkSnapshot = await transaction.get(artworkRef)
    if (!artworkSnapshot.exists) {
      throw new Error(`No artwork found for artworkId=${artworkId}.`)
    }
    const previousStatus = artworkSnapshot.data()?.status
    if (previousStatus === 'SUSPENDED') {
      throw new Error(`Artwork ${artworkId} is already suspended.`)
    }

    transaction.update(artworkRef, {
      status: 'SUSPENDED',
      reviewedAt: FieldValue.serverTimestamp(),
      rejectionReason: reason,
      updatedAt: FieldValue.serverTimestamp(),
    })

    transaction.set(logRef, {
      action: 'ARTWORK_SUSPENDED',
      artworkId,
      adminUid,
      previousStatus,
      resultingStatus: 'SUSPENDED',
      reason,
      createdAt: FieldValue.serverTimestamp(),
    })

    return { previousStatus: String(previousStatus) }
  })
}
