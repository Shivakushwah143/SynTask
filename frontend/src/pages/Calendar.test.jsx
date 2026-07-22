import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'
import { getEventDate, getEventStyle, getWeekDays } from './Calendar'

describe('calendar timeline helpers', () => {
  it('builds seven week days from Monday', () => {
    const days = getWeekDays(new Date('2026-07-15T10:00:00'))

    expect(days).toHaveLength(7)
    expect(format(days[0], 'yyyy-MM-dd')).toBe('2026-07-13')
    expect(format(days[6], 'yyyy-MM-dd')).toBe('2026-07-19')
  })

  it('positions timed events by minutes since 6am', () => {
    const style = getEventStyle({ start_at: '2026-07-13T09:30:00', duration_minutes: 90 })

    expect(style.top).toBe('210px')
    expect(style.height).toBe('90px')
  })

  it('normalizes calendar event date from due date or time fields', () => {
    expect(getEventDate({ due_date: '2026-07-13T14:00:00' }).getHours()).toBe(14)
    expect(getEventDate({ start: '2026-07-13', time: '15:45' }).getMinutes()).toBe(45)
  })
})
