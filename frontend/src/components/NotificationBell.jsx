import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { notificationsAPI } from '../api/notifications'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const NotificationBell = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const dropdownRef = useRef(null)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const previousNotificationsRef = useRef([])
  const hasShownInitialPopupsRef = useRef(false) // Track if we've shown initial login popups
  const lastFetchTimeRef = useRef(null) // Track when we last fetched to detect new notifications
  const lastNotificationIdsRef = useRef(new Set()) // Track notification IDs we've already shown popups for
  const isMountedRef = useRef(false) // Track if component is mounted

  // Determine navigation route based on notification
  const getNotificationRoute = useCallback((notification) => {
    // If action_url exists, use it (remove leading slash if present for React Router)
    if (notification.action_url) {
      // Convert action_url to React Router path
      const path = notification.action_url.startsWith('/') 
        ? notification.action_url.substring(1) 
        : notification.action_url
      return path
    }

    // Build route from related_type and related_id
    if (notification.related_type && notification.related_id) {
      const type = notification.related_type.toLowerCase()
      switch (type) {
        case 'task':
          return `tasks` // Will open task modal
        case 'ticket':
          return `tickets` // Will open ticket modal
        case 'project':
          return `projects` // Will open project modal
        case 'chat_message':
          return `chat`
        case 'user':
          return `users`
        default:
          return null
      }
    }

    // Fallback based on notification type
    const notifType = notification.type?.toLowerCase() || ''
    if (notifType.includes('task')) {
      return 'tasks'
    } else if (notifType.includes('ticket')) {
      return 'tickets'
    } else if (notifType.includes('project')) {
      return 'projects'
    } else if (notifType.includes('message')) {
      return 'chat'
    }

    return null
  }, [])

  const handleNotificationClick = useCallback(async (notification) => {
    // Mark as read if unread
    if (!notification.is_read) {
      try {
        await notificationsAPI.markAsRead(notification.id)
        // Refresh notifications after marking as read
        const data = await notificationsAPI.listNotifications(null, 0, 10)
        setNotifications(data.notifications || [])
        setUnreadCount(data.unread_count || 0)
      } catch (error) {
        console.error('Error marking notification as read:', error)
      }
    }

    // Close dropdown
    setShowDropdown(false)

    // Navigate to the appropriate page
    const route = getNotificationRoute(notification)
    if (route) {
      navigate(`/${route}`)
      
      // If we have a related_id, store it so the page can open the detail modal
      if (notification.related_id && notification.related_type) {
        const relatedType = notification.related_type.toLowerCase()
        // Store the related_id in sessionStorage so the page can open the modal
        if (relatedType === 'chat_message') {
          // For chat messages, store conversation_id if available in action_url
          if (notification.action_url) {
            const urlParams = new URLSearchParams(notification.action_url.split('?')[1])
            const conversationId = urlParams.get('conversation')
            if (conversationId) {
              sessionStorage.setItem('open_conversation_id', conversationId)
            }
          }
        } else {
          sessionStorage.setItem(`open_${relatedType}_id`, notification.related_id)
        }
      }
    } else {
      // If no route, just close the dropdown
      console.log('No route found for notification:', notification)
    }
  }, [navigate, getNotificationRoute])

  const fetchNotifications = useCallback(async (isInitialLoad = false, skipPopups = false) => {
    try {
      const data = await notificationsAPI.listNotifications(null, 0, 10)
      const newNotifications = data.notifications || []
      const newUnreadCount = data.unread_count || 0
      
      // Check for new notifications and show popup
      const previousNotifications = previousNotificationsRef.current
      const now = new Date()
      // Only show popups if not explicitly skipped (e.g., when marking as read)
      if (!skipPopups && isMountedRef.current) {
        if (isInitialLoad && !hasShownInitialPopupsRef.current) {
          // On initial load (login), show popups for all unread notifications
          const unreadNotifs = newNotifications.filter(n => !n.is_read)
          if (unreadNotifs.length > 0) {
            unreadNotifs.forEach(notif => {
              // Mark this notification ID as shown
              lastNotificationIdsRef.current.add(notif.id)
              
              // Show toast notification with click handler
              toast(
                (t) => (
                  <div 
                    className="w-full cursor-pointer"
                    onClick={() => {
                      toast.dismiss(t.id)
                      handleNotificationClick(notif)
                    }}
                  >
                    <p className="font-semibold text-sm text-gray-900">{notif.title}</p>
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">{notif.message}</p>
                  </div>
                ),
                {
                  duration: 5000,
                  position: 'top-right',
                }
              )
            })
            hasShownInitialPopupsRef.current = true
          }
        } else if (!isInitialLoad && lastFetchTimeRef.current) {
          // On subsequent loads (polling), only show popups for truly NEW notifications
          // that were created AFTER the last fetch time
          const previousIds = new Set(previousNotifications.map(n => n.id))
          const lastFetchTime = lastFetchTimeRef.current
          
          const newNotifs = newNotifications.filter(n => {
            // Only show popup if:
            // 1. It's a new notification (not in previous list)
            // 2. It's unread
            // 3. It was created AFTER the last fetch time (truly new)
            // 4. We haven't shown a popup for this notification ID before
            const isNew = !previousIds.has(n.id)
            const isUnread = !n.is_read
            const createdAt = new Date(n.created_at)
            const isCreatedAfterLastFetch = createdAt > lastFetchTime
            const notShownBefore = !lastNotificationIdsRef.current.has(n.id)
            
            return isNew && isUnread && isCreatedAfterLastFetch && notShownBefore
          })
          
          // Show popup for each new notification
          newNotifs.forEach(notif => {
            // Mark this notification ID as shown
            lastNotificationIdsRef.current.add(notif.id)
            
            // Show toast notification with click handler
            toast(
              (t) => (
                <div 
                  className="w-full cursor-pointer"
                  onClick={() => {
                    toast.dismiss(t.id)
                    handleNotificationClick(notif)
                  }}
                >
                  <p className="font-semibold text-sm text-gray-900">{notif.title}</p>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">{notif.message}</p>
                </div>
              ),
              {
                duration: 5000,
                position: 'top-right',
              }
            )
          })
        }
      }
      
      setNotifications(newNotifications)
      setUnreadCount(newUnreadCount)
      previousNotificationsRef.current = newNotifications
      lastFetchTimeRef.current = now
      
      // Clean up old notification IDs from the tracking set (keep only current ones)
      // This prevents memory leak and ensures we don't track too many IDs
      const idsToKeep = new Set(newNotifications.map(n => n.id))
      lastNotificationIdsRef.current = new Set(
        Array.from(lastNotificationIdsRef.current).filter(id => idsToKeep.has(id))
      )
    } catch (error) {
      // Only log error if it's not a connection refused error (server not running)
      if (error.code !== 'ERR_NETWORK' && error.code !== 'ERR_CONNECTION_REFUSED') {
        console.error('Error fetching notifications:', error)
      }
      // Silently fail if server is not running - don't spam console
    }
  }, [handleNotificationClick])

  useEffect(() => {
    // Only reset and show initial popups when user actually changes (login)
    if (user && !isMountedRef.current) {
      // First time mounting with a user (login)
      isMountedRef.current = true
      hasShownInitialPopupsRef.current = false
      lastNotificationIdsRef.current.clear()
      lastFetchTimeRef.current = null
      
      // Initial load - show all unread notifications as popups
      fetchNotifications(true)
    } else if (!user) {
      // User logged out - reset everything
      isMountedRef.current = false
      hasShownInitialPopupsRef.current = false
      lastNotificationIdsRef.current.clear()
      lastFetchTimeRef.current = null
    }
    
    // Poll for new notifications every 10 seconds (only if user is logged in)
    let interval = null
    if (user && isMountedRef.current) {
      interval = setInterval(() => {
        // Only fetch if component is still mounted and user is logged in
        if (isMountedRef.current && user) {
          fetchNotifications(false, false)
        }
      }, 10000)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [fetchNotifications, user]) // Re-run when user changes (login/logout)

  // Close dropdown when route changes (but don't trigger popups)
  useEffect(() => {
    setShowDropdown(false)
    // Don't fetch notifications on route change - this prevents popups when navigating
  }, [location.pathname])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  const handleMarkAllAsRead = async () => {
    try {
      setLoading(true)
      await notificationsAPI.markAllAsRead()
      toast.success('All notifications marked as read')
      // Skip popups when manually marking all as read
      await fetchNotifications(false, true)
    } catch (error) {
      toast.error('Failed to mark all as read')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowDropdown(!showDropdown)
        }}
        className="relative rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={showDropdown}
      >
        <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" aria-hidden="true"></span>
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white" aria-hidden="true">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
          <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={loading}
                className="text-xs text-primary-600 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-primary-300"
                aria-label="Mark all notifications as read"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                No notifications
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`cursor-pointer p-4 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    !notif.is_read ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                  }`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {notif.title}
                      </p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        {notif.message}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {format(new Date(notif.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    {!notif.is_read && (
                    <div className="ml-2 mt-1 h-2 w-2 rounded-full bg-primary-600" aria-hidden="true"></div>
                  )}
                </div>
              </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
