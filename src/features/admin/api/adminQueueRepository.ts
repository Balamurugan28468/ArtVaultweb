import { collection, getDocs, query, where } from 'firebase/firestore'
import { mapToArtwork, toArtworkError, type Artwork, type ArtworkError } from '@/features/artwork'
import { mapToSellerApplication, toSellerError, type SellerApplication, type SellerError } from '@/features/seller-studio'
import { db } from '@/lib/firebase/config'

/**
 * Module 13 Phase 3 — the Admin Control Center's two review queues. Both
 * are one-shot reads (`getDocs`, never `onSnapshot`), matching the
 * marketplace/wishlist-resolution precedent for a query that's refetched on
 * demand rather than kept perpetually live — see hooks/usePendingSellerApplications.ts
 * and hooks/useSubmittedArtworks.ts, which refetch after a successful
 * moderation action rather than relying on a listener. `firestore.rules`'
 * own Module 13 Phase 3 grant (`isAdmin() && resource.data.status == '...'`)
 * is what makes either query legal for an ADMIN/SUPER_ADMIN caller at all —
 * this file issues exactly the query shape that grant was scoped for and no
 * other; a query for any other status is expected to be denied by the
 * server, not merely avoided by convention.
 */

function sellersCollection() {
  return collection(db, 'sellers')
}

function artworksCollection() {
  return collection(db, 'artworks')
}

/** Newest-applied-first — sorted client-side, matching every other small-catalog query in this codebase (see artworkRepository.ts) rather than adding a composite index for a queue this size. */
export async function getPendingSellerApplications(): Promise<SellerApplication[]> {
  try {
    const snapshot = await getDocs(query(sellersCollection(), where('status', '==', 'PENDING')))
    return snapshot.docs
      .map((docSnapshot) => mapToSellerApplication(docSnapshot.id, docSnapshot.data()))
      .filter((application): application is SellerApplication => application !== null)
      .sort((a, b) => a.appliedAt.toMillis() - b.appliedAt.toMillis())
  } catch (error) {
    throw toSellerError(error) satisfies SellerError
  }
}

/** Oldest-submitted-first — the fairest default review order for a moderation queue. */
export async function getSubmittedArtworks(): Promise<Artwork[]> {
  try {
    const snapshot = await getDocs(query(artworksCollection(), where('status', '==', 'SUBMITTED')))
    return snapshot.docs
      .map((docSnapshot) => mapToArtwork(docSnapshot.id, docSnapshot.data()))
      .filter((artwork): artwork is Artwork => artwork !== null)
      .sort((a, b) => a.updatedAt.toMillis() - b.updatedAt.toMillis())
  } catch (error) {
    throw toArtworkError(error) satisfies ArtworkError
  }
}
