import { useCallback, useEffect, useState } from 'react'
import { Clock, Globe, Save, Settings, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { attendanceAPI } from '../../api/attendance'
import { Button, PageHeader, Skeleton } from '../../components/ui'

const WORK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Africa/Cairo',
]

const AttendancePolicySettings = () => {
  const [policy, setPolicy] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const loadPolicy = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await attendanceAPI.getPolicy()
      setPolicy(res.data)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load attendance policy')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPolicy()
  }, [loadPolicy])

  const handleSave = async () => {
    if (!policy) return
    try {
      setSaving(true)
      await attendanceAPI.updatePolicy(policy.id, {
        name: policy.name,
        timezone: policy.timezone,
        expected_start_time: policy.expected_start_time,
        expected_end_time: policy.expected_end_time,
        expected_work_minutes: Number(policy.expected_work_minutes),
        late_grace_minutes: Number(policy.late_grace_minutes),
        early_departure_grace_minutes: Number(policy.early_departure_grace_minutes),
        minimum_half_day_minutes: Number(policy.minimum_half_day_minutes),
        minimum_full_day_minutes: Number(policy.minimum_full_day_minutes),
        overtime_enabled: policy.overtime_enabled,
        overtime_after_minutes: Number(policy.overtime_after_minutes),
        work_week: policy.work_week,
      })
      toast.success('Attendance policy updated')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save policy')
    } finally {
      setSaving(false)
    }
  }

  const toggleWorkDay = (day) => {
    setPolicy((prev) => {
      const week = prev.work_week || []
      if (week.includes(day)) {
        return { ...prev, work_week: week.filter((d) => d !== day) }
      }
      return { ...prev, work_week: [...week, day] }
    })
  }

  if (loading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Attendance Policy" description="Configure company attendance rules and schedule." />
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Attendance Policy" description="Configure company attendance rules and schedule." />
        <div className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-gray-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Could not load policy</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{error}</p>
              <Button className="mt-4" variant="secondary" onClick={loadPolicy}>
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
      <PageHeader title="Attendance Policy" description="Configure company attendance rules, work schedule, and payroll settings." />

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {/* Basic Info */}
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <Settings className="h-4 w-4" /> General
          </h3>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Policy Name</label>
            <input
              type="text"
              value={policy?.name || ''}
              onChange={(e) => setPolicy((p) => ({ ...p, name: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
              <Globe className="mr-1 inline h-3 w-3" /> Timezone
            </label>
            <select
              value={policy?.timezone || 'UTC'}
              onChange={(e) => setPolicy((p) => ({ ...p, timezone: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Work Schedule */}
        <div className="border-b border-gray-200 border-t px-5 py-4 dark:border-gray-700">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <Clock className="h-4 w-4" /> Work Schedule
          </h3>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Expected Start Time</label>
            <input
              type="time"
              value={policy?.expected_start_time || '09:00'}
              onChange={(e) => setPolicy((p) => ({ ...p, expected_start_time: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Expected End Time</label>
            <input
              type="time"
              value={policy?.expected_end_time || '18:00'}
              onChange={(e) => setPolicy((p) => ({ ...p, expected_end_time: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Expected Work (minutes)</label>
            <input
              type="number"
              min="0"
              value={policy?.expected_work_minutes || 480}
              onChange={(e) => setPolicy((p) => ({ ...p, expected_work_minutes: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        {/* Grace Periods */}
        <div className="border-b border-gray-200 border-t px-5 py-4 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Grace Periods</h3>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Late Arrival Grace (minutes)</label>
            <input
              type="number"
              min="0"
              value={policy?.late_grace_minutes || 0}
              onChange={(e) => setPolicy((p) => ({ ...p, late_grace_minutes: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Early Departure Grace (minutes)</label>
            <input
              type="number"
              min="0"
              value={policy?.early_departure_grace_minutes || 0}
              onChange={(e) => setPolicy((p) => ({ ...p, early_departure_grace_minutes: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        {/* Minimum Thresholds */}
        <div className="border-b border-gray-200 border-t px-5 py-4 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Day Thresholds</h3>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Minimum Half-Day (minutes)</label>
            <input
              type="number"
              min="0"
              value={policy?.minimum_half_day_minutes || 240}
              onChange={(e) => setPolicy((p) => ({ ...p, minimum_half_day_minutes: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Minimum Full-Day (minutes)</label>
            <input
              type="number"
              min="0"
              value={policy?.minimum_full_day_minutes || 360}
              onChange={(e) => setPolicy((p) => ({ ...p, minimum_full_day_minutes: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        {/* Overtime */}
        <div className="border-b border-gray-200 border-t px-5 py-4 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Overtime</h3>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={policy?.overtime_enabled || false}
              onChange={(e) => setPolicy((p) => ({ ...p, overtime_enabled: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label className="text-sm text-gray-700 dark:text-gray-300">Enable Overtime Tracking</label>
          </div>
          {policy?.overtime_enabled && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Overtime After (minutes)</label>
              <input
                type="number"
                min="0"
                value={policy?.overtime_after_minutes || 480}
                onChange={(e) => setPolicy((p) => ({ ...p, overtime_after_minutes: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          )}
        </div>

        {/* Work Week */}
        <div className="border-b border-gray-200 border-t px-5 py-4 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Work Week</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Select working days. Unselected days are treated as week-off.</p>
        </div>
        <div className="flex flex-wrap gap-2 p-5">
          {WORK_DAYS.map((day) => {
            const isSelected = policy?.work_week?.includes(day)
            return (
              <button
                key={day}
                onClick={() => toggleWorkDay(day)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  isSelected
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                {day}
              </button>
            )
          })}
        </div>

        {/* Save */}
        <div className="flex justify-end border-t border-gray-200 px-5 py-4 dark:border-gray-700">
          <Button onClick={handleSave} loading={saving} loadingText="Saving...">
            <Save className="h-4 w-4" /> Save Policy
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AttendancePolicySettings
