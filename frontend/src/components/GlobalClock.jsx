import { useEffect, useRef, useState } from 'react'
import { Clock, Settings2 } from 'lucide-react'
import { Button } from './ui'
import { useAuthStore } from '@/store/authStore'
import { isAdminRole, isSuperAdminRole } from '@/utils/roles'
import { detectBrowserTimezone, timeService, useTimeStore } from '@/services/timeService'

const TIMEZONES = ['UTC', 'Asia/Kolkata', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Singapore', 'Australia/Sydney']

export default function GlobalClock() {
  const { user, updateUser } = useAuthStore()
  const { settings, loaded, load, save, detectFirstLogin } = useTimeStore()
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const panelRef = useRef(null)
  const canEdit = isAdminRole(user?.role) || isSuperAdminRole(user?.role)

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

  const current = timeService.now(settings)
  const display = timeService.formatTime(current, settings)

  const persist = async (changes) => {
    const next = await save(changes)
    updateUser({ timezone: next.timezone })
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-surface-border bg-surface/95 px-3 text-sm font-medium text-text-primary hover:bg-surface-muted dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:text-[var(--color-app-text)]"
        title="Time settings"
      >
        <Clock className="h-4 w-4" />
        <span>{loaded ? display : '--:--'}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-lg border border-surface-border bg-surface p-4 text-sm shadow-xl dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-text-primary dark:text-[var(--color-app-text)]">Global Time</p>
              <p className="text-xs text-text-muted dark:text-[var(--color-app-text-muted)]">{settings.timezone}</p>
            </div>
            <Settings2 className="h-4 w-4 text-text-muted" />
          </div>

          <label className="block text-xs font-medium text-text-secondary">Timezone</label>
          <select
            className="mt-1 w-full rounded-md border border-surface-border bg-surface p-2 text-text-primary disabled:opacity-60"
            value={settings.timezone}
            disabled={!canEdit}
            onChange={(event) => persist({ timezone: event.target.value })}
          >
            {[settings.timezone, ...TIMEZONES].filter((value, index, list) => value && list.indexOf(value) === index).map((timezone) => (
              <option key={timezone} value={timezone}>{timezone}</option>
            ))}
          </select>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={settings.automatic_time} disabled={!canEdit} onChange={(event) => persist({ automatic_time: event.target.checked })} />
              Auto time
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={settings.show_seconds} disabled={!canEdit} onChange={(event) => persist({ show_seconds: event.target.checked })} />
              Seconds
            </label>
          </div>

          <div className="mt-3 flex rounded-md border border-surface-border p-1">
            {['12', '24'].map((format) => (
              <button
                key={format}
                type="button"
                disabled={!canEdit}
                onClick={() => persist({ hour_format: format })}
                className={`flex-1 rounded px-2 py-1 ${settings.hour_format === format ? 'bg-primary-500 text-white' : 'text-text-secondary'}`}
              >
                {format}h
              </button>
            ))}
          </div>

          <label className="mt-3 block text-xs font-medium text-text-secondary">Manual time</label>
          <input
            type="datetime-local"
            disabled={!canEdit || settings.automatic_time}
            className="mt-1 w-full rounded-md border border-surface-border bg-surface p-2 text-text-primary disabled:opacity-60"
            onChange={(event) => persist({ manual_time: event.target.value ? timeService.toUtcISOString(event.target.value) : null })}
          />

          {!canEdit ? <p className="mt-3 text-xs text-text-muted">View only. Admin can edit workspace time.</p> : null}
          <Button className="mt-3 w-full" variant="outline" size="sm" onClick={() => persist({ timezone: detectBrowserTimezone() })} disabled={!canEdit}>
            Use browser timezone
          </Button>
        </div>
      ) : null}
    </div>
  )
}
