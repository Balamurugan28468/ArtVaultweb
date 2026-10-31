import { createClient } from '@/lib/supabase/client'
import { result } from '@/lib/supabase/data'
import { mapCatalogRow, toArtworkError } from '@/features/artwork/api/artworkRepository'
import type { Artwork, ArtworkError } from '@/features/artwork'
import {
  mapToSellerApplication,
  toSellerError,
  type SellerApplication,
  type SellerError,
} from '@/features/seller-studio'
import type {
  AdminAuditLogRecord,
  AdminDashboardMetrics,
  AdminOrderRecord,
  AdminPaymentRecord,
  AdminUserRecord,
} from '../types'

function isCatalogRow(row: Record<string, unknown>): boolean {
  return (
    typeof row.id === 'string' &&
    typeof row.seller_id === 'string' &&
    typeof row.status === 'string' &&
    typeof row.title === 'string' &&
    typeof row.created_at === 'string' &&
    typeof row.updated_at === 'string'
  )
}

function isSubmittedCatalogRow(row: Record<string, unknown>): boolean {
  return isCatalogRow(row) && row.status === 'SUBMITTED'
}

/** Newest-applied-first */
export async function getPendingSellerApplications(): Promise<SellerApplication[]> {
  try {
    const rows =
      (await result(
        createClient()
          .from('seller_profiles')
          .select('*')
          .eq('status', 'PENDING')
          .order('created_at'),
      )) ?? []
    return rows
      .map((row) => mapToSellerApplication(row.id, row))
      .filter((application): application is SellerApplication => application !== null)
  } catch (error) {
    throw toSellerError(error) satisfies SellerError
  }
}

/** All seller profiles for admin inspection */
export async function getAllSellerProfiles(): Promise<SellerApplication[]> {
  try {
    const rows =
      (await result(
        createClient()
          .from('seller_profiles')
          .select('*')
          .order('created_at', { ascending: false }),
      )) ?? []
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
    const rows =
      (await result(
        createClient()
          .from('artwork_catalog')
          .select('*')
          .eq('status', 'SUBMITTED')
          .order('updated_at'),
      )) ?? []
    return await Promise.all(
      rows.filter(isSubmittedCatalogRow).map((row) => mapCatalogRow(row)),
    )
  } catch (error) {
    throw toArtworkError(error) satisfies ArtworkError
  }
}

/** All artworks across all moderation statuses for admin inspection */
export async function getAllArtworks(): Promise<Artwork[]> {
  try {
    const rows =
      (await result(
        createClient()
          .from('artwork_catalog')
          .select('*')
          .order('created_at', { ascending: false }),
      )) ?? []
    return await Promise.all(
      rows.filter(isCatalogRow).map((row) => mapCatalogRow(row)),
    )
  } catch (error) {
    throw toArtworkError(error) satisfies ArtworkError
  }
}

/** Real database metrics for admin dashboard */
export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  const data = await result(createClient().rpc('get_admin_dashboard_metrics'))
  if (!data || typeof data !== 'object') {
    throw new Error('Failed to load admin dashboard metrics')
  }
  const obj = data as Record<string, unknown>
  return {
    totalUsers: Number(obj.totalUsers ?? 0),
    totalSellers: Number(obj.totalSellers ?? 0),
    pendingSellers: Number(obj.pendingSellers ?? 0),
    approvedSellers: Number(obj.approvedSellers ?? 0),
    suspendedSellers: Number(obj.suspendedSellers ?? 0),
    totalArtworks: Number(obj.totalArtworks ?? 0),
    publishedArtworks: Number(obj.publishedArtworks ?? 0),
    submittedArtworks: Number(obj.submittedArtworks ?? 0),
    suspendedArtworks: Number(obj.suspendedArtworks ?? 0),
    rejectedArtworks: Number(obj.rejectedArtworks ?? 0),
    totalOrders: Number(obj.totalOrders ?? 0),
    paidOrders: Number(obj.paidOrders ?? 0),
    pendingOrders: Number(obj.pendingOrders ?? 0),
    cancelledOrders: Number(obj.cancelledOrders ?? 0),
    totalRevenueMinor: Number(obj.totalRevenueMinor ?? 0),
  }
}

/** Admin user inspection */
export async function getAdminUsers(): Promise<AdminUserRecord[]> {
  const rows = (await result(createClient().rpc('get_admin_users'))) ?? []
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    displayName: typeof row.display_name === 'string' ? row.display_name : null,
    email: typeof row.email === 'string' ? row.email : null,
    role: (row.role as AdminUserRecord['role']) ?? 'CUSTOMER',
    accountStatus: row.account_status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    sellerStatus: (row.seller_status as AdminUserRecord['sellerStatus']) ?? null,
    createdAt: String(row.created_at),
  }))
}

/** Admin order oversight */
export async function getAdminOrders(): Promise<AdminOrderRecord[]> {
  const rows = (await result(createClient().rpc('get_admin_orders'))) ?? []
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    buyerId: String(row.buyer_id),
    buyerName: typeof row.buyer_name === 'string' ? row.buyer_name : null,
    buyerEmail: typeof row.buyer_email === 'string' ? row.buyer_email : null,
    status: String(row.status),
    paymentState: String(row.payment_state),
    currency: String(row.currency ?? 'INR'),
    totalMinor: Number(row.total_minor ?? 0),
    itemCount: Number(row.item_count ?? 0),
    createdAt: String(row.created_at),
  }))
}

/** Admin payment oversight */
export async function getAdminPayments(): Promise<AdminPaymentRecord[]> {
  const rows = (await result(createClient().rpc('get_admin_payments'))) ?? []
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    orderId: String(row.order_id),
    provider: String(row.provider),
    mode: typeof row.mode === 'string' ? row.mode : null,
    status: String(row.status),
    gatewayPhase: typeof row.gateway_phase === 'string' ? row.gateway_phase : null,
    amountMinor: Number(row.amount_minor ?? 0),
    currency: String(row.currency ?? 'INR'),
    providerOrderId: typeof row.provider_order_id === 'string' ? row.provider_order_id : null,
    providerPaymentId: typeof row.provider_payment_id === 'string' ? row.provider_payment_id : null,
    createdAt: String(row.created_at),
  }))
}

/** Admin audit logs */
export async function getAdminAuditLogs(): Promise<AdminAuditLogRecord[]> {
  const rows = (await result(createClient().rpc('get_admin_logs'))) ?? []
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    actorId: String(row.actor_id),
    actorName: typeof row.actor_name === 'string' ? row.actor_name : null,
    action: String(row.action),
    targetType: String(row.target_type),
    targetId: String(row.target_id),
    reason: typeof row.reason === 'string' ? row.reason : null,
    previousState: typeof row.previous_state === 'string' ? row.previous_state : null,
    newState: typeof row.new_state === 'string' ? row.new_state : null,
    occurredAt: String(row.occurred_at),
  }))
}
