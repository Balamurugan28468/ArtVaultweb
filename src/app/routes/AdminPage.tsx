import { useState } from 'react'
import {
  AdminAuditLogsView,
  AdminArtworksView,
  AdminDashboardView,
  AdminOrdersView,
  AdminPaymentsView,
  AdminSellersView,
  AdminUsersView,
  ArtworkModerationQueue,
  SellerApplicationQueue,
  usePendingSellerApplications,
  useSubmittedArtworks,
} from '@/features/admin'
import { Container, PageHeader } from '@/shared/ui'

type AdminTab =
  | 'sellers'
  | 'artworks'
  | 'dashboard'
  | 'users'
  | 'sellers-all'
  | 'artworks-all'
  | 'orders'
  | 'payments'
  | 'audit'

const TAB_CLASSNAME = (active: boolean) =>
  `px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
    active ? 'border-brand-primary text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
  }`

/**
 * Admin Control Center. Gated by `RequireRole(['ADMIN', 'SUPER_ADMIN'])`.
 * Provides full control across all moderation, user management, order/payment tracking,
 * and immutable database audit logs.
 */
export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('sellers')
  const sellerQueue = usePendingSellerApplications?.()
  const artworkQueue = useSubmittedArtworks?.()

  const sellerCount = sellerQueue?.data?.length
  const artworkCount = artworkQueue?.data?.length

  return (
    <Container>
      <section className="flex flex-col gap-6">
        <PageHeader
          title="Admin Control Center"
          description="Manage users, sellers, artwork moderation, orders, payments, and system audit logs."
        />

        <div role="tablist" aria-label="Admin sections" className="flex gap-2 border-b border-border overflow-x-auto pb-px">
          <button
            type="button"
            role="tab"
            id="admin-tab-sellers"
            aria-selected={tab === 'sellers'}
            aria-controls="admin-panel-sellers"
            className={TAB_CLASSNAME(tab === 'sellers')}
            onClick={() => setTab('sellers')}
          >
            Seller Applications{typeof sellerCount === 'number' ? ` (${sellerCount})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-artworks"
            aria-selected={tab === 'artworks'}
            aria-controls="admin-panel-artworks"
            className={TAB_CLASSNAME(tab === 'artworks')}
            onClick={() => setTab('artworks')}
          >
            Artwork Moderation{typeof artworkCount === 'number' ? ` (${artworkCount})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-dashboard"
            aria-selected={tab === 'dashboard'}
            aria-controls="admin-panel-dashboard"
            className={TAB_CLASSNAME(tab === 'dashboard')}
            onClick={() => setTab('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-users"
            aria-selected={tab === 'users'}
            aria-controls="admin-panel-users"
            className={TAB_CLASSNAME(tab === 'users')}
            onClick={() => setTab('users')}
          >
            Users
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-sellers-all"
            aria-selected={tab === 'sellers-all'}
            aria-controls="admin-panel-sellers-all"
            className={TAB_CLASSNAME(tab === 'sellers-all')}
            onClick={() => setTab('sellers-all')}
          >
            All Sellers
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-artworks-all"
            aria-selected={tab === 'artworks-all'}
            aria-controls="admin-panel-artworks-all"
            className={TAB_CLASSNAME(tab === 'artworks-all')}
            onClick={() => setTab('artworks-all')}
          >
            All Artworks
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-orders"
            aria-selected={tab === 'orders'}
            aria-controls="admin-panel-orders"
            className={TAB_CLASSNAME(tab === 'orders')}
            onClick={() => setTab('orders')}
          >
            Orders
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-payments"
            aria-selected={tab === 'payments'}
            aria-controls="admin-panel-payments"
            className={TAB_CLASSNAME(tab === 'payments')}
            onClick={() => setTab('payments')}
          >
            Payments
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-audit"
            aria-selected={tab === 'audit'}
            aria-controls="admin-panel-audit"
            className={TAB_CLASSNAME(tab === 'audit')}
            onClick={() => setTab('audit')}
          >
            Audit Log
          </button>
        </div>

        <div role="tabpanel" id="admin-panel-sellers" aria-labelledby="admin-tab-sellers" hidden={tab !== 'sellers'}>
          {tab === 'sellers' && SellerApplicationQueue && <SellerApplicationQueue />}
        </div>
        <div role="tabpanel" id="admin-panel-artworks" aria-labelledby="admin-tab-artworks" hidden={tab !== 'artworks'}>
          {tab === 'artworks' && ArtworkModerationQueue && <ArtworkModerationQueue />}
        </div>
        <div role="tabpanel" id="admin-panel-dashboard" aria-labelledby="admin-tab-dashboard" hidden={tab !== 'dashboard'}>
          {tab === 'dashboard' && AdminDashboardView && <AdminDashboardView onNavigateTab={setTab} />}
        </div>
        <div role="tabpanel" id="admin-panel-users" aria-labelledby="admin-tab-users" hidden={tab !== 'users'}>
          {tab === 'users' && AdminUsersView && <AdminUsersView />}
        </div>
        <div role="tabpanel" id="admin-panel-sellers-all" aria-labelledby="admin-tab-sellers-all" hidden={tab !== 'sellers-all'}>
          {tab === 'sellers-all' && AdminSellersView && <AdminSellersView />}
        </div>
        <div role="tabpanel" id="admin-panel-artworks-all" aria-labelledby="admin-tab-artworks-all" hidden={tab !== 'artworks-all'}>
          {tab === 'artworks-all' && AdminArtworksView && <AdminArtworksView />}
        </div>
        <div role="tabpanel" id="admin-panel-orders" aria-labelledby="admin-tab-orders" hidden={tab !== 'orders'}>
          {tab === 'orders' && AdminOrdersView && <AdminOrdersView />}
        </div>
        <div role="tabpanel" id="admin-panel-payments" aria-labelledby="admin-tab-payments" hidden={tab !== 'payments'}>
          {tab === 'payments' && AdminPaymentsView && <AdminPaymentsView />}
        </div>
        <div role="tabpanel" id="admin-panel-audit" aria-labelledby="admin-tab-audit" hidden={tab !== 'audit'}>
          {tab === 'audit' && AdminAuditLogsView && <AdminAuditLogsView />}
        </div>
      </section>
    </Container>
  )
}
