import { describe, it, expect } from 'vitest'
import { parseNaturalDate } from './parseNaturalDate'
import { useTimeStore } from '@/services/timeService'

// Default test store timezone is UTC (FALLBACK_SETTINGS), so assertions are deterministic.
const utcIso = (d) => d.toISOString()

describe('parseNaturalDate', () => {
  const ref = new Date('2026-08-03T09:30:00.000Z') // Monday

  it('resolves "today" to end of workday (18:00) instead of the current instant', () => {
    const parsed = parseNaturalDate('today', ref)
    expect(parsed).not.toBeNull()
    expect(parsed.hasTime).toBe(false)
    expect(utcIso(parsed.date)).toBe('2026-08-03T18:00:00.000Z')
  })

  it('resolves "tomorrow" to end of workday (18:00) of the next day', () => {
    const parsed = parseNaturalDate('tomorrow', ref)
    expect(parsed).not.toBeNull()
    expect(utcIso(parsed.date)).toBe('2026-08-04T18:00:00.000Z')
  })

  it('keeps an explicit time when provided', () => {
    const parsed = parseNaturalDate('tomorrow 5pm', ref)
    expect(parsed).not.toBeNull()
    expect(parsed.hasTime).toBe(true)
    expect(utcIso(parsed.date)).toBe('2026-08-04T17:00:00.000Z')
  })

  it('resolves "next friday" to end of workday of that friday', () => {
    const parsed = parseNaturalDate('next friday', ref)
    expect(parsed).not.toBeNull()
    // Aug 3 2026 is Monday; next Friday is Aug 7
    expect(utcIso(parsed.date)).toBe('2026-08-07T18:00:00.000Z')
  })

  it('resolves "in 3 days" to end of workday 3 days out', () => {
    const parsed = parseNaturalDate('in 3 days', ref)
    expect(parsed).not.toBeNull()
    expect(utcIso(parsed.date)).toBe('2026-08-06T18:00:00.000Z')
  })

  it('returns null for empty or unparseable input', () => {
    expect(parseNaturalDate('', ref)).toBeNull()
    expect(parseNaturalDate('gibberish qwerty', ref)).toBeNull()
  })

  it('round-trips: a resolved "tomorrow" feeds a positive estimation', async () => {
    // Ensures the parse -> estimate pipeline no longer yields 0 for date-only phrases.
    const { estimateWorkingHoursUntil } = await import('./workingHours')
    const parsed = parseNaturalDate('tomorrow', ref)
    // Estimation compares instants directly; feed the parsed instant.
    const hrs = estimateWorkingHoursUntil(parsed.date, ref)
    expect(hrs).toBeGreaterThan(0)
  })

  it('uses the configured timezone for the end-of-workday resolution', () => {
    // Simulate a non-UTC zone (e.g. Asia/Kolkata, +05:30) to confirm wall-clock 18:00.
    useTimeStore.setState({ settings: { ...useTimeStore.getState().settings, timezone: 'Asia/Kolkata' } })
    try {
      const parsed = parseNaturalDate('today', ref)
      expect(parsed).not.toBeNull()
      // 18:00 IST == 12:30 UTC
      expect(utcIso(parsed.date)).toBe('2026-08-03T12:30:00.000Z')
    } finally {
      useTimeStore.setState({ settings: { ...useTimeStore.getState().settings, timezone: 'UTC' } })
    }
  })
})
