import type { UserRole } from '@/features/auth/types'
import type { SellerStatus } from '@/features/seller-studio'
import type { ArtworkStatus } from '@/features/artwork'

export interface AdminActionError {
  message: string
}

export interface AdminDashboardMetrics {
  totalUsers: number
  totalSellers: number
  pendingSellers: number
  approvedSellers: number
  suspendedSellers: number
  totalArtworks: number
  publishedArtworks: number
  submittedArtworks: number
  suspendedArtworks: number
  rejectedArtworks: number
  totalOrders: number
  paidOrders: number
  pendingOrders: number
  cancelledOrders: number
  totalRevenueMinor: number
}

export interface AdminUserRecord {
  id: string
  displayName: string | null
  email: string | null
  role: UserRole
  accountStatus: 'ACTIVE' | 'SUSPENDED'
  sellerStatus: SellerStatus | null
  createdAt: string
}

export interface AdminOrderRecord {
  id: string
  buyerId: string
  buyerName: string | null
  buyerEmail: string | null
  status: string
  paymentState: string
  currency: string
  totalMinor: number
  itemCount: number
  createdAt: string
}

export interface AdminPaymentRecord {
  id: string
  orderId: string
  provider: string
  mode: string | null
  status: string
  gatewayPhase: string | null
  amountMinor: number
  currency: string
  providerOrderId: string | null
  providerPaymentId: string | null
  createdAt: string
}

export interface AdminAuditLogRecord {
  id: string
  actorId: string
  actorName: string | null
  action: string
  targetType: string
  targetId: string
  reason: string | null
  previousState: string | null
  newState: string | null
  occurredAt: string
}

export interface AdminArtworkRecord {
  id: string
  sellerId: string
  sellerBusinessName: string | null
  artistName: string | null
  categoryId: string
  categoryName: string | null
  title: string
  priceMinor: number
  currency: string
  status: ArtworkStatus
  rejectionReason: string | null
  imagePath: string | null
  createdAt: string
}

