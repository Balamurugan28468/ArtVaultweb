import { useQuery } from '@tanstack/react-query'
import { getPendingSellerApplications } from '../api/adminQueueRepository'

export const PENDING_SELLER_APPLICATIONS_QUERY_KEY = ['admin', 'sellerApplications', 'pending'] as const

/** One-shot read, refetched explicitly after a successful approve/reject (see useApproveSellerApplication/useRejectSellerApplication) rather than kept live — matching this app's established one-shot-list precedent (useMarketplaceArtworks, usePublicArtwork). */
export function usePendingSellerApplications() {
  return useQuery({
    queryKey: PENDING_SELLER_APPLICATIONS_QUERY_KEY,
    queryFn: getPendingSellerApplications,
  })
}
