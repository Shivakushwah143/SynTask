// SynTask v3.0 — Inbox unread counts for the sidebar (Phase 6, spec §10.3).
// Component-scoped polling that reuses the existing notifications + Meta inbox
// APIs. Deliberately does NOT dispatch app-wide refresh events: badge updates
// must never cascade re-fetches on other pages (see NotificationBell history).
import { useEffect, useState } from 'react'
import { notificationsAPI } from '../api/notifications'
import { metaInboxApi } from '../api/metaInbox'
import { useAuthStore } from '../store/authStore'

const POLL_INTERVAL_MS = 30_000

const unwrap = (value) => value?.data || value || { items: [] }

const sumUnread = (items, channel) =>
  items
    .filter((item) => !channel || item.channel === channel)
    .reduce((sum, item) => sum + Number(item.unread_count || 0), 0)

// Pure aggregator — exported for unit tests.
export const computeInboxCounts = (conversationItems = [], notificationsUnread = 0) => {
  const whatsapp = sumUnread(conversationItems, 'whatsapp')
  const instagram = sumUnread(conversationItems, 'instagram')
  const messenger = sumUnread(conversationItems, 'messenger')
  const metaTotal = sumUnread(conversationItems, null)
  const notifications = Number(notificationsUnread) || 0
  return {
    whatsapp,
    instagram,
    messenger,
    metaTotal,
    notifications,
    total: metaTotal + notifications,
  }
}

export const useInboxUnreadCounts = () => {
  const { user, isAuthenticated } = useAuthStore()
  const companyId = user?.role === 'super_admin' ? user?.company_id : undefined
  const [counts, setCounts] = useState(() => computeInboxCounts())

  useEffect(() => {
    if (!user || !isAuthenticated) return undefined
    let cancelled = false

    const fetchCounts = async () => {
      // Promise.allSettled never rejects; each source's failure is handled by its status.
      const [notificationsResult, conversationsResult] = await Promise.allSettled([
        notificationsAPI.listNotifications(null, 0, 1),
        metaInboxApi.getConversations({ companyId }),
      ])
      if (cancelled) return

      const notificationsUnread = notificationsResult.status === 'fulfilled'
        ? Number(notificationsResult.value?.unread_count || 0)
        : 0
      const items = conversationsResult.status === 'fulfilled'
        ? (unwrap(conversationsResult.value).items || [])
        : []
      setCounts(computeInboxCounts(items, notificationsUnread))
    }

    void fetchCounts()
    const interval = setInterval(() => {
      // Pause polling while the tab is hidden — background tabs must not keep
      // hitting /notifications + Meta inbox APIs every 30s.
      if (document.hidden) return
      void fetchCounts()
    }, POLL_INTERVAL_MS)

    // One catch-up fetch when the tab becomes visible again (the interval
    // above only ticks while visible, so the badge refreshes on return).
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !document.hidden) void fetchCounts()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [user, isAuthenticated, companyId])

  return counts
}
