import { describe, expect, it } from 'vitest'
import { getProjectRoleAssignmentIds, getProjectRoleNames, normalizeEstimatedHours } from './ProjectBoard.helpers'

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

describe('ProjectBoard role overview helpers', () => {
  it('resolves manager name from current user when manager is not in assignable users', () => {
    const names = getProjectRoleNames(
      { assigned_user_ids: ['manager-1', 'lead-1'] },
      [{ id: 'lead-1', first_name: 'Leena', last_name: 'Rao', role: 'lead' }],
      { id: 'manager-1', first_name: 'Maya', last_name: 'Shah', role: 'manager' },
    )

    expect(names.manager).toEqual(['Maya Shah'])
    expect(names.lead).toEqual(['Leena Rao'])
  })

  it('uses assigned_users payload names before lookup fallbacks', () => {
    const names = getProjectRoleNames(
      { assigned_users: [{ id: 'manager-2', name: 'Amit Verma', role: 'manager' }] },
      [],
      null,
    )

    expect(names.manager).toEqual(['Amit Verma'])
  })

  it('splits project assignment ids into manager and leader controls', () => {
    const roleIds = getProjectRoleAssignmentIds(
      { assigned_user_ids: ['manager-1', 'lead-1'] },
      [
        { id: 'manager-1', role: 'manager' },
        { id: 'lead-1', role: 'lead' },
      ],
      null,
    )

    expect(roleIds).toEqual({ manager: 'manager-1', lead: 'lead-1' })
  })

  it('uses current manager id when assignable users only include leaders', () => {
    const roleIds = getProjectRoleAssignmentIds(
      { assigned_user_ids: ['manager-1', 'lead-1'] },
      [{ id: 'lead-1', role: 'lead' }],
      { id: 'manager-1', role: 'manager' },
    )

    expect(roleIds).toEqual({ manager: 'manager-1', lead: 'lead-1' })
  })
})
