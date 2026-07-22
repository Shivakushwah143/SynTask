import { describe, expect, it } from 'vitest'
import { getCalendarCursorDate, getCalendarCursorLabel, resolveCalendarOwnerLabel } from './page'

describe('CRM calendar navigation', () => {
  it('moves by the active view instead of always moving one day', () => {
    const base = new Date('2026-07-16T10:00:00Z')

    expect(getCalendarCursorDate(base, 'month', 1).toISOString().slice(0, 10)).toBe('2026-08-16')
    expect(getCalendarCursorDate(base, 'week', -1).toISOString().slice(0, 10)).toBe('2026-07-09')
    expect(getCalendarCursorDate(base, 'day', 1).toISOString().slice(0, 10)).toBe('2026-07-17')
    expect(getCalendarCursorDate(base, 'agenda', 1).toISOString().slice(0, 10)).toBe('2026-07-23')
  })

  it('labels the active calendar range', () => {
    expect(getCalendarCursorLabel(new Date('2026-07-16T10:00:00Z'), 'month')).toBe('July 2026')
    expect(getCalendarCursorLabel(new Date('2026-07-16T10:00:00Z'), 'day')).toBe('Jul 16, 2026')
  })

  it('shows owner names instead of raw Mongo ids', () => {
    const usersById = new Map([
      ['507f1f77bcf86cd799439011', 'Ada Admin'],
    ])

    expect(resolveCalendarOwnerLabel('507f1f77bcf86cd799439011', usersById)).toBe('Ada Admin')
    expect(resolveCalendarOwnerLabel('507f1f77bcf86cd799439012', usersById)).toBe('')
    expect(resolveCalendarOwnerLabel('Priya Lead', usersById)).toBe('Priya Lead')
  })
})
