import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  History,
  PauseCircle,
  Play,
  RefreshCw,
  Square,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { attendanceAPI } from '../../api/attendance'
import { Button, Modal, PageHeader, Skeleton } from '../../components/ui'
import { timeService } from '@/services/timeService'
import { useAttendanceStore } from '../../store/attendanceStore'
import { attendanceStatusMeta } from '../../features/attendance/attendanceStatus'

const formatDuration = (totalSeconds) => {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const hrs = Math.floor(s / 3600).toString().padStart(2, '0')
  const mins = Math.floor((s % 3600) / 60).toString().padStart(2, '0')
  const secs = (s % 60).toString().padStart(2, '0')
  return `${hrs}:${mins}:${secs}`
}

const formatClock = (value) => (value ? timeService.formatPattern(value, 'hh:mm a') : '-')
const secondsBetween = (from, to) => Math.max(0, Math.floor((new Date(to) - new Date(from)) / 1000))

const getDisplay = (record, nowMs) => {
  if (!record?.check_in_at) return { work: 0, breakTotal: 0, currentBreak: 0, main: 0 }

  const serverBase = new Date(record.server_time || Date.now()).getTime()
  const receivedAt = record.received_at || Date.now()
  const serverNow = new Date(serverBase + nowMs - receivedAt).toISOString()
  const baseBreak = Math.floor(record.total_break_seconds || 0)

  if (record.status === 'working') {
    const work = secondsBetween(record.check_in_at, serverNow) - baseBreak
    return { work, breakTotal: baseBreak, currentBreak: 0, main: work }
  }

  if (record.status === 'on_break' && record.current_break_started_at) {
    const currentBreak = secondsBetween(record.current_break_started_at, serverNow)
    const work = secondsBetween(record.check_in_at, record.current_break_started_at) - baseBreak
    return { work, breakTotal: baseBreak + currentBreak, currentBreak, main: currentBreak }
  }

  const work = Math.floor(record.total_work_seconds || 0)
  return { work, breakTotal: Math.floor(record.total_break_seconds || 0), currentBreak: 0, main: work }
}

const AttendanceSkeleton = () => (
  <div className="space-y-5 p-4 md:p-6">
    <PageHeader title="Attendance" description="Check in, manage breaks, and track today's working time." />
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-5 w-28" />
      </div>
      <Skeleton className="mx-auto mt-8 h-16 w-64" />
      <Skeleton className="mx-auto mt-3 h-4 w-32" />
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  </div>
)

