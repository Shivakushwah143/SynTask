import { describe, expect, it } from 'vitest'
import { normalizeEstimatedHours } from './ProjectBoard'

describe('ProjectBoard task form helpers', () => {
  it('accepts task estimates up to 24 hours', () => {
    expect(normalizeEstimatedHours('0.25')).toBe('0.25')
    expect(normalizeEstimatedHours('12')).toBe('12')
    expect(normalizeEstimatedHours('24')).toBe('24')
  })

  it('rejects empty, zero, and over-24 hour estimates', () => {
    expect(normalizeEstimatedHours('')).toBeNull()
    expect(normalizeEstimatedHours('0')).toBeNull()
    expect(normalizeEstimatedHours('24.25')).toBeNull()
  })
})
