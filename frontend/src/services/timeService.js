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
  settings() {
    return useTimeStore.getState().settings
  },
  getTimezone(settings = useTimeStore.getState().settings) {
    return settings.timezone || detectBrowserTimezone()
  },
  now(settings = useTimeStore.getState().settings) {
    if (!settings.automatic_time && settings.manual_time) {
      return this.instant(settings.manual_time)
    }
    return new Date()
  },
  toUtcISOString(value) {
    if (!value) return null
    return this.instant(value).toISOString()
  },
  zonedInputToUtcISOString(value, settings = useTimeStore.getState().settings) {
    if (!value) return null
    const [datePart, timePart = '00:00'] = String(value).split('T')
    const [year, month, day] = datePart.split('-').map(Number)
    const [hour = 0, minute = 0, second = 0] = timePart.split(':').map(Number)
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
    const parts = this.dateTimeFormat('en-US', {
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
    return iso ? timeService.instant(iso) : null
  },
  toZonedDateTimeInput(value, settings = useTimeStore.getState().settings) {
    if (!value) return ''
    const date = this.instant(value)
    const parts = this.dateTimeFormat('en-CA', {
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
  nowMs() {
    return this.now().getTime()
  },
  toUtcDateOnly(value) {
    return this.toUtcISOString(value)?.slice(0, 10) || ''
  },
  toUtcDateOnlyNow() {
    return this.toUtcDateOnly(this.now())
  },
  addDays(value, days) {
    return new Date(this.instantTime(value) + days * 24 * 60 * 60 * 1000)
  },
  instantFromParts(year, monthIndex, day, hour = 0, minute = 0, second = 0) {
    return new Date(year, monthIndex, day, hour, minute, second)
  },
  format(value, options = {}, settings = useTimeStore.getState().settings) {
    if (!value) return ''
    const date = value instanceof Date ? value : this.instant(value)
    return this.dateTimeFormat(undefined, {
      timeZone: settings.timezone,
      hour12: settings.hour_format !== '24',
      ...options,
    }).format(date)
  },
  dateTimeFormat(locale, options = {}, settings = useTimeStore.getState().settings) {
    return new Intl.DateTimeFormat(locale, {
      timeZone: settings.timezone,
      hour12: settings.hour_format !== '24',
      ...options,
    })
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
  formatDate(value, settings) {
    return this.format(value, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }, settings)
  },
  formatDateOnly(value, settings) {
    if (!value) return ''
    const str = String(value)
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      // Pure calendar-date fields must not shift across timezones.
      const [, year, month, day] = match
      const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
      return this.dateTimeFormat('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }, settings).format(date)
    }
    return this.formatDate(value, settings)
  },
  formatMonthDay(value, settings) {
    return this.format(value, {
      month: 'short',
      day: 'numeric',
    }, settings)
  },
  formatShortDateTime(value, settings) {
    return this.format(value, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }, settings)
  },
  formatLongWeekdayDate(value, settings) {
    return this.format(value, {
      weekday: 'long',
      month: 'long',
      day: '2-digit',
    }, settings)
  },
  formatLongDate(value, settings) {
    return this.format(value, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }, settings)
  },
  formatDayNumber(value, settings) {
    return this.format(value, {
      day: 'numeric',
    }, settings)
  },
  formatMonthShort(value, settings) {
    return this.format(value, {
      month: 'short',
    }, settings)
  },
  formatTimeOnly(value, settings) {
    return this.format(value, {
      hour: 'numeric',
      minute: '2-digit',
    }, settings)
  },
  // Map of date-fns-style patterns to Intl.DateTimeFormat options. These keep
  // the same visual output as the legacy `format(...)` calls but always render
  // through the configured timezone instead of browser-local time.
  formatPattern(value, pattern, settings = useTimeStore.getState().settings) {
    if (!value) return ''
    const PATTERN_OPTIONS = {
      'MMM d, yyyy': { month: 'short', day: 'numeric', year: 'numeric' },
      'MMM d, yyyy h:mm a': { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' },
      'MMM d, yyyy, h:mm a': { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' },
      'MMM d, yyyy - h:mm a': { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' },
      'MMM d': { month: 'short', day: 'numeric' },
      'MMM d, h:mm a': { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
      'MMM d, HH:mm': { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
      'MMM d, HH:mm:ss': { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
      'hh:mm a': { hour: 'numeric', minute: '2-digit' },
      'h:mm a': { hour: 'numeric', minute: '2-digit' },
      'ha': { hour: 'numeric', hour12: true },
      'EEEE, MMM d, yyyy': { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' },
      'EEEE, MMM d': { weekday: 'long', month: 'short', day: 'numeric' },
      'MMMM d, yyyy': { month: 'long', day: 'numeric', year: 'numeric' },
      'MMMM dd, yyyy': { month: 'long', day: '2-digit', year: 'numeric' },
      'MMMM yyyy': { month: 'long', year: 'numeric' },
      'PPP': { year: 'numeric', month: 'long', day: 'numeric' },
      'MMM d, h:mma': { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
      'EEE': { weekday: 'short' },
      'd': { day: 'numeric' },
      'PPpp': { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
    }
    const options = PATTERN_OPTIONS[pattern]
    if (!options) return this.formatDateTime(value, settings)
    return this.format(value, options, settings)
  },
  // Date-only YYYY-MM-DD string for the configured timezone (input values).
  toZonedDateOnly(value, settings = useTimeStore.getState().settings) {
    const input = this.toZonedDateTimeInput(value, settings)
    return input ? input.slice(0, 10) : ''
  },
  // Fixed hour label like '9AM' for calendar grid rows (no timezone shifting).
  hourLabel(hour) {
    const h = ((Number(hour) % 24) + 24) % 24
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}${h >= 12 ? 'PM' : 'AM'}`
  },
  formatRelative(value, options = {}, settings = useTimeStore.getState().settings) {
    if (!value) return ''
    const date = this.instant(value)
    if (Number.isNaN(date.getTime())) return ''
    const diffMs = date.getTime() - this.now().getTime()
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', ...options })
    const absMs = Math.abs(diffMs)
    if (absMs < 60 * 1000) return rtf.format(Math.round(diffMs / 1000), 'second')
    if (absMs < 60 * 60 * 1000) return rtf.format(Math.round(diffMs / (60 * 1000)), 'minute')
    if (absMs < 24 * 60 * 60 * 1000) return rtf.format(Math.round(diffMs / (60 * 60 * 1000)), 'hour')
    if (absMs < 30 * 24 * 60 * 60 * 1000) return rtf.format(Math.round(diffMs / (24 * 60 * 60 * 1000)), 'day')
    if (absMs < 12 * 30 * 24 * 60 * 60 * 1000) return rtf.format(Math.round(diffMs / (30 * 24 * 60 * 60 * 1000)), 'month')
    return rtf.format(Math.round(diffMs / (365 * 24 * 60 * 60 * 1000)), 'year')
  },
  formatDateTimeWithSeconds(value, settings) {
    return this.format(value, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }, settings)
  },
}
