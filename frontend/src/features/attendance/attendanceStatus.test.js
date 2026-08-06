import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_STATUS,
  attendanceStatusMeta,
  extractAttendanceRecord,
  getAttendanceMeta,
  normalizeAttendanceStatus,
} from './attendanceStatus'

describe('normalizeAttendanceStatus', () => {
  it('passes through canonical statuses', () => {
    expect(normalizeAttendanceStatus('not_checked_in')).toBe('not_checked_in')
    expect(normalizeAttendanceStatus('working')).toBe('working')
    expect(normalizeAttendanceStatus('on_break')).toBe('on_break')
    expect(normalizeAttendanceStatus('checked_out')).toBe('checked_out')
  })

  it('falls back to not_checked_in for inconsistent values', () => {
    expect(normalizeAttendanceStatus('Working')).toBe('not_checked_in')
    expect(normalizeAttendanceStatus('WORKING')).toBe('not_checked_in')
    expect(normalizeAttendanceStatus('on-break')).toBe('not_checked_in')
    expect(normalizeAttendanceStatus('present')).toBe('not_checked_in')
    expect(normalizeAttendanceStatus('offline')).toBe('not_checked_in')
    expect(normalizeAttendanceStatus(undefined)).toBe('not_checked_in')
  })
})

describe('attendanceStatusMeta', () => {
  it('covers every canonical status with a label', () => {
    expect(attendanceStatusMeta[ATTENDANCE_STATUS.NOT_CHECKED_IN].label).toBe('Not Checked In')
    expect(attendanceStatusMeta[ATTENDANCE_STATUS.WORKING].label).toBe('Working')
    expect(attendanceStatusMeta[ATTENDANCE_STATUS.ON_BREAK].label).toBe('On Break')
    expect(attendanceStatusMeta[ATTENDANCE_STATUS.CHECKED_OUT].label).toBe('Day Completed')
  })

  it('returns a stable meta for unknown statuses via getAttendanceMeta', () => {
    expect(getAttendanceMeta('bogus').label).toBe('Not Checked In')
  })
})

describe('extractAttendanceRecord', () => {
  it('extracts the record from { success, data } and attaches received_at', () => {
    const record = extractAttendanceRecord({
      success: true,
      data: { id: 'a1', status: 'on_break' },
    })
    expect(record.id).toBe('a1')
    expect(record.status).toBe('on_break')
    expect(typeof record.received_at).toBe('number')
  })

  it('normalizes the status during extraction', () => {
    const record = extractAttendanceRecord({ success: true, data: { status: 'Offline' } })
    expect(record.status).toBe('not_checked_in')
  })

  it('returns null for unusable payloads', () => {
    expect(extractAttendanceRecord(null)).toBeNull()
    expect(extractAttendanceRecord({ success: true, data: null })).toBeNull()
  })
})
