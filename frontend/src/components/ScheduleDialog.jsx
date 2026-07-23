import { useState, useCallback } from 'react'
import { CalendarClock, Clock, Globe, FileText, X } from 'lucide-react'
import { Modal } from './ui'
import { Button } from './ui'
import { timeService } from '@/services/timeService'

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Asia/Kolkata', label: 'IST – India Standard Time (UTC+5:30)' },
  { value: 'America/New_York', label: 'EST – Eastern Time (UTC-5)' },
  { value: 'America/Chicago', label: 'CST – Central Time (UTC-6)' },
  { value: 'America/Denver', label: 'MST – Mountain Time (UTC-7)' },
  { value: 'America/Los_Angeles', label: 'PST – Pacific Time (UTC-8)' },
  { value: 'Europe/London', label: 'GMT – Greenwich Mean Time (UTC+0)' },
  { value: 'Europe/Paris', label: 'CET – Central European Time (UTC+1)' },
  { value: 'Europe/Berlin', label: 'CET – Berlin (UTC+1)' },
  { value: 'Asia/Dubai', label: 'GST – Gulf Standard Time (UTC+4)' },
  { value: 'Asia/Singapore', label: 'SGT – Singapore Time (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'JST – Japan Standard Time (UTC+9)' },
  { value: 'Australia/Sydney', label: 'AEST – Australian Eastern Time (UTC+10)' },
]

function getLocalTimezone() {
  return timeService.getTimezone()
}

function toLocalDateTimeInput(tz) {
  try {
    return timeService.toZonedDateTimeInput(timeService.now(), { ...timeService.settings(), timezone: tz })
  } catch {
    return ''
  }
}

/**
 * ScheduleDialog
 *
 * Props:
 *  isOpen: boolean
 *  onClose: () => void
 *  onConfirm: (runAt: Date, notes: string) => void | Promise<void>
 *  loading?: boolean
 *  title?: string  – override dialog title
 *  actionLabel?: string  – what is being scheduled, e.g. "Project Creation"
 */
export default function ScheduleDialog({
  isOpen,
  onClose,
  onConfirm,
  loading = false,
  title = 'Schedule for Later',
  actionLabel = 'action',
}) {
  const localTz = getLocalTimezone()
  const [timezone, setTimezone] = useState(() => {
    const match = COMMON_TIMEZONES.find((tz) => tz.value === localTz)
    return match ? localTz : 'UTC'
  })
  const [dateTimeValue, setDateTimeValue] = useState(() => toLocalDateTimeInput(timezone))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const reset = useCallback(() => {
    setDateTimeValue(toLocalDateTimeInput(timezone))
    setNotes('')
    setError('')
  }, [timezone])

  const handleTimezoneChange = (tz) => {
    setTimezone(tz)
    setDateTimeValue(toLocalDateTimeInput(tz))
  }

  const handleConfirm = async () => {
    setError('')
    if (!dateTimeValue) {
      setError('Please select an execution date and time.')
      return
    }

    let runAt
    try {
      runAt = timeService.parseZonedInput(dateTimeValue, { ...timeService.settings(), timezone })
    } catch {
      setError('Invalid date/time. Please check your selection.')
      return
    }

    if (runAt <= timeService.now()) {
      setError('Execution time must be in the future.')
      return
    }

    try {
      await onConfirm(runAt, notes.trim() || undefined)
      reset()
    } catch {
      // parent handles toast
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      description={`Choose when this ${actionLabel} should execute automatically.`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            loading={loading}
            loadingText="Scheduling…"
            id="schedule-dialog-confirm-btn"
          >
            <CalendarClock className="h-4 w-4" />
            Save Schedule
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Timezone */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-[var(--color-app-text-secondary)]">
            <Globe className="h-3.5 w-3.5 text-primary-500" />
            Timezone
          </label>
          <select
            className="input w-full"
            value={timezone}
            onChange={(e) => handleTimezoneChange(e.target.value)}
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
            {/* Add local tz if not in list */}
            {!COMMON_TIMEZONES.find((t) => t.value === localTz) && (
              <option value={localTz}>{localTz} (Your local timezone)</option>
            )}
          </select>
        </div>

        {/* Date & Time */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-[var(--color-app-text-secondary)]">
            <Clock className="h-3.5 w-3.5 text-primary-500" />
            Execution Date &amp; Time
            <span className="text-danger-500">*</span>
          </label>
          <input
            type="datetime-local"
            className="input w-full"
            value={dateTimeValue}
            onChange={(e) => {
              setDateTimeValue(e.target.value)
              setError('')
            }}
            id="schedule-dialog-datetime"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Time is interpreted in the selected timezone above.
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-[var(--color-app-text-secondary)]">
            <FileText className="h-3.5 w-3.5 text-primary-500" />
            Notes
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            className="input w-full"
            rows={2}
            placeholder="Reason for scheduling, context, or reminder…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            id="schedule-dialog-notes"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="flex items-center gap-1.5 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-800 dark:bg-danger-950/40 dark:text-danger-400">
            <X className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {/* Summary card */}
        {dateTimeValue && !error && (
          <div className="rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3 dark:border-primary-900/40 dark:bg-primary-950/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
              Scheduled execution
            </p>
            <p className="mt-0.5 text-sm text-gray-800 dark:text-gray-200">
              {dateTimeValue.replace('T', ' ')} ({timezone})
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
