import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  CreditCard,
  Gavel,
  Package,
  Sparkles,
  Star,
  Store,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Card, EmptyState, Skeleton } from '@/shared/ui'
import type { AppNotification, NotificationKind } from '../types'

interface NotificationListProps {
  notifications: AppNotification[]
  loading: boolean
  onMarkAsRead: (id: string) => Promise<void>
  onMarkAllAsRead: () => Promise<void>
}

const KIND_ICONS: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  ORDER: Package,
  PAYMENT: CreditCard,
  AUCTION: Gavel,
  REVIEW: Star,
  SELLER: Store,
  ARTWORK: Sparkles,
  SYSTEM: Bell,
}

export function NotificationList({
  notifications,
  loading,
  onMarkAsRead,
  onMarkAllAsRead,
}: NotificationListProps) {
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL')
  const [busyAll, setBusyAll] = useState(false)

  const unreadCount = notifications.filter((n) => !n.readAt).length
  const displayed =
    filter === 'UNREAD' ? notifications.filter((n) => !n.readAt) : notifications

  const handleMarkAll = async () => {
    setBusyAll(true)
    try {
      await onMarkAllAsRead()
    } finally {
      setBusyAll(false)
    }
  }

  if (loading && notifications.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="flex items-center gap-4 p-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-full" />
            </div>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === 'ALL'
                ? 'bg-accent-gold/15 text-accent-gold border border-accent-gold/30'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('UNREAD')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === 'UNREAD'
                ? 'bg-accent-gold/15 text-accent-gold border border-accent-gold/30'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleMarkAll}
            disabled={busyAll}
            className="text-xs"
          >
            <CheckCheck aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Notifications Items */}
      {displayed.length === 0 ? (
        <EmptyState
          title={filter === 'UNREAD' ? 'No unread notifications' : 'No notifications yet'}
          description="We'll notify you here about order dispatches, bids, artwork approvals, and account updates."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {displayed.map((item) => {
            const Icon = KIND_ICONS[item.kind] || Bell
            const isUnread = !item.readAt

            return (
              <Card
                key={item.id}
                className={`relative flex items-start gap-3.5 p-4 transition-all duration-150 ${
                  isUnread
                    ? 'border-accent-gold/30 bg-accent-gold/5 shadow-sm'
                    : 'bg-surface hover:bg-surface-elevated'
                }`}
              >
                {/* Kind Icon */}
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    isUnread
                      ? 'bg-accent-gold/20 text-accent-gold'
                      : 'bg-surface-elevated text-text-muted'
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-col gap-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`text-sm font-medium truncate ${isUnread ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                      {item.title}
                    </h4>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-text-muted">
                      <Clock aria-hidden="true" className="h-3 w-3" />
                      {item.createdAt.toDate().toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
                    {item.body}
                  </p>

                  {item.href && (
                    <Link
                      to={item.href}
                      onClick={() => {
                        if (isUnread) void onMarkAsRead(item.id)
                      }}
                      className="mt-1 text-xs font-medium text-accent-gold hover:underline inline-flex items-center gap-1"
                    >
                      View details →
                    </Link>
                  )}
                </div>

                {/* Mark Read button */}
                {isUnread && (
                  <button
                    type="button"
                    onClick={() => void onMarkAsRead(item.id)}
                    title="Mark as read"
                    aria-label="Mark notification as read"
                    className="shrink-0 rounded-lg p-1.5 text-text-muted hover:bg-surface-elevated hover:text-accent-gold transition-colors"
                  >
                    <Check aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

