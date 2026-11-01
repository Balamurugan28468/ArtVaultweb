import type { Timestamp } from '@/lib/supabase/timestamp'

export type NotificationKind =
  | 'ORDER'
  | 'PAYMENT'
  | 'AUCTION'
  | 'REVIEW'
  | 'SELLER'
  | 'ARTWORK'
  | 'SYSTEM'

export interface AppNotification {
  id: string
  userId: string
  kind: NotificationKind
  title: string
  body: string
  readAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
  href?: string
}

export interface CreateNotificationInput {
  kind: NotificationKind
  title: string
  body: string
  userId?: string
}

