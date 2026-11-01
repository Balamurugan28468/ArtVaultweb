import { createClient } from '@/lib/supabase/client'
import { dataError, observe, result } from '@/lib/supabase/data'
import { Timestamp, timestamp } from '@/lib/supabase/timestamp'
import type { AppNotification, CreateNotificationInput, NotificationKind } from '../types'

export const toNotificationError = dataError

function inferNotificationHref(kind: NotificationKind, body: string): string | undefined {
  if (kind === 'ORDER') {
    const orderMatch = body.match(/[0-9a-f-]{36}/i)
    if (orderMatch) return `/orders/${orderMatch[0]}`
    return '/orders'
  }
  if (kind === 'AUCTION') return '/auctions'
  if (kind === 'SELLER' || kind === 'ARTWORK') return '/seller-studio'
  if (kind === 'REVIEW') return '/account/reviews'
  return undefined
}

function mapRowToNotification(row: Record<string, unknown>): AppNotification {
  const kind = (typeof row.kind === 'string' ? row.kind.toUpperCase() : 'SYSTEM') as NotificationKind
  const body = String(row.body || '')
  return {
    id: String(row.id),
    userId: String(row.user_id),
    kind,
    title: String(row.title || 'Notification'),
    body,
    readAt: row.read_at && typeof row.read_at === 'string' ? timestamp(row.read_at) : null,
    createdAt: typeof row.created_at === 'string' ? timestamp(row.created_at) : Timestamp.now(),
    updatedAt: typeof row.updated_at === 'string' ? timestamp(row.updated_at) : Timestamp.now(),
    href: inferNotificationHref(kind, body),
  }
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const client = createClient()
  const { data: authData } = await client.auth.getUser()
  const user = authData?.user
  if (!user) return []

  const { data, error } = await client
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !data) return []
  return data.map((r) => mapRowToNotification(r as Record<string, unknown>))
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const client = createClient()
  const { data: authData } = await client.auth.getUser()
  const user = authData?.user
  if (!user) return 0

  const { count, error } = await client
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)

  if (error || typeof count !== 'number') return 0
  return count
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const client = createClient()
  await result(
    client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id),
  )
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const client = createClient()
  const { data: authData } = await client.auth.getUser()
  const user = authData?.user
  if (!user) return

  await result(
    client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null),
  )
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const client = createClient()
  const { data: authData } = await client.auth.getUser()
  const targetUserId = input.userId || authData?.user?.id
  if (!targetUserId) return

  try {
    await client.from('notifications').insert({
      user_id: targetUserId,
      kind: input.kind,
      title: input.title,
      body: input.body,
    })
  } catch {
    // Ignore insertion error if user lacks direct insert grant or service role is expected
  }
}

export function subscribeToUserNotifications(
  onUpdate: (notifications: AppNotification[]) => void,
  onError: (error: Error) => void,
): () => void {
  try {
    return observe(
      'notifications',
      undefined,
      fetchNotifications,
      onUpdate,
      (err) => onError(new Error(err.message)),
    )
  } catch {
    return () => {}
  }
}

