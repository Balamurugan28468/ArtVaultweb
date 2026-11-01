import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { NotificationsPage } from './NotificationsPage'

const useNotifications = vi.fn()
vi.mock('@/features/notifications', () => ({
  useNotifications: () => useNotifications(),
  NotificationList: () => <div data-testid="notification-list">Notification List Component</div>,
}))

describe('NotificationsPage', () => {
  it('renders notifications dashboard with title and list', () => {
    useNotifications.mockReturnValue({
      notifications: [
        {
          id: 'n1',
          userId: 'u1',
          kind: 'ORDER_STATUS',
          title: 'Order Delivered',
          body: 'Artwork delivered safely.',
          readAt: null,
          createdAt: { toDate: () => new Date(), toMillis: () => Date.now(), isEqual: () => false },
        },
      ],
      unreadCount: 1,
      loading: false,
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      refresh: vi.fn(),
    })

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(screen.getByTestId('notification-list')).toBeInTheDocument()
  })
})
