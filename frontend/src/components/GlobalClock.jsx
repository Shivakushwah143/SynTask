import { useEffect, useRef, useState } from 'react'
import { Clock, Loader2, Settings2 } from 'lucide-react'
import { Button } from './ui'
import { useAuthStore } from '@/store/authStore'
import { hasCompanyAdminAccess, isSuperAdminRole } from '@/utils/roles'
import { detectBrowserTimezone, timeService, useTimeStore } from '@/services/timeService'

const TIMEZONES = ['UTC', 'Asia/Kolkata', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Singapore', 'Australia/Sydney']

export default function GlobalClock() {
  const { user, updateUser } = useAuthStore()
  const { settings, loaded, load, save, detectFirstLogin } = useTimeStore()
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [draftSettings, setDraftSettings] = useState(settings)
  const panelRef = useRef(null)
  const statusTimerRef = useRef(null)
  const canEdit = hasCompanyAdminAccess(user?.role) || isSuperAdminRole(user?.role)

  useEffect(() => {
    if (!user) return
    const init = async () => {
      const next = user.timezone ? await load() : await detectFirstLogin()
      updateUser({ timezone: next.timezone })
    }
    init().catch(() => {})
  }, [user?.id])

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), settings.show_seconds ? 1000 : 30000)
    return () => window.clearInterval(interval)
  }, [settings.show_seconds])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => () => window.clearTimeout(statusTimerRef.current), [])

  useEffect(() => {
    setDraftSettings(settings)
  }, [settings])

  const current = timeService.now(settings)
  const display = timeService.formatTime(current, settings)
  const dirty = ['timezone', 'automatic_time', 'manual_time', 'hour_format', 'show_seconds'].some(
    (key) => draftSettings?.[key] !== settings?.[key],
  )
  const draftManualTime = draftSettings.manual_time
    ? timeService.toZonedDateTimeInput(draftSettings.manual_time, draftSettings)
    : ''
  // Use tick to trigger re-render on time updates
  void tick

  const updateDraft = (changes) => {
    window.clearTimeout(statusTimerRef.current)
    setSaveStatus('')
    setDraftSettings((currentDraft) => ({ ...currentDraft, ...changes }))
  }

  const resetDraft = () => {
    window.clearTimeout(statusTimerRef.current)
    setDraftSettings(settings)
    setSaveStatus('')
  }

  const persist = async () => {
    if (saving || !dirty) return
    window.clearTimeout(statusTimerRef.current)
    setSaving(true)
    setSaveStatus('Saving...')
    try {
      const next = await save({
        timezone: draftSettings.timezone,
        automatic_time: draftSettings.automatic_time,
        manual_time: draftSettings.manual_time,
        hour_format: draftSettings.hour_format,
        show_seconds: draftSettings.show_seconds,
      })
      updateUser({ timezone: next.timezone })
      setDraftSettings(next)
      setSaveStatus('Saved')
      statusTimerRef.current = window.setTimeout(() => setSaveStatus(''), 1800)
    } catch {
      setSaveStatus('Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1 rounded-full border border-surface-border bg-surface/95 px-2 text-xs font-medium text-text-primary hover:bg-surface-muted dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:text-[var(--color-app-text)]"
        title="Time settings"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin text-primary-500" /> : <Clock className="h-4 w-4" />}
        <span>{loaded ? display : '--:--'}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-lg border border-surface-border bg-surface p-4 text-sm shadow-xl dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-text-primary dark:text-[var(--color-app-text)]">Global Time</p>
              <p className="text-xs text-text-muted dark:text-[var(--color-app-text-muted)]">{draftSettings.timezone}</p>
            </div>
            {saving ? <Loader2 className="h-4 w-4 animate-spin text-primary-500" /> : <Settings2 className="h-4 w-4 text-text-muted" />}
          </div>
          {saveStatus ? (
            <p
              role="status"
              aria-live="polite"
              className={`mb-3 rounded-md px-2 py-1 text-xs font-medium ${
                saveStatus === 'Could not save. Try again.'
                  ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200'
                  : 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-200'
              }`}
            >
              {saveStatus}
            </p>
          ) : null}

          <label className="block text-xs font-medium text-text-secondary">Timezone</label>
          <select
            className="mt-1 w-full rounded-md border border-surface-border bg-surface p-2 text-text-primary disabled:opacity-60"
            value={draftSettings.timezone}
            disabled={!canEdit || saving}
            onChange={(event) => updateDraft({ timezone: event.target.value })}
          >
            {[draftSettings.timezone, ...TIMEZONES].filter((value, index, list) => value && list.indexOf(value) === index).map((timezone) => (
              <option key={timezone} value={timezone}>{timezone}</option>
            ))}
          </select>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draftSettings.automatic_time} disabled={!canEdit || saving} onChange={(event) => updateDraft({ automatic_time: event.target.checked })} />
              Auto time
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draftSettings.show_seconds} disabled={!canEdit || saving} onChange={(event) => updateDraft({ show_seconds: event.target.checked })} />
              Seconds
            </label>
          </div>

          <div className="mt-3 flex rounded-md border border-surface-border p-1">
            {['12', '24'].map((format) => (
              <button
                key={format}
                type="button"
                disabled={!canEdit || saving}
                onClick={() => updateDraft({ hour_format: format })}
                className={`flex-1 rounded px-2 py-1 disabled:opacity-60 ${draftSettings.hour_format === format ? 'bg-primary-500 text-white' : 'text-text-secondary'}`}
              >
                {format}h
              </button>
            ))}
          </div>

          <label className="mt-3 block text-xs font-medium text-text-secondary">Manual time</label>
          <input
            type="datetime-local"
            value={draftManualTime}
            disabled={!canEdit || saving || draftSettings.automatic_time}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface p-2 text-text-primary disabled:opacity-60"
            onChange={(event) => updateDraft({ manual_time: event.target.value ? timeService.zonedInputToUtcISOString(event.target.value, draftSettings) : null })}
          />

          {!canEdit ? <p className="mt-3 text-xs text-text-muted">View only. Admin can edit workspace time.</p> : null}
          <Button className="mt-3 w-full" variant="outline" size="sm" onClick={() => updateDraft({ timezone: detectBrowserTimezone() })} disabled={!canEdit || saving}>
            Use browser timezone
          </Button>
          {canEdit && dirty ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={resetDraft} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={persist} disabled={saving}>
                {saving ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </span>
                ) : 'Save'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
