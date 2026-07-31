import { describe, expect, test } from 'vitest'
import { canForwardLeaveRequest, canReviewLeaveRequest, canSubmitLeaveRequest } from './Leaves'

describe('Leaves role gates', () => {
  test('hides leave request form for company admins', () => {
    expect(canSubmitLeaveRequest('admin')).toBe(false)
    expect(canSubmitLeaveRequest('sub_admin')).toBe(false)
    expect(canSubmitLeaveRequest('super_admin')).toBe(false)
  })

  test('allows non-admin roles to submit their own leave requests', () => {
    expect(canSubmitLeaveRequest('manager')).toBe(true)
    expect(canSubmitLeaveRequest('lead')).toBe(true)
    expect(canSubmitLeaveRequest('employee')).toBe(true)
  })

  test('allows manager review only for assigned employee or lead requests', () => {
    const manager = { id: 'manager-1', role: 'manager' }

    expect(canReviewLeaveRequest({
      employee_id: 'employee-1',
      employee_role: 'employee',
      status: 'pending',
      pending_with_user_ids: ['manager-1'],
    }, manager)).toBe(true)

    expect(canReviewLeaveRequest({
      employee_id: 'manager-1',
      employee_role: 'manager',
      status: 'pending',
      pending_with_user_ids: ['manager-1'],
    }, manager)).toBe(false)
  })

  test('admin can monitor but cannot review employee leave unless forwarded', () => {
    const admin = { id: 'admin-1', role: 'admin' }

    expect(canReviewLeaveRequest({
      employee_id: 'employee-1',
      employee_role: 'employee',
      status: 'pending',
      pending_with_user_ids: ['admin-1'],
    }, admin)).toBe(false)

    expect(canReviewLeaveRequest({
      employee_id: 'employee-1',
      employee_role: 'employee',
      status: 'pending',
      pending_with_user_ids: ['admin-1'],
      forwarded_by: 'manager-1',
    }, admin)).toBe(true)
  })

  test('manager can forward only reviewable employee or lead leave', () => {
    const manager = { id: 'manager-1', role: 'manager' }

    expect(canForwardLeaveRequest({
      employee_id: 'lead-1',
      employee_role: 'lead',
      status: 'pending',
      pending_with_user_ids: ['manager-1'],
    }, manager)).toBe(true)

    expect(canForwardLeaveRequest({
      employee_id: 'manager-2',
      employee_role: 'manager',
      status: 'pending',
      pending_with_user_ids: ['manager-1'],
    }, manager)).toBe(false)
  })

  test('sub admin review mirrors admin for manager and forwarded leaves', () => {
    const subAdmin = { id: 'subadmin-1', role: 'sub_admin' }

    // Sub Admin can review manager leaves
    expect(canReviewLeaveRequest({
      employee_id: 'manager-1',
      employee_role: 'manager',
      status: 'pending',
      pending_with_user_ids: ['subadmin-1'],
    }, subAdmin)).toBe(true)

    // Sub Admin can review forwarded employee leaves
    expect(canReviewLeaveRequest({
      employee_id: 'employee-1',
      employee_role: 'employee',
      status: 'pending',
      pending_with_user_ids: ['subadmin-1'],
      forwarded_by: 'manager-1',
    }, subAdmin)).toBe(true)

    // Sub Admin cannot review unforwarded employee leaves (same as Admin)
    expect(canReviewLeaveRequest({
      employee_id: 'employee-1',
      employee_role: 'employee',
      status: 'pending',
      pending_with_user_ids: ['subadmin-1'],
    }, subAdmin)).toBe(false)
  })

  test('manager cannot forward to self or to an employee', () => {
    const manager = { id: 'manager-1', role: 'manager' }

    expect(canForwardLeaveRequest({
      employee_id: 'manager-1',
      employee_role: 'manager',
      status: 'pending',
      pending_with_user_ids: ['manager-1'],
    }, manager)).toBe(false)
  })

  test('lead can see employee requests without receiving review actions', () => {
    const lead = { id: 'lead-1', role: 'lead' }

    expect(canReviewLeaveRequest({
      employee_id: 'employee-1',
      employee_role: 'employee',
      status: 'pending',
      pending_with_user_ids: ['lead-1'],
    }, lead)).toBe(false)
    expect(canForwardLeaveRequest({
      employee_id: 'employee-1',
      employee_role: 'employee',
      status: 'pending',
      pending_with_user_ids: ['lead-1'],
    }, lead)).toBe(false)
  })
})
