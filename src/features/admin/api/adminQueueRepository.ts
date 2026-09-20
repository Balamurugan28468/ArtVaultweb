import { createClient } from '@/lib/supabase/client'
import { result } from '@/lib/supabase/data'
import { mapCatalogRow, toArtworkError } from '@/features/artwork/api/artworkRepository'
import type { Artwork, ArtworkError } from '@/features/artwork'
import { mapToSellerApplication, toSellerError, type SellerApplication, type SellerError } from '@/features/seller-studio'

function isSubmittedCatalogRow(row: Record<string, unknown>): boolean {
  return typeof row.id === 'string' &&
    typeof row.seller_id === 'string' &&
    row.status === 'SUBMITTED' &&
    typeof row.title === 'string' &&
    typeof row.created_at === 'string' &&
    typeof row.updated_at === 'string'
}

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

/** Newest-applied-first — sorted client-side, matching every other small-catalog query in this codebase (see artworkRepository.ts) rather than adding a composite index for a queue this size. */
export async function getPendingSellerApplications(): Promise<SellerApplication[]> {
  try {
    const rows = (await result(createClient().from('seller_profiles').select('*').eq('status', 'PENDING').order('created_at'))) ?? []
    return rows
      .map((row) => mapToSellerApplication(row.id, row))
      .filter((application): application is SellerApplication => application !== null)
  } catch (error) {
    throw toSellerError(error) satisfies SellerError
  }
}

/** Oldest-submitted-first — the fairest default review order for a moderation queue. */
export async function getSubmittedArtworks(): Promise<Artwork[]> {
  try {
    const rows = (await result(createClient().from('artwork_catalog').select('*').eq('status', 'SUBMITTED').order('updated_at'))) ?? []
    return await Promise.all(rows
      .filter(isSubmittedCatalogRow)
      .map((row) => mapCatalogRow(row)))
  } catch (error) {
    throw toArtworkError(error) satisfies ArtworkError
  }
}
