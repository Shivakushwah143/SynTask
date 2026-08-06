import { create } from 'zustand'
import { attendanceAPI } from '../api/attendance'
import { extractAttendanceRecord, normalizeAttendanceStatus } from '../features/attendance/attendanceStatus'
import { useAuthStore } from './authStore'

const SYNC_CHANNEL_NAME = 'syntask:attendance'
const ATTENDANCE_CHANGED = 'attendance-changed'
// Lightweight cross-tab fallback signal. It stores a ping timestamp only —
// never the attendance record — so the server response remains authoritative.
const SYNC_STORAGE_KEY = 'syntask:attendance-sync'

// Module-scoped concurrency guards shared by every subscriber of the store.
let refreshPromise = null // dedupe concurrent refreshes into a single request
let mutationSequence = 0 // stale-response protection: mutations always win

const isAuthenticated = () => useAuthStore.getState().isAuthenticated
const currentUserId = () => useAuthStore.getState().user?.id ?? null

function createSyncChannel() {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') return null
  try {
    return new window.BroadcastChannel(SYNC_CHANNEL_NAME)
  } catch {
    return null
  }
}

export const useAttendanceStore = create((set, get) => ({
  record: null,
  status: null,
  loading: false,
  refreshing: false,
  initialized: false,
  error: null,
  pendingAction: null,
  lastSyncedAt: null,
  userId: null,

  // ── internal helpers ──────────────────────────────────────────────────────
  applyRecord: (response) => {
    const record = extractAttendanceRecord(response)
    set((state) => ({
      record,
      status: record ? normalizeAttendanceStatus(record.status) : null,
      initialized: true,
      error: null,
      lastSyncedAt: Date.now(),
      userId: state.userId ?? currentUserId(),
    }))
    return record
  },

  publishSync: () => {
    const channel = get().syncChannel
    const userId = currentUserId()
    if (channel) {
      try {
        channel.postMessage({ type: ATTENDANCE_CHANGED, userId })
      } catch {
        // Channel may be closed during logout; best effort only.
      }
    } else {
      // BroadcastChannel unavailable → use the storage-event fallback. This is
      // a ping (not the record) and is only read by other tabs in this browser.
      try {
        window.localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ userId, at: Date.now() }))
      } catch {
        // Storage may be unavailable (private mode); best effort only.
      }
    }
  },

  startSync: () => {
    get().stopSync()
    if (typeof window === 'undefined') return

    const channel = createSyncChannel()
    if (channel) {
      channel.onmessage = (event) => {
        const message = event?.data
        if (!message || message.type !== ATTENDANCE_CHANGED) return
        if (message.userId && message.userId !== currentUserId()) return
        // Silently re-sync this tab with the authoritative server response.
        get().refresh({ silent: true })
      }
      set({ syncChannel: channel })
      return
    }

    const onStorage = (event) => {
      if (event.key !== SYNC_STORAGE_KEY) return
      try {
        const data = JSON.parse(event.newValue || 'null')
        if (data && data.userId && data.userId !== currentUserId()) return
      } catch {
        // Malformed ping — treat as a generic change signal.
      }
      get().refresh({ silent: true })
    }
    window.addEventListener('storage', onStorage)
    set({ syncChannel: null, syncStorageListener: onStorage })
  },

  stopSync: () => {
    const { syncChannel, syncStorageListener } = get()
    if (syncChannel) {
      try {
        syncChannel.close()
      } catch {
        // Already closed.
      }
    }
    if (syncStorageListener && typeof window !== 'undefined') {
      window.removeEventListener('storage', syncStorageListener)
    }
    set({ syncChannel: null, syncStorageListener: null })
  },

  // ── public API ────────────────────────────────────────────────────────────
  /**
   * Initialize attendance state for the authenticated session. Safe to call
   * from multiple mounts/layouts: it only fetches once per user and resets
   * any previous user's state before fetching.
   */
  initialize: async () => {
    if (!isAuthenticated()) {
      get().reset()
      return
    }
    const userId = currentUserId()
    const state = get()
    if (state.initialized && state.userId === userId) return
    if (state.userId && state.userId !== userId) get().reset()

    set({ userId, loading: true, error: null })
    get().startSync()
    try {
      await get().refresh({ silent: false })
    } finally {
      set({ loading: false })
    }
  },

  /**
   * Fetch today's attendance. `silent` refreshes (focus/visibility/cross-tab)
   * never surface toasts — the store never toasts; the Attendance page owns
   * user-facing notifications. A failed refresh keeps the last valid record
   * and only exposes an `error` state.
   */
  refresh: async ({ silent = false } = {}) => {
    if (!isAuthenticated()) return
    if (refreshPromise) return refreshPromise

    const sequenceAtStart = mutationSequence
    const userIdAtStart = currentUserId()
    refreshPromise = (async () => {
      set({ refreshing: true })
      try {
        const response = await attendanceAPI.getTodayAttendance()
        // A mutation completed while this request was in flight → discard the
        // now-stale result so a slow fetch can never overwrite a newer status.
        if (mutationSequence !== sequenceAtStart) return
        // The authenticated user changed mid-flight → never apply another
        // user's record to this session.
        if (userIdAtStart !== currentUserId()) return
        get().applyRecord(response)
      } catch (err) {
        set((state) => ({
          // Keep the last valid record (if any); expose the error for UI states.
          error: err?.response?.data?.detail || err?.message || 'Attendance unavailable',
          initialized: true,
        }))
      } finally {
        refreshPromise = null
        set({ refreshing: false })
      }
    })()
    return refreshPromise
  },

  /**
   * Run a single attendance mutation. Guards against concurrent mutations
   * (double-clicks / overlapping actions), applies the authoritative server
   * response immediately, and notifies other tabs. Returns the updated record
   * on success, `undefined` when skipped because another action is pending,
   * and re-throws failures so the Attendance page can show toasts.
   */
  runMutation: async (actionKey, apiAction) => {
    const state = get()
    if (state.pendingAction) return undefined
    if (!isAuthenticated()) {
      const error = new Error('Not authenticated')
      throw error
    }

    set({ pendingAction: actionKey, error: null })
    try {
      const response = await apiAction()
      mutationSequence += 1
      const record = get().applyRecord(response)
      get().publishSync()
      return record
    } catch (err) {
      // Preserve the last valid record on failure; let the page surface the error.
      throw err
    } finally {
      set({ pendingAction: null })
    }
  },

  checkIn: () => get().runMutation('check_in', () => attendanceAPI.checkIn()),
  startBreak: () => get().runMutation('start_break', () => attendanceAPI.startBreak()),
  resumeWork: () => get().runMutation('resume', () => attendanceAPI.endBreak()),
  checkOut: () => get().runMutation('checkout', () => attendanceAPI.checkOut()),

  /**
   * Replace the current record with a normalized one. Used by the Attendance
   * page flow and tests; keeps the navbar in lock-step with the page.
   */
  setRecord: (record) => get().applyRecord(record),

  /** Clear all attendance state (logout / user switch). */
  reset: () => {
    get().stopSync()
    refreshPromise = null
    set({
      record: null,
      status: null,
      loading: false,
      refreshing: false,
      initialized: false,
      error: null,
      pendingAction: null,
      lastSyncedAt: null,
      userId: null,
    })
  },
}))
