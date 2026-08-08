// SynTask — canonical frontend module registry for member permissions.
//
// This is the single frontend source of truth for the sidebar-module
// permission system. It mirrors the backend catalog in
// `backend/app/schemas/admin_permissions.py` (MODULE_CATALOG + ROLE_MODULE_DEFAULTS)
// and the enforcement rules in `backend/app/api/dependencies.py`
// (`require_module` / `_module_access_allowed` / `_is_legacy_module_config`) —
// keep the two sides in sync.
//
// How effective access works (mirrors the backend):
//   - A member whose `modules` list matches a legacy default (task /
//     task+attendance_leaves / tasks_projects / empty) keeps the role-based
//     auto-grants (sales, tickets, recruitment for employee-level roles).
//   - A member with any other explicit list is governed strictly by that list.
//
// Consumers: the ModulePermissionSelector (create/edit member forms), the
// Users / MyTeam pages, and (via utils/rbac.js) the sidebar + route gates.

export const MODULE_CATALOG = [
  { id: 'tasks_projects', label: 'Tasks & Projects', group: 'Work', core: true },
  { id: 'chat', label: 'Chat', group: 'Work', core: false },
  { id: 'meetings_calendar', label: 'Meetings & Calendar', group: 'Work', core: false },
  { id: 'tickets', label: 'Tickets', group: 'Work', core: false },
  { id: 'sales_crm', label: 'Sales & CRM', group: 'CRM', core: false },
  { id: 'attendance_leaves', label: 'Attendance & Leaves', group: 'Workforce', core: false },
  { id: 'recruitment', label: 'Recruitment', group: 'Workforce', core: false },
  { id: 'invoicing_ledger', label: 'Invoicing & Ledger', group: 'Finance', core: false },
  { id: 'reports', label: 'Reports', group: 'Administration', core: false },
  { id: 'ai_agents', label: 'AI & Agents', group: 'Work', core: false },
]

export const MODULE_GROUPS = ['Work', 'CRM', 'Workforce', 'Finance', 'Administration']

/**
 * Modules the backend role-auto-grants to legacy Manager / Lead / Employee
 * members (`require_module` in dependencies.py). They are still fully
 * toggleable for explicitly-configured members.
 */
export const ROLE_IMPLIED_MODULES = new Set([
  'tasks_projects',
  'sales_crm',
  'tickets',
  'recruitment',
])

// Practical default selection per role (mirrors backend ROLE_MODULE_DEFAULTS).
export const ROLE_MODULE_DEFAULTS = {
  super_admin: MODULE_CATALOG.map((m) => m.id),
  admin: MODULE_CATALOG.map((m) => m.id),
  sub_admin: MODULE_CATALOG.map((m) => m.id),
  manager: ['tasks_projects', 'chat', 'meetings_calendar', 'attendance_leaves', 'reports', 'ai_agents'],
  lead: ['tasks_projects', 'chat', 'meetings_calendar', 'attendance_leaves'],
  employee: ['tasks_projects', 'chat', 'meetings_calendar', 'attendance_leaves'],
}

/** Default module selection for a role (unknown roles fall back to employee). */
export const getRoleModuleDefaults = (role) => {
  const normalized = String(role || '').toLowerCase().replace(/\s+/g, '_')
  return [...(ROLE_MODULE_DEFAULTS[normalized] || ROLE_MODULE_DEFAULTS.employee)]
}

// The exact module lists written by every pre-permission-system creation flow
// (mirrors backend `_is_legacy_module_config` in app/api/dependencies.py).
const LEGACY_MODULE_SETS = [
  [],
  ['task'],
  ['task', 'attendance_leaves'],
  ['tasks_projects'],
]

/** True when the module list is a pre-permission-system default. */
export const isLegacyModules = (modules) =>
  LEGACY_MODULE_SETS.some((legacy) => {
    if ((modules || []).length !== legacy.length) return false
    const set = new Set(modules || [])
    return legacy.every((m) => set.has(m))
  })

/**
 * Module list to preload when editing an existing member.
 *
 * - Explicit members: exactly their stored list.
 * - Legacy members: their role defaults plus the auto-granted modules, so a
 *   routine edit that only changes name/email never silently removes access
 *   they already had (saving materializes their effective access explicitly).
 */
export const getMemberEditDefaults = (role, modules) => {
  if ((modules || []).length && !isLegacyModules(modules)) {
    return [...modules]
  }
  return [...new Set([...getRoleModuleDefaults(role), ...ROLE_IMPLIED_MODULES])]
}
