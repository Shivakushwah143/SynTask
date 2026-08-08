import { describe, expect, test } from 'vitest'
import {
  MODULE_CATALOG,
  ROLE_IMPLIED_MODULES,
  getRoleModuleDefaults,
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

  test('role defaults: admin gets every module, employee gets a subset', () => {
    const admin = getRoleModuleDefaults('admin')
    expect(admin.length).toBe(MODULE_CATALOG.length)

    const employee = getRoleModuleDefaults('employee')
    expect(employee).toContain('tasks_projects')
    expect(employee).not.toContain('invoicing_ledger')
  })

  test('unknown role falls back to employee defaults (no lockout)', () => {
    expect(getRoleModuleDefaults('hr_manager')).toEqual(getRoleModuleDefaults('employee'))
  })

  test('implied modules cover employee-level auto-grants', () => {
    expect(ROLE_IMPLIED_MODULES.has('tasks_projects')).toBe(true)
    expect(ROLE_IMPLIED_MODULES.has('sales_crm')).toBe(true)
  })
})
