import { describe, expect, test } from 'vitest'
import {
  MODULE_CATALOG,
  ROLE_IMPLIED_MODULES,
  getRoleModuleDefaults,
  isLegacyModules,
  getMemberEditDefaults,
} from './modulePermissions'

describe('modulePermissions registry', () => {
  test('catalog contains stable permission keys (not display labels)', () => {
    const ids = MODULE_CATALOG.map((m) => m.id)
    expect(ids).toContain('tasks_projects')
    expect(ids).toContain('sales_crm')
    expect(ids).toContain('attendance_leaves')
    expect(ids).toContain('recruitment')
    // Keys must never be human labels.
    expect(ids).not.toContain('Recruitment Management')
  })

  test('catalog ids are unique', () => {
    const ids = MODULE_CATALOG.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('role defaults: admin gets every module, employee gets a subset without sales', () => {
    const admin = getRoleModuleDefaults('admin')
    expect(admin.length).toBe(MODULE_CATALOG.length)

    const employee = getRoleModuleDefaults('employee')
    expect(employee).toContain('projects')
    expect(employee).toContain('tasks')
    expect(employee).not.toContain('sales_crm')
    expect(employee).not.toContain('invoicing_ledger')
  })

  test('unknown role falls back to employee defaults (no lockout)', () => {
    expect(getRoleModuleDefaults('hr_manager')).toEqual(getRoleModuleDefaults('employee'))
  })

  test('legacy detection matches the backend defaults', () => {
    expect(isLegacyModules([])).toBe(true)
    expect(isLegacyModules(['task'])).toBe(true)
    expect(isLegacyModules(['task', 'attendance_leaves'])).toBe(true)
    // `tasks_projects` is a NEW id written only by permission-system flows, so a
    // member created with just "Tasks & Projects" is explicit, not legacy.
    expect(isLegacyModules(['tasks_projects'])).toBe(false)
    // Explicit lists (anything the Permissions selector saves) are not legacy.
    expect(isLegacyModules(['tasks_projects', 'chat'])).toBe(false)
    expect(isLegacyModules(['tasks_projects', 'sales_crm', 'attendance_leaves'])).toBe(false)
    expect(isLegacyModules(undefined)).toBe(true)
  })

  test('edit preload preserves a legacy member full effective access', () => {
    const defaults = getMemberEditDefaults('employee', ['task'])
    expect(defaults).toContain('projects')
    expect(defaults).toContain('tasks')
    expect(defaults).toContain('tasks_projects')
    expect(defaults).toContain('sales_crm') // auto-granted today -> kept
    expect(defaults).toContain('tickets')
    expect(defaults).toContain('recruitment')
  })

  test('edit preload keeps an explicit member list exactly', () => {
    const stored = ['tasks_projects', 'chat', 'attendance_leaves']
    expect(getMemberEditDefaults('employee', stored)).toEqual(stored)
  })

  test('implied modules cover the legacy auto-grants', () => {
    expect(ROLE_IMPLIED_MODULES.has('tasks_projects')).toBe(true)
    expect(ROLE_IMPLIED_MODULES.has('sales_crm')).toBe(true)
  })
})
