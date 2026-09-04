import { useEffect, useRef } from 'react'
import { useAttendanceStore } from '../../store/attendanceStore'
import { useAuthStore } from '../../store/authStore'

const REFRESH_DEBOUNCE_MS = 250
// Periodic silent refresh so newly-synced attendance (e.g. an eTimeOffice
// biometric record appearing for today) is picked up without a page reload.
const POLL_INTERVAL_MS = 60 * 1000

/**
 * Mounted once per authenticated layout. Owns the attendance store lifecycle:
 *  - fetches `/attendance/me/today` once after the user enters the app,
 *  - resets state on logout / user switch,
 *  - silently refreshes when the window regains focus or the tab becomes
 *    visible again (debounced so focus + visibility events produce one call).
 * Renders nothing.
 */
export function AttendanceStatusBootstrap() {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const initialize = useAttendanceStore((s) => s.initialize)
  const refresh = useAttendanceStore((s) => s.refresh)
  const reset = useAttendanceStore((s) => s.reset)
  const debounceRef = useRef(null)

  // Initialize once per authenticated session; the store itself guards against
  // duplicate fetches and resets stale state when the user changes.
  useEffect(() => {
    if (!isAuthenticated || !userId) {
      reset()
      return
    }
    initialize()
  }, [userId, isAuthenticated, initialize, reset])

  // Refresh on focus/visibility (debounced + auth-guarded). Never toasts.
  useEffect(() => {
    const scheduleRefresh = () => {
      if (!useAuthStore.getState().isAuthenticated) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        useAttendanceStore.getState().refresh({ silent: true })
      }, REFRESH_DEBOUNCE_MS)
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefresh()
    }

    window.addEventListener('focus', scheduleRefresh)
    document.addEventListener('visibilitychange', handleVisibility)
    const pollId = window.setInterval(() => {
      if (!useAuthStore.getState().isAuthenticated) return
      useAttendanceStore.getState().refresh({ silent: true })
    }, POLL_INTERVAL_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      window.clearInterval(pollId)
      window.removeEventListener('focus', scheduleRefresh)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return null
}
