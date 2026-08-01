import { describe, it, expect } from 'vitest'
import { estimateWorkingHoursUntil } from './workingHours'

describe('estimateWorkingHoursUntil', () => {
  // Dates are constructed in local time so setHours/day-boundary math is stable.
  const monday930 = new Date(2026, 7, 3, 9, 30) // Mon Aug 3 2026 09:30 local
  const saturday930 = new Date(2026, 7, 1, 9, 30) // Sat Aug 1 2026 09:30 local

  it('returns 0 for invalid dates', () => {
    expect(estimateWorkingHoursUntil('not-a-date', monday930)).toBe(0)
    expect(estimateWorkingHoursUntil(null, monday930)).toBe(0)
    expect(estimateWorkingHoursUntil(undefined, monday930)).toBe(0)
  })

  it('returns 0 for past due dates', () => {
    expect(estimateWorkingHoursUntil(new Date(2026, 7, 1, 12, 0), monday930)).toBe(0)
    expect(estimateWorkingHoursUntil(monday930, monday930)).toBe(0)
  })

  it('estimates the remaining hours for a due date later today', () => {
    const dueToday = new Date(2026, 7, 3, 18, 0) // Mon 18:00
    expect(estimateWorkingHoursUntil(dueToday, monday930)).toBe(8)
  })

  it('counts full workdays for multi-day windows', () => {
    const dueWednesday = new Date(2026, 7, 5, 18, 0) // Wed 18:00
    // Mon partial 7.5 + Tue 8 + Wed 8 = 23.5 -> rounds to 24
    expect(estimateWorkingHoursUntil(dueWednesday, monday930)).toBe(24)
  })

  it('never returns 0 for a future date even when all remaining days are weekends', () => {
    const dueSunday = new Date(2026, 7, 2, 18, 0) // Sun 18:00
    expect(estimateWorkingHoursUntil(dueSunday, saturday930)).toBe(1)
  })

  it('counts partial days when due falls before the next workday start', () => {
    const dueTuesdayEarly = new Date(2026, 7, 4, 8, 0) // Tue 08:00 (before work start)
    // Mon 09:30 -> Tue 08:00: Mon 7.5h, Tue 0 (before workStart) -> 7.5 -> 8
    expect(estimateWorkingHoursUntil(dueTuesdayEarly, monday930)).toBe(8)
  })
})
