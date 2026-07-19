import { addDays, addWeeks, isValid, parse as parseDate } from 'date-fns'
import { timeService } from '@/services/timeService'

const WEEKDAY_LOOKUP = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const DATE_FORMATS = ['yyyy-MM-dd', 'dd-MM-yyyy', 'MMM d, yyyy', 'MMM d yyyy', 'd MMM yyyy']

const TIME_PATTERN = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i

function parseTimeFromText(text, baseDate) {
  const match = text.match(TIME_PATTERN)
  if (!match) return { date: baseDate, hasTime: false }

  let hours = Number(match[1])
  const minutes = Number(match[2] || 0)
  const meridiem = match[3]?.toLowerCase()

  if (meridiem === 'pm' && hours < 12) hours += 12
  if (meridiem === 'am' && hours === 12) hours = 0

  const date = new Date(baseDate)
  date.setHours(hours, minutes, 0, 0)
  return { date, hasTime: true }
}

function parseAbsoluteDate(text, referenceDate) {
  for (const formatString of DATE_FORMATS) {
    const parsed = parseDate(text, formatString, referenceDate)
    if (isValid(parsed)) return parsed
  }

  const nativeDate = new Date(text)
  return isValid(nativeDate) ? nativeDate : null
}

function parseRelativeWeekday(text, referenceDate) {
  const match = text.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i)
  if (!match) return null

  const targetDay = WEEKDAY_LOOKUP[match[1].toLowerCase()]
  const date = new Date(referenceDate)
  const currentDay = date.getDay()
  let offset = targetDay - currentDay
  if (offset <= 0) offset += 7
  return addDays(date, offset)
}

/**
 * Parse a natural language date string into a Date object.
 * Supports a limited set of common phrases without an external dependency.
 */
export function parseNaturalDate(text, referenceDate = timeService.now()) {
  if (!text?.trim()) return null

  const normalized = text.trim().toLowerCase()
  let baseDate = null

  if (normalized.startsWith('today')) {
    baseDate = new Date(referenceDate)
  } else if (normalized.startsWith('tomorrow')) {
    baseDate = addDays(new Date(referenceDate), 1)
  } else if (normalized.startsWith('in ')) {
    const match = normalized.match(/^in\s+(\d+)\s+(day|days|week|weeks)$/)
    if (match) {
      const amount = Number(match[1])
      baseDate = match[2].startsWith('week')
        ? addWeeks(new Date(referenceDate), amount)
        : addDays(new Date(referenceDate), amount)
    }
  }

  if (!baseDate) {
    baseDate = parseRelativeWeekday(normalized, referenceDate) || parseAbsoluteDate(text, referenceDate)
  }

  if (!baseDate) return null

  const { date, hasTime } = parseTimeFromText(text, baseDate)
  return {
    date,
    matchedText: text.trim(),
    hasTime,
  }
}
