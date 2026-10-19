export {
  approveSellerApplication,
  isAdminActionError,
  moderateArtwork,
  moderateUser,
  rejectSellerApplication,
  restoreArtwork,
  setUserRole,
  suspendArtwork,
  suspendSellerApplication,
  type AdminActionError,
} from './api/adminApi'

export {
  getAdminAuditLogs,
  getAdminDashboardMetrics,
  getAdminOrders,
  getAdminPayments,
  getAdminUsers,
  getAllArtworks,
  getAllSellerProfiles,
  getPendingSellerApplications,
  getSubmittedArtworks,
} from './api/adminQueueRepository'

export { AdminAuditLogsView } from './components/AdminAuditLogsView'
export { AdminArtworksView } from './components/AdminArtworksView'
export { AdminDashboardView } from './components/AdminDashboardView'
export { AdminOrdersView } from './components/AdminOrdersView'
export { AdminPaymentsView } from './components/AdminPaymentsView'
export { AdminSellersView } from './components/AdminSellersView'
export { AdminUsersView } from './components/AdminUsersView'
export { ArtworkModerationCard } from './components/ArtworkModerationCard'
export { ArtworkModerationLookup } from './components/ArtworkModerationLookup'
export { ArtworkModerationQueue } from './components/ArtworkModerationQueue'
export { ModerationActionModal } from './components/ModerationActionModal'
export { SellerApplicationCard } from './components/SellerApplicationCard'
export { SellerApplicationQueue } from './components/SellerApplicationQueue'

export {
  ADMIN_AUDIT_LOGS_QUERY_KEY,
  useAdminAuditLogs,
} from './hooks/useAdminAuditLogs'
export {
  ADMIN_DASHBOARD_METRICS_QUERY_KEY,
  useAdminDashboardMetrics,
} from './hooks/useAdminDashboardMetrics'
export {
  ADMIN_ORDERS_QUERY_KEY,
  useAdminOrders,
} from './hooks/useAdminOrders'
export {
  ADMIN_PAYMENTS_QUERY_KEY,
  useAdminPayments,
} from './hooks/useAdminPayments'
export {
  ADMIN_USERS_QUERY_KEY,
  useAdminUsers,
} from './hooks/useAdminUsers'
export {
  ALL_ARTWORKS_QUERY_KEY,
  useAllArtworks,
} from './hooks/useAllArtworks'
export {
  ALL_SELLERS_QUERY_KEY,
  useAllSellers,
} from './hooks/useAllSellers'
export { useApproveSellerApplication } from './hooks/useApproveSellerApplication'
export { useModerateArtwork, type ModerateArtworkInput } from './hooks/useModerateArtwork'
export { useModerateUser, type ModerateUserInput } from './hooks/useModerateUser'
export { PENDING_SELLER_APPLICATIONS_QUERY_KEY, usePendingSellerApplications } from './hooks/usePendingSellerApplications'
export { useRejectSellerApplication, type RejectSellerApplicationInput } from './hooks/useRejectSellerApplication'
export { useRestoreArtwork } from './hooks/useRestoreArtwork'
export { useSetUserRole, type SetUserRoleInput } from './hooks/useSetUserRole'
export { SUBMITTED_ARTWORKS_QUERY_KEY, useSubmittedArtworks } from './hooks/useSubmittedArtworks'
export { useSuspendArtwork, type SuspendArtworkInput } from './hooks/useSuspendArtwork'
export { useSuspendSeller, type SuspendSellerInput } from './hooks/useSuspendSeller'

export type {
  AdminArtworkRecord,
  AdminAuditLogRecord,
  AdminDashboardMetrics,
  AdminOrderRecord,
  AdminPaymentRecord,
  AdminUserRecord,
} from './types'
