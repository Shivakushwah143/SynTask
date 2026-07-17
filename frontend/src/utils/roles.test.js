import { describe, expect, test } from 'vitest'
import { canManageProject } from './roles'

describe('role project permissions', () => {
  test('manager can manage any company project returned by the API', () => {
    expect(canManageProject('manager', {
      id: 'project-1',
      assigned_user_ids: ['lead-1'],
      assigned_to: 'lead-1',
      created_by: 'admin-1',
    }, 'manager-1')).toBe(true)
  })

  test('lead and employee do not get project management controls', () => {
    expect(canManageProject('lead', { id: 'project-1' }, 'lead-1')).toBe(false)
    expect(canManageProject('employee', { id: 'project-1' }, 'employee-1')).toBe(false)
  })
})
