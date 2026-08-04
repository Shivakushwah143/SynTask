import { describe, expect, test } from 'vitest'
import { buildProjectPermissions, getEffectiveProjectRole } from './useProjectPermissions'

describe('project-scoped permissions', () => {
  test('employee assigned as project lead gets lead actions only in that project', () => {
    const user = { id: 'employee-1', role: 'employee' }

    expect(getEffectiveProjectRole(user, { id: 'project-x', lead_id: 'employee-1' })).toBe('project_lead')
    expect(buildProjectPermissions(user, { id: 'project-x', lead_id: 'employee-1' }).hasProjectPermission('create_task')).toBe(true)
    expect(buildProjectPermissions(user, { id: 'project-y', lead_id: 'other' }).hasProjectPermission('create_task')).toBe(false)
  })

  test('project member can view but cannot perform lead-only actions', () => {
    const permissions = buildProjectPermissions(
      { id: 'member-1', role: 'employee' },
      { id: 'project-x', team_member_ids: ['member-1'] },
    )

    expect(permissions.effectiveProjectRole).toBe('project_member')
    expect(permissions.hasProjectPermission('view_project')).toBe(true)
    expect(permissions.hasProjectPermission('create_task')).toBe(false)
  })

  test('backend permission payload is source of truth when present', () => {
    const permissions = buildProjectPermissions(
      { id: 'employee-1', role: 'employee' },
      {
        id: 'project-x',
        lead_id: 'other',
        effective_project_role: 'project_lead',
        permissions: { create_task: true, manage_board: true },
      },
    )

    expect(permissions.effectiveProjectRole).toBe('project_lead')
    expect(permissions.hasProjectPermission('create_task')).toBe(true)
    expect(permissions.hasProjectPermission('manage_task')).toBe(false)
  })
})
