import { describe, expect, it, vi } from 'vitest'

const { createClient, queryBuilder } = vi.hoisted(() => {
  const sampleNotification = {
    id: 'n1',
    user_id: 'u1',
    kind: 'order_status',
    title: 'Order Confirmed',
    body: 'Your artwork order #101 is being prepared.',
    read_at: null,
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
  }

  const queryBuilder = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  }
  queryBuilder.select.mockReturnValue(queryBuilder)
  queryBuilder.eq.mockReturnValue(queryBuilder)
  queryBuilder.is.mockReturnValue(queryBuilder)
  queryBuilder.order.mockReturnValue(queryBuilder)
  queryBuilder.limit.mockResolvedValue({ data: [sampleNotification], error: null })
  queryBuilder.insert.mockResolvedValue({ data: null, error: null })
  queryBuilder.update.mockReturnValue(queryBuilder)
  queryBuilder.delete.mockReturnValue(queryBuilder)
  queryBuilder.single.mockReturnValue(queryBuilder)
  queryBuilder.maybeSingle.mockReturnValue(queryBuilder)

  return {
    createClient: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    })),
    queryBuilder,
  }
})

vi.mock('@/lib/supabase/client', () => ({ createClient }))

const {
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} = await import('./notificationRepository')

describe('notificationRepository', () => {
  it('fetchNotifications returns mapped notifications', async () => {
    const notifications = await fetchNotifications()
    expect(notifications).toHaveLength(1)
    expect(notifications[0].title).toBe('Order Confirmed')
    expect(notifications[0].kind).toBe('ORDER_STATUS')
    expect(notifications[0].readAt).toBeNull()
  })

  it('markNotificationAsRead executes update query for single notification', async () => {
    queryBuilder.eq.mockResolvedValueOnce({ data: null, error: null })
    await expect(markNotificationAsRead('n1')).resolves.not.toThrow()
  })

  it('markAllNotificationsAsRead executes update query for all unread', async () => {
    queryBuilder.is.mockResolvedValueOnce({ data: null, error: null })
    await expect(markAllNotificationsAsRead()).resolves.not.toThrow()
  })
})
