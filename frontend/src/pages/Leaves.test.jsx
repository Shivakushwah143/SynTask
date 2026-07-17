import { describe, expect, test } from 'vitest'
import { canSubmitLeaveRequest } from './Leaves'

describe('Leaves role gates', () => {
  test('hides leave request form for company admins', () => {
    expect(canSubmitLeaveRequest('admin')).toBe(false)
    expect(canSubmitLeaveRequest('super_admin')).toBe(false)
  })

  test('allows non-admin roles to submit their own leave requests', () => {
    expect(canSubmitLeaveRequest('manager')).toBe(true)
    expect(canSubmitLeaveRequest('lead')).toBe(true)
    expect(canSubmitLeaveRequest('employee')).toBe(true)
  })
})
