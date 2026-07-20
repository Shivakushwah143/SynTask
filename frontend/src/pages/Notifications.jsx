import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Bell, CheckCheck, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { notificationsAPI } from '../api/notifications'
import { Badge, Button, EmptyState, PageHeader, SkeletonCard } from '../components/ui'
import { useAuthStore } from '../store/authStore'

const Notifications = () => {
  const navigate = useNavigate()
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  const handleAuthFailure = useCallback(() => {
    clearAuth()
    toast.error('Session expired. Please login again.')
    navigate('/login', { replace: true })
  }, [clearAuth, navigate])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await notificationsAPI.listNotifications(null, 0, 50)
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread_count || 0)
    } catch (error) {
      if ([401, 403].includes(error?.response?.status)) {
        handleAuthFailure()
        return
      }
      toast.error('Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [handleAuthFailure])

  useEffect(() => {
    load()
  }, [load])

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllAsRead()
      toast.success('All notifications marked as read')
      await load()
    } catch {
      toast.error('Failed to update notifications')
    }
  }

  const handleNotificationClick = async (notification) => {
    try {
      if (!notification.is_read) {
        await notificationsAPI.markAsRead(notification.id)
        setNotifications((current) => current.map((item) => (
          item.id === notification.id ? { ...item, is_read: true } : item
        )))
        setUnreadCount((current) => Math.max(0, current - 1))
      }
      if (notification.action_url) {
        const target = String(notification.action_url)
        if (target.startsWith('/')) {
          navigate(target)
        }
      }
    } catch {
      toast.error('Failed to update notification')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Notifications" description="Department changes, task alerts, and system updates." />
        <SkeletonCard lines={6} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Department changes, task alerts, and system updates."
        actions={unreadCount > 0 ? (
          <Button variant="secondary" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        ) : null}
      />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Unread</p>
          <p className="mt-3 text-3xl font-bold text-gray-900 dark:text-gray-100">{unreadCount}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">This page shows system updates, including department changes.</p>
        </div>

        <div className="space-y-3">
          {notifications.length === 0 ? (
            <EmptyState title="No notifications" description="You are all caught up." icon={Bell} />
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                role="button"
                tabIndex={0}
                onClick={() => handleNotificationClick(notification)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleNotificationClick(notification)
                  }
                }}
                className={`card p-4 ${notification.is_read ? '' : 'border-primary-200 bg-primary-50/40 dark:border-primary-900/40 dark:bg-primary-950/20'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{notification.title}</p>
                      {!notification.is_read ? <Badge label="New" colorKey="info" /> : null}
                      {notification.priority && notification.priority !== 'info' ? (
                        <Badge label={notification.priority} colorKey={notification.priority === 'critical' ? 'urgent' : notification.priority} />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{notification.message}</p>
                    <p className="mt-2 text-xs text-gray-400">
                      {notification.created_at ? format(new Date(notification.created_at), 'MMM d, h:mm a') : 'Recently'}
                    </p>
                  </div>
                  {notification.action_url ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-600">
                      Open <ChevronRight className="h-4 w-4" />
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Notifications
