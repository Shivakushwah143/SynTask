import { describe, expect, it } from 'vitest'
import { CLIENT_STAGE_ITEMS, hasModuleAccess, getSectionItems, gateNavItem } from './navigation'

const salesItem = { name: 'Qualify', href: '/crm/pipeline/qualify', roles: ['super_admin', 'admin', 'sub_admin', 'manager', 'lead', 'employee'], module: 'sales_crm' }
const projectsItem = { name: 'Projects', href: '/projects', roles: ['super_admin', 'admin', 'sub_admin', 'manager', 'lead', 'employee'], module: 'projects' }
const tasksItem = { name: 'Tasks', href: '/tasks', roles: ['super_admin', 'admin', 'sub_admin', 'manager', 'lead', 'employee'], module: 'tasks' }
const scheduledWorkItem = { name: 'Scheduled Work', href: '/scheduled-jobs', roles: ['super_admin', 'admin', 'sub_admin', 'manager', 'lead'], module: 'scheduled_work' }

describe('sidebar module gating (explicit member permissions are authoritative)', () => {
  it('hides sales_crm for an employee whose explicit modules exclude it (deselected at creation)', () => {
    const employee = { role: 'employee', modules: ['tasks_projects', 'chat', 'attendance_leaves'] }
    expect(hasModuleAccess(employee, 'sales_crm')).toBe(false)
    expect(gateNavItem(employee, salesItem)).toBe(false)
  })

  it('shows sales_crm for an employee whose explicit modules include it', () => {
    const employee = { role: 'employee', modules: ['tasks_projects', 'sales_crm', 'attendance_leaves'] }
    expect(hasModuleAccess(employee, 'sales_crm')).toBe(true)
    expect(gateNavItem(employee, salesItem)).toBe(true)
  })

  it('keeps legacy role auto-grant for legacy employees (pre-permission-system lists)', () => {
    const legacyEmployee = { role: 'employee', modules: ['task', 'attendance_leaves'] }
    expect(hasModuleAccess(legacyEmployee, 'sales_crm')).toBe(true)
    expect(gateNavItem(legacyEmployee, salesItem)).toBe(true)
  })

  it('treats a single-module explicit selection as explicit, not legacy', () => {
    // ['tasks_projects'] is written only by permission-system flows → explicit.
    const employee = { role: 'employee', modules: ['tasks_projects'] }
    expect(hasModuleAccess(employee, 'sales_crm')).toBe(false)
    expect(gateNavItem(employee, salesItem)).toBe(false)
    expect(gateNavItem(employee, tasksItem)).toBe(true)
  })

  it('separates Projects, Tasks, and Scheduled Work for explicit members', () => {
    const projectOnly = { role: 'employee', modules: ['projects'] }
    expect(gateNavItem(projectOnly, projectsItem)).toBe(true)
    expect(gateNavItem(projectOnly, tasksItem)).toBe(false)

    const taskOnly = { role: 'employee', modules: ['tasks'] }
    expect(gateNavItem(taskOnly, tasksItem)).toBe(true)
    expect(gateNavItem(taskOnly, projectsItem)).toBe(false)

    const leadScheduledOnly = { role: 'lead', modules: ['scheduled_work'] }
    expect(gateNavItem(leadScheduledOnly, scheduledWorkItem)).toBe(true)
    expect(gateNavItem(leadScheduledOnly, projectsItem)).toBe(false)
  })

  it('always allows admin/super_admin regardless of modules', () => {
    const admin = { role: 'admin', modules: ['tasks_projects'] }
    const superAdmin = { role: 'super_admin', modules: [] }
    expect(hasModuleAccess(admin, 'sales_crm')).toBe(true)
    expect(hasModuleAccess(superAdmin, 'sales_crm')).toBe(true)
  })

  it('keeps Client lifecycle access for Managers with older explicit modules', () => {
    const manager = { role: 'manager', modules: ['projects', 'tasks'] }
    expect(hasModuleAccess(manager, 'clients')).toBe(true)
    expect(gateNavItem(manager, CLIENT_STAGE_ITEMS[0])).toBe(true)
  })

  it('hides the whole Sales section when every sales item is gated out', () => {
    const employee = { role: 'employee', modules: ['tasks_projects', 'chat', 'attendance_leaves'] }
    const items = getSectionItems('sales', employee)
    expect(items.some((item) => item.module === 'sales_crm')).toBe(false)
  })
})
