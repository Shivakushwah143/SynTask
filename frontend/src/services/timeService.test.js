import { describe, expect, it } from 'vitest'
import { timeService } from './timeService'

const settings = {
  timezone: 'Asia/Kolkata',
  automatic_time: true,
  manual_time: null,
  hour_format: '24',
  show_seconds: false,
}

describe('timeService', () => {
  it('formats UTC instants in configured timezone', () => {
    const formatted = timeService.formatDateTime('2026-07-19T05:00:00Z', settings)

    expect(formatted).toContain('10:30')
  })

  it('serializes date input to UTC ISO for persistence', () => {
    expect(timeService.toUtcISOString('2026-07-19T10:30')).toMatch(/2026-07-19T.*Z/)
  })

  it('converts datetime-local values using selected timezone', () => {
    expect(timeService.zonedInputToUtcISOString('2026-07-19T10:30', settings)).toBe('2026-07-19T05:00:00.000Z')
  })
})
