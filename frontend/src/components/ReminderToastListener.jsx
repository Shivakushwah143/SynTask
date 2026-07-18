import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'
import { notificationsAPI } from '../api/notifications'
import { useAuthStore } from '../store/authStore'

const REMINDER_POLL_MS = 60 * 1000

const playReminderSound = () => {
  if (typeof window === 'undefined') return
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return

  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, context.currentTime)
    oscillator.frequency.setValueAtTime(660, context.currentTime + 0.14)
    gain.gain.setValueAtTime(0.001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.34)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.36)
    oscillator.onended = () => context.close()
  } catch {
    // Browsers can block audio before user interaction. Popup still shows.
  }
}

const getReminderRoute = (notification) => {
  if (notification?.action_url) return notification.action_url
  if (notification?.related_type === 'task' && notification?.related_id) return `/tasks/${notification.related_id}`
  if (notification?.related_type === 'content') return '/content-calendar'
  return '/notifications'
}

const ReminderToastListener = () => {
  const { user, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const shownIdsRef = useRef(new Set())
  const inFlightRef = useRef(false)

  const showReminderToast = useCallback((notification) => {
    shownIdsRef.current.add(notification.id)
    playReminderSound()
    toast.custom(
      (t) => (
        <div
          role="alert"
          className={`w-[min(calc(100vw-1rem),24rem)] rounded-xl border p-4 shadow-2xl ${
            notification.priority === 'critical'
              ? 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-50'
              : 'border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-50'
          }`}
        >
          <div className="flex items-start gap-3">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                toast.dismiss(t.id)
                navigate(getReminderRoute(notification))
              }}
            >
              <p className="text-sm font-semibold">{notification.title || 'Reminder'}</p>
              <p className="mt-1 text-sm leading-5">{notification.message}</p>
            </button>
            <button
              type="button"
              aria-label="Cancel reminder popup"
              title="Cancel"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-current transition hover:bg-black/10 dark:hover:bg-white/10"
              onClick={() => toast.dismiss(t.id)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ),
      { duration: 15000, position: 'top-right' }
    )
  }, [navigate])

  const loadReminderToasts = useCallback(async () => {
    if (!user || !isAuthenticated || inFlightRef.current) return
    inFlightRef.current = true
    try {
      const data = await notificationsAPI.listReminderToasts()
      const notifications = (data?.notifications || []).filter((item) => !shownIdsRef.current.has(item.id))
      notifications.forEach(showReminderToast)
      if (notifications.length) {
        await notificationsAPI.acknowledgeReminderToasts(notifications.map((item) => item.id))
      }
    } catch (error) {
      if (!['ERR_NETWORK', 'ERR_CONNECTION_REFUSED'].includes(error?.code)) {
        console.error('Failed to load reminder toasts:', error)
      }
    } finally {
      inFlightRef.current = false
    }
  }, [isAuthenticated, showReminderToast, user])

  useEffect(() => {
    if (!user || !isAuthenticated) {
      shownIdsRef.current.clear()
      return undefined
    }

    loadReminderToasts()
    const interval = window.setInterval(loadReminderToasts, REMINDER_POLL_MS)
    window.addEventListener('focus', loadReminderToasts)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', loadReminderToasts)
    }
  }, [isAuthenticated, loadReminderToasts, user])

  return null
}

export default ReminderToastListener
