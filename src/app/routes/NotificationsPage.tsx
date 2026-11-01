import { Link } from 'react-router'
import { NotificationList, useNotifications } from '@/features/notifications'
import { PageHeader } from '@/shared/ui'

export function NotificationsPage() {
  const {
    notifications,
    loading,
    markAsRead,
    markAllAsRead,
  } = useNotifications()

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link to="/account" className="text-sm text-text-secondary hover:text-text-primary hover:underline">
          ← Back to Account
        </Link>
        <PageHeader
          title="Notifications"
          description="Stay updated on your orders, auction bids, approvals, and platform announcements."
        />
      </div>

      <NotificationList
        notifications={notifications}
        loading={loading}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
      />
    </section>
  )
}