const Attendance = () => {
  const record = useAttendanceStore((s) => s.record)
  const loading = useAttendanceStore((s) => s.loading)
  const refreshing = useAttendanceStore((s) => s.refreshing)
  const error = useAttendanceStore((s) => s.error)
  const pendingAction = useAttendanceStore((s) => s.pendingAction)
  const initialize = useAttendanceStore((s) => s.initialize)
  const refresh = useAttendanceStore((s) => s.refresh)
  const checkIn = useAttendanceStore((s) => s.checkIn)
  const startBreak = useAttendanceStore((s) => s.startBreak)
  const resumeWork = useAttendanceStore((s) => s.resumeWork)
  const checkOut = useAttendanceStore((s) => s.checkOut)

  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [confirmCheckout, setConfirmCheckout] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [tick, setTick] = useState(Date.now())
  const intervalRef = useRef(null)

  // The store is initialized globally (MainLayout bootstrap) once per session;
  // this is a defensive no-op when it already holds this user's record.
  useEffect(() => {
    initialize()
  }, [initialize])

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true)
      const recent = await attendanceAPI.getMyAttendanceHistory()
      setHistory(recent.data || [])
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    intervalRef.current = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(intervalRef.current)
  }, [])

  const display = useMemo(() => getDisplay(record, tick), [record, tick])
  const meta = attendanceStatusMeta[record?.status] || attendanceStatusMeta.not_checked_in
  const StatusIcon = meta.icon
  const mainTime = formatDuration(display.main)
  const loadError = Boolean(error) && !record

  useEffect(() => {
    const previousTitle = document.title
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    if (!record || record.status === 'not_checked_in') {
      document.title = 'Attendance | SynTask'
      return
    }
    document.title = `${mainTime} - ${meta.title}`
  }, [mainTime, meta.title, record])

  const retryLoad = async () => {
    setRetrying(true)
    try {
      await refresh()
    } finally {
      setRetrying(false)
    }
  }

  // The store performs the mutation and applies the authoritative server
  // response; this page owns the user-facing success/failure toasts.
  const handleCheckIn = async () => {
    try {
      const applied = await checkIn()
      if (!applied) return // another action is already in flight
      toast.success('Checked in successfully')
      loadHistory()
    } catch {
      toast.error("We couldn't check you in. Please try again.")
    }
  }

  const handleStartBreak = async () => {
    try {
      const applied = await startBreak()
      if (!applied) return
      toast.success('Break started')
      loadHistory()
    } catch {
      toast.error("We couldn't start your break. Your attendance is still active.")
    }
  }

  const handleResume = async () => {
    try {
      const applied = await resumeWork()
      if (!applied) return
      toast.success('Work resumed')
      loadHistory()
    } catch {
      toast.error("We couldn't resume your work session. Please try again.")
    }
  }

  const handleCheckout = async () => {
    try {
      const applied = await checkOut()
      if (!applied) return
      toast.success('Checked out successfully')
      setConfirmCheckout(false)
      loadHistory()
    } catch {
      toast.error("We couldn't check you out. Your attendance is still active.")
    }
  }

  const todayActivity = useMemo(() => {
    const entries = []
    if (record?.check_in_at) entries.push({ time: record.check_in_at, label: 'Checked in' })
    if (record?.current_break_started_at && record.status === 'on_break') {
      entries.push({ time: record.current_break_started_at, label: 'Break started' })
    }
    if (record?.check_out_at) entries.push({ time: record.check_out_at, label: 'Checked out' })
    return entries
  }, [record])

  const rows = history.slice(0, 7)

  if (loading && !record) return <AttendanceSkeleton />

  if (loadError) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Attendance" description="Check in, manage breaks, and track today's working time." />
        <div className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-gray-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Attendance could not be loaded.</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Your active attendance has not been changed.</p>
              <Button className="mt-4" variant="secondary" loading={retrying} onClick={retryLoad}>
                <RefreshCw className="h-4 w-4" /> Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader title="Attendance" description="Check in, manage breaks, and track today's working time." />

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${meta.badge}`}>
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
            {meta.label}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            {refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : error ? <AlertCircle className="h-3.5 w-3.5 text-red-500" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            {refreshing ? 'Syncing...' : error ? 'Connection interrupted' : 'Synced just now'}
            {error && (
              <button className="ml-1 font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-300" onClick={retryLoad}>
                Try Again
              </button>
            )}
          </div>
        </div>

        <div className="py-7 text-center md:py-9">
          <div
            className="font-mono text-[clamp(38px,5vw,58px)] font-bold leading-none text-gray-950 [font-variant-numeric:tabular-nums] dark:text-white"
            aria-label={`${meta.timerLabel}: ${mainTime}`}
          >
            {mainTime}
          </div>
          <div className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">{meta.timerLabel}</div>
          {meta.help && <p className="mx-auto mt-3 max-w-md text-sm text-gray-600 dark:text-gray-300">{meta.help}</p>}
        </div>

        <div className="grid gap-3 border-t border-gray-100 pt-4 text-sm dark:border-gray-700 sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Checked in at</div>
            <div className="mt-1 font-medium text-gray-900 dark:text-white">{formatClock(record?.check_in_at)}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Checked out at</div>
            <div className="mt-1 font-medium text-gray-900 dark:text-white">{formatClock(record?.check_out_at)}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Total break time</div>
            <div className="mt-1 font-mono font-medium text-gray-900 dark:text-white">{formatDuration(display.breakTotal)}</div>
          </div>
        </div>

        {record?.status === 'on_break' && (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Worked today: <span className="font-mono font-semibold">{formatDuration(display.work)}</span>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {record?.status === 'not_checked_in' && (
            <Button size="lg" loading={pendingAction === 'check_in'} loadingText="Checking in..." onClick={handleCheckIn} className="w-full sm:w-auto">
              <Play className="h-4 w-4" /> Check In
            </Button>
          )}
          {record?.status === 'working' && (
            <>
              <Button loading={pendingAction === 'start_break'} loadingText="Starting break..." onClick={handleStartBreak} className="w-full sm:w-auto">
                <PauseCircle className="h-4 w-4" /> Start Break
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmCheckout(true)}
                className="w-full border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30 sm:w-auto"
              >
                <Square className="h-4 w-4" /> Check Out
              </Button>
            </>
          )}
          {record?.status === 'on_break' && (
            <>
              <Button loading={pendingAction === 'resume'} loadingText="Resuming..." onClick={handleResume} className="w-full sm:w-auto">
                <Play className="h-4 w-4" /> Resume Work
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmCheckout(true)}
                className="w-full border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30 sm:w-auto"
              >
                <Square className="h-4 w-4" /> Check Out
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <Clock className="h-4 w-4 text-gray-500" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Today's Activity</h2>
        </div>
        <div className="p-4">
          {todayActivity.length ? (
            <div className="space-y-3">
              {todayActivity.map((entry) => (
                <div key={`${entry.time}-${entry.label}`} className="grid grid-cols-[5.5rem_1fr] gap-3 text-sm">
                  <span className="font-mono text-gray-500 dark:text-gray-400">{formatClock(entry.time)}</span>
                  <span className="text-gray-800 dark:text-gray-200">{entry.label}</span>
                </div>
              ))}
              {record?.status === 'working' && <div className="text-sm text-gray-500 dark:text-gray-400">Current session: Working</div>}
              {record?.status === 'on_break' && <div className="text-sm text-gray-500 dark:text-gray-400">Current session: On break</div>}
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">No activity recorded for today yet.</div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Recent Attendance</h2>
          </div>
          <a href="/attendance/reports" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-300">View attendance history</a>
        </div>
        {historyLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length ? (
          <div className="overflow-hidden">
            <div className="hidden grid-cols-6 gap-3 border-b border-gray-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:border-gray-700 md:grid">
              <div>Date</div>
              <div>Check In</div>
              <div>Check Out</div>
              <div>Break</div>
              <div>Work Time</div>
              <div>Status</div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {rows.map((item) => (
                <div key={item.id} className="grid gap-2 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 md:grid-cols-6">
                  <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    <Calendar className="h-4 w-4 text-gray-400 md:hidden" />
                    {timeService.formatDateOnly(item.date || item.attendance_date)}
                  </div>
                  <div><span className="md:hidden">Check In: </span>{formatClock(item.check_in_at || item.login_time)}</div>
                  <div><span className="md:hidden">Check Out: </span>{formatClock(item.check_out_at || item.logout_time)}</div>
                  <div className="font-mono"><span className="font-sans md:hidden">Break: </span>{formatDuration(item.total_break_seconds ?? item.break_duration)}</div>
                  <div className="font-mono"><span className="font-sans md:hidden">Work: </span>{formatDuration(item.total_work_seconds ?? item.total_working_hours)}</div>
                  <div>{attendanceStatusMeta[item.status]?.label || (item.check_out_at || item.logout_time ? 'Day Completed' : 'Working')}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 p-4">
            <History className="mt-0.5 h-5 w-5 text-gray-400" />
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">No attendance records yet</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your completed attendance days will appear here.</p>
            </div>
          </div>
        )}
      </section>

      <Modal
        isOpen={confirmCheckout}
        onClose={() => setConfirmCheckout(false)}
        title="Check out for today?"
        description="Your attendance will be saved with the current server time."
        size="sm"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setConfirmCheckout(false)} disabled={pendingAction === 'checkout'}>Cancel</Button>
            <Button variant="danger" loading={pendingAction === 'checkout'} loadingText="Checking out..." onClick={handleCheckout}>
              Confirm Check Out
            </Button>
          </div>
        )}
      >
        <div className="space-y-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-gray-400">Net working time</span>
            <span className="font-mono font-semibold text-gray-900 dark:text-white">{formatDuration(display.work)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500 dark:text-gray-400">Total break time</span>
            <span className="font-mono font-semibold text-gray-900 dark:text-white">{formatDuration(display.breakTotal)}</span>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Attendance
