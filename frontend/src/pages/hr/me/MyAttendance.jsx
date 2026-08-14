import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Coffee,
  FileWarning,
  LogIn,
  LogOut,
  Play,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { useAttendanceStore } from '../../../store/attendanceStore'
import { attendanceAPI } from '../../../api/attendance'
import { useMyAttendanceHistory, useMyAttendanceToday, useMyCorrections } from '../../../hooks/useMyHr'
import { Button, EmptyState, FormField, Modal, Skeleton, inputClassName } from '../../../components/ui'
import { HR_STATUS_META, attendanceStatusMeta, getAttendanceMeta } from '../../../features/attendance/attendanceStatus'
import {
  CORRECTION_STATUS_BADGES,
  CORRECTION_TYPE_LABELS,
  formatDate,
  formatDuration,
  formatTime,
} from './myHrUtils'

const MyAttendance = () => {
  // Single source of truth — the same store the navbar pill reads, so the
  // navbar status stays in lock-step with every action here.
  const record = useAttendanceStore((state) => state.record)
  const status = useAttendanceStore((state) => state.status)
  const initialized = useAttendanceStore((state) => state.initialized)
  const loading = useAttendanceStore((state) => state.loading)
  const pendingAction = useAttendanceStore((state) => state.pendingAction)
  const initialize = useAttendanceStore((state) => state.initialize)
  const checkIn = useAttendanceStore((state) => state.checkIn)
  const startBreak = useAttendanceStore((state) => state.startBreak)
  const resumeWork = useAttendanceStore((state) => state.resumeWork)
  const checkOut = useAttendanceStore((state) => state.checkOut)

  const { data: todayEnhanced, isLoading: enhancedLoading } = useMyAttendanceToday()
  const { data: history, isLoading: historyLoading, isError: historyError, refetch: refetchHistory } = useMyAttendanceHistory()
  const { data: correctionsData, isLoading: correctionsLoading, refetch: refetchCorrections } = useMyCorrections()

  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [submittingCorrection, setSubmittingCorrection] = useState(false)

  useEffect(() => {
    initialize()
  }, [initialize])

  const runAction = async (action, message) => {
    try {
      await action()
      toast.success(message)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Attendance action failed')
    }
  }

  const meta = getAttendanceMeta(status)
  const todayStatus = todayEnhanced?.hr_status
  const hrMeta = HR_STATUS_META[todayStatus] || HR_STATUS_META.no_record
  const corrections = correctionsData?.items || []
  const busy = Boolean(pendingAction)

  return (
    <div className="space-y-5">
      {/* Today */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <Clock className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Today's Attendance</h3>
          </div>
          {enhancedLoading ? (
            <Skeleton className="h-6 w-28" />
          ) : (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${hrMeta.badge}`}>
              <hrMeta.icon className="h-3.5 w-3.5" /> {hrMeta.label}
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
            <p className="text-xs text-gray-400">Status</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-white">{meta.label}</p>
            {record?.is_late ? <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">Late arrival</p> : null}
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
            <p className="text-xs text-gray-400">Check-in</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-white">{formatTime(record?.check_in_at)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
            <p className="text-xs text-gray-400">Check-out</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-white">{formatTime(record?.check_out_at)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-900/50">
            <p className="text-xs text-gray-400">Net Working Time</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-white">{formatDuration(record?.total_work_seconds)}</p>
            <p className="mt-0.5 text-xs text-gray-400">Break: {formatDuration(record?.total_break_seconds)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!record || status === 'not_checked_in' ? (
            <Button onClick={() => runAction(checkIn, 'Checked in')} loading={busy} loadingText="Checking in…">
              <LogIn className="mr-2 h-4 w-4" /> Check In
            </Button>
          ) : null}
          {status === 'working' ? (
            <>
              <Button variant="secondary" onClick={() => runAction(startBreak, 'Break started')} loading={busy} loadingText="Starting break…">
                <Coffee className="mr-2 h-4 w-4" /> Start Break
              </Button>
              <Button onClick={() => runAction(checkOut, 'Checked out')} loading={busy} loadingText="Checking out…">
                <LogOut className="mr-2 h-4 w-4" /> Check Out
              </Button>
            </>
          ) : null}
          {status === 'on_break' ? (
            <>
              <Button onClick={() => runAction(resumeWork, 'Break ended')} loading={busy} loadingText="Resuming…">
                <Play className="mr-2 h-4 w-4" /> End Break
              </Button>
              <Button variant="secondary" onClick={() => runAction(checkOut, 'Checked out')} loading={busy} loadingText="Checking out…">
                <LogOut className="mr-2 h-4 w-4" /> Check Out
              </Button>
            </>
          ) : null}
          {status === 'checked_out' ? (
            <p className="inline-flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" /> Your attendance has been saved for today.
            </p>
          ) : null}
        </div>
      </section>

      {/* Corrections */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <FileWarning className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Attendance Corrections</h3>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCorrectionOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Request Correction
          </Button>
        </div>
        {correctionsLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : corrections.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No attendance corrections submitted.</p>
        ) : (
          <div className="space-y-2">
            {corrections.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {CORRECTION_TYPE_LABELS[item.correction_type] || item.correction_type} · {formatDate(item.attendance_date)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{item.reason}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CORRECTION_STATUS_BADGES[item.status] || ''}`}>
                    {item.status}
                  </span>
                  {item.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await attendanceAPI.cancelCorrection(item.id)
                          toast.success('Correction request cancelled')
                          refetchCorrections()
                        } catch (err) {
                          toast.error(err?.response?.data?.detail || 'Failed to cancel correction')
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <CalendarDays className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Attendance History</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetchHistory()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh</Button>
        </div>
        {historyLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : historyError ? (
          <EmptyState icon={AlertCircle} title="Unable to load attendance history" description="Please try again in a moment." />
        ) : !history || history.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No attendance records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400 dark:border-gray-700">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Check In</th>
                  <th className="py-2 pr-3">Check Out</th>
                  <th className="py-2">Working Time</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  const rowMeta = attendanceStatusMeta[item.status] || attendanceStatusMeta.not_checked_in
                  return (
                    <tr key={item.id} className="border-b border-gray-50 dark:border-gray-800">
                      <td className="py-2.5 pr-3 font-medium text-gray-800 dark:text-gray-200">{formatDate(item.date)}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${rowMeta.badge}`}>
                          <rowMeta.icon className="h-3 w-3" /> {rowMeta.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-400">{formatTime(item.check_in_at)}</td>
                      <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-400">{formatTime(item.check_out_at)}</td>
                      <td className="py-2.5 text-gray-600 dark:text-gray-400">{formatDuration(item.total_work_seconds)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Request correction modal */}
      <CorrectionModal
        isOpen={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        submitting={submittingCorrection}
        onSubmit={async (payload) => {
          setSubmittingCorrection(true)
          try {
            await attendanceAPI.requestCorrection(payload)
            toast.success('Correction request submitted')
            setCorrectionOpen(false)
            refetchCorrections()
          } catch (err) {
            toast.error(err?.response?.data?.detail || 'Failed to submit correction')
          } finally {
            setSubmittingCorrection(false)
          }
        }}
      />
    </div>
  )
}

const CORRECTION_TYPES = [
  ['missing_check_in', 'Missing Check-in'],
  ['missing_check_out', 'Missing Check-out'],
  ['change_check_in', 'Change Check-in'],
  ['change_check_out', 'Change Check-out'],
]

const DEFAULT_CORRECTION_FORM = { correction_type: 'missing_check_in', attendance_date: '', requested_check_in: '', requested_check_out: '', reason: '' }

function CorrectionModal({ isOpen, onClose, submitting, onSubmit }) {
  const [form, setForm] = useState(DEFAULT_CORRECTION_FORM)

  useEffect(() => {
    if (isOpen) setForm(DEFAULT_CORRECTION_FORM)
  }, [isOpen])

  const handleSubmit = (event) => {
    event.preventDefault()
    const payload = { ...form, reason: form.reason.trim() }
    if (!payload.attendance_date) return
    if (payload.correction_type.includes('check_in') && !payload.requested_check_in) {
      toast.error('Requested check-in time is required')
      return
    }
    if (payload.correction_type.includes('check_out') && !payload.requested_check_out) {
      toast.error('Requested check-out time is required')
      return
    }
    onSubmit(payload)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Attendance Correction"
      description="Submit a correction for a past attendance record. A manager or HR will review it."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" form="correction-form" loading={submitting} loadingText="Submitting…">Submit</Button>
        </div>
      }
    >
      <form id="correction-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Correction type" required>
          <select
            className={inputClassName}
            value={form.correction_type}
            onChange={(event) => setForm({ ...form, correction_type: event.target.value })}
          >
            {CORRECTION_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </FormField>
        <FormField label="Attendance date" required>
          <input
            type="date"
            className={inputClassName}
            required
            value={form.attendance_date}
            onChange={(event) => setForm({ ...form, attendance_date: event.target.value })}
          />
        </FormField>
        {form.correction_type.includes('check_in') ? (
          <FormField label="Requested check-in time" required>
            <input
              type="datetime-local"
              className={inputClassName}
              required
              value={form.requested_check_in}
              onChange={(event) => setForm({ ...form, requested_check_in: event.target.value })}
            />
          </FormField>
        ) : null}
        {form.correction_type.includes('check_out') ? (
          <FormField label="Requested check-out time" required>
            <input
              type="datetime-local"
              className={inputClassName}
              required
              value={form.requested_check_out}
              onChange={(event) => setForm({ ...form, requested_check_out: event.target.value })}
            />
          </FormField>
        ) : null}
        <FormField label="Reason" required>
          <textarea
            className={`${inputClassName} min-h-24`}
            required
            value={form.reason}
            onChange={(event) => setForm({ ...form, reason: event.target.value })}
            placeholder="Explain what went wrong and what should be corrected…"
          />
        </FormField>
      </form>
    </Modal>
  )
}

export default MyAttendance
