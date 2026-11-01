import { useCallback, useEffect, useState } from 'react'
import {
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToUserNotifications,
} from '../api/notificationRepository'
import type { AppNotification } from '../types'

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchNotifications()
      setNotifications(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load notifications'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    try {
      const unsubscribe = subscribeToUserNotifications(
        (updated) => {
          setNotifications(updated)
          setLoading(false)
        },
        () => {
          // Silently fall back if realtime channel disconnects
        },
      )
      return unsubscribe
    } catch {
      return () => {}
    }
  }, [load])

  const unreadCount = notifications.filter((n) => !n.readAt).length

  const markAsRead = async (id: string) => {
    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt || { toDate: () => new Date(), toMillis: () => Date.now(), isEqual: () => false } as any } : n)),
      )
      await markNotificationAsRead(id)
    } catch {
      await load()
    }
  }

  const markAllAsRead = async () => {
    try {
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || { toDate: () => new Date(), toMillis: () => Date.now(), isEqual: () => false } as any })),
      )
      await markAllNotificationsAsRead()
    } catch {
      await load()
    }
  }

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    refresh: load,
  }
}

