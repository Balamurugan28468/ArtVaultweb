import { useQuery } from '@tanstack/react-query'
import { getAllSellerProfiles } from '../api/adminQueueRepository'
import type { SellerApplication } from '@/features/seller-studio'

export const ALL_SELLERS_QUERY_KEY = ['admin', 'all-sellers'] as const

export function useAllSellers() {
  return useQuery<SellerApplication[], Error>({
    queryKey: ALL_SELLERS_QUERY_KEY,
    queryFn: getAllSellerProfiles,
    staleTime: 30_000,
  })
}

