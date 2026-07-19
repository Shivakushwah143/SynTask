import { create } from 'zustand'
import api from '@/api/axios'

const FALLBACK_SETTINGS = {
  timezone: 'UTC',
  automatic_time: true,
  manual_time: null,
  hour_format: '12',
  show_seconds: false,
  server_utc: null,
}

export const detectBrowserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_SETTINGS.timezone
  } catch {
    return FALLBACK_SETTINGS.timezone
  }
}

export const useTimeStore = create((set, get) => ({
  settings: FALLBACK_SETTINGS,
  loaded: false,
  load: async () => {
    const settings = await api.get('/time/settings')
    set({ settings: { ...FALLBACK_SETTINGS, ...settings }, loaded: true })
    return get().settings
  },
  save: async (changes) => {
    const settings = await api.put('/time/settings', changes)
    set({ settings: { ...FALLBACK_SETTINGS, ...settings }, loaded: true })
    return get().settings
  },
  detectFirstLogin: async () => {
    const timezone = detectBrowserTimezone()
    const settings = await api.put('/time/settings', { timezone, detected: true })
    set({ settings: { ...FALLBACK_SETTINGS, ...settings }, loaded: true })
    return get().settings
  },
}))

export const timeService = {
  now(settings = useTimeStore.getState().settings) {
    if (!settings.automatic_time && settings.manual_time) {
      return new Date(settings.manual_time)
    }
    return new Date()
  },
  toUtcISOString(value) {
    if (!value) return null
    return new Date(value).toISOString()
  },
  zonedInputToUtcISOString(value, settings = useTimeStore.getState().settings) {
    if (!value) return null
    const [datePart, timePart = '00:00'] = String(value).split('T')
    const [year, month, day] = datePart.split('-').map(Number)
    const [hour = 0, minute = 0, second = 0] = timePart.split(':').map(Number)
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: settings.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(utcGuess)
    const valueFor = (type) => Number(parts.find((part) => part.type === type)?.value || 0)
    const zonedAsUtc = Date.UTC(
      valueFor('year'),
      valueFor('month') - 1,
      valueFor('day'),
      valueFor('hour'),
      valueFor('minute'),
      valueFor('second'),
    )
    const offset = zonedAsUtc - utcGuess.getTime()
    return new Date(utcGuess.getTime() - offset).toISOString()
  },
  parseZonedInput(value, settings) {
    const iso = this.zonedInputToUtcISOString(value, settings)
    return iso ? new Date(iso) : null
  },
  toZonedDateTimeInput(value, settings = useTimeStore.getState().settings) {
    if (!value) return ''
    const date = this.instant(value)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: settings.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date)
    const valueFor = (type) => parts.find((part) => part.type === type)?.value || ''
    return `${valueFor('year')}-${valueFor('month')}-${valueFor('day')}T${valueFor('hour')}:${valueFor('minute')}`
  },
  instant(value) {
    return value instanceof Date ? value : new Date(value)
  },
  instantTime(value) {
    return this.instant(value).getTime()
  },
  format(value, options = {}, settings = useTimeStore.getState().settings) {
    if (!value) return ''
    const date = value instanceof Date ? value : new Date(value)
    return new Intl.DateTimeFormat(undefined, {
      timeZone: settings.timezone,
      hour12: settings.hour_format !== '24',
      ...options,
    }).format(date)
  },
  formatDateTime(value, settings) {
    return this.format(value, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: (settings || useTimeStore.getState().settings).show_seconds ? '2-digit' : undefined,
    }, settings)
  },
  formatTime(value, settings) {
    return this.format(value, {
      hour: 'numeric',
      minute: '2-digit',
      second: (settings || useTimeStore.getState().settings).show_seconds ? '2-digit' : undefined,
    }, settings)
  },
}
