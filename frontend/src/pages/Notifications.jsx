import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns'
import { Bell, CheckCheck, ChevronRight, BellRing, BellOff, Clock, AlertCircle, Info, CheckCircle2, AlertTriangle, Mail, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { notificationsAPI } from '../api/notifications'
import { Badge, Button, EmptyState, PageHeader, SkeletonCard } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { timeService } from '@/services/timeService'

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

// Notification Item Component
const NotificationItem = ({ notification, onMarkRead, onClick }) => {
  const [isHovered, setIsHovered] = useState(false)
  
  const getPriorityColor = (priority) => {
    const colors = {
      critical: 'border-rose-400 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30',
      high: 'border-orange-400 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30',
      medium: 'border-amber-400 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30',
      low: 'border-blue-400 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30',
      info: 'border-indigo-400 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30',
    }
    return colors[priority] || colors.info
  }

  const getPriorityIcon = (priority) => {
    const icons = {
      critical: AlertTriangle,
      high: AlertCircle,
      medium: Info,
      low: CheckCircle2,
      info: Bell,
    }
    return icons[priority] || Bell
  }

  const getPriorityLabel = (priority) => {
    const labels = {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      info: 'Info',
    }
    return labels[priority] || 'Info'
  }

  const PriorityIcon = getPriorityIcon(notification.priority)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(notification)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick(notification)
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative overflow-hidden rounded-xl border-l-4 transition-all duration-200 ${
        notification.is_read 
          ? 'border-gray-200 bg-white hover:bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-800/80' 
          : getPriorityColor(notification.priority)
      } ${isHovered ? 'shadow-md' : 'shadow-sm'}`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {!notification.is_read && (
                <span className="inline-flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              )}
              <p className={`font-semibold text-gray-900 dark:text-white ${
                notification.is_read ? '' : 'text-indigo-700 dark:text-indigo-300'
              }`}>
                {notification.title}
              </p>
              {notification.priority && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  notification.priority === 'critical' 
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : notification.priority === 'high'
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                    : notification.priority === 'medium'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                }`}>
                  <PriorityIcon className="h-3 w-3" />
                  {getPriorityLabel(notification.priority)}
                </span>
              )}
              {!notification.is_read && (
                <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  New
                </span>
              )}
            </div>
            
            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {notification.message}
            </p>
            
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                <Clock className="inline h-3 w-3 mr-1" />
                {notification.created_at ? timeService.formatShortDateTime(notification.created_at) : 'Recently'}
              </span>
              {notification.source && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  <Mail className="inline h-3 w-3 mr-1" />
                  {notification.source}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            {notification.action_url && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">
                Open <ChevronRight className="h-4 w-4" />
              </span>
            )}
            {!notification.is_read && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkRead(notification)
                }}
                className="rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
              >
                Mark read
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

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

  const markAsRead = async (notification) => {
    try {
      await notificationsAPI.markAsRead(notification.id)
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )))
      setUnreadCount((current) => Math.max(0, current - 1))
    } catch {
      toast.error('Failed to update notification')
    }
  }

  const handleNotificationClick = async (notification) => {
    try {
      if (!notification.is_read) {
        await markAsRead(notification)
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

  // Calculate stats
  const totalNotifications = notifications.length
  const readCount = notifications.filter(n => n.is_read).length
  const criticalCount = notifications.filter(n => n.priority === 'critical').length
  const highPriorityCount = notifications.filter(n => n.priority === 'high').length

  if (loading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading notifications...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-600 via-red-600 to-orange-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <BellRing className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Notifications</h1>
                <p className="mt-1 text-indigo-100">Department changes, task alerts, and system updates.</p>
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total"
          value={totalNotifications}
          icon={Bell}
          color="indigo"
          subtitle="All notifications"
        />
        <StatCard
          label="Unread"
          value={unreadCount}
          icon={BellRing}
          color="emerald"
          subtitle="Awaiting review"
        />
        <StatCard
          label="Critical"
          value={criticalCount}
          icon={AlertTriangle}
          color="rose"
          subtitle="Urgent attention"
        />
        <StatCard
          label="High Priority"
          value={highPriorityCount}
          icon={Zap}
          color="amber"
          subtitle="Important"
        />
      </div>

      {/* Notifications List */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Sidebar */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
              <Bell className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Summary</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Quick overview</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Unread</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">{unreadCount}</span>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Read</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">{readCount}</span>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Priority</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">{criticalCount + highPriorityCount}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This page shows system updates, including department changes and task alerts.
            </p>
          </div>
        </div>

        {/* Notifications List */}
        <div className="space-y-3">
          {notifications.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-700">
                <BellOff className="h-10 w-10 text-gray-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">All caught up!</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">You have no notifications at the moment.</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={markAsRead}
                onClick={handleNotificationClick}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Notifications
