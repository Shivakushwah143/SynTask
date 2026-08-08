// SynTask — canonical frontend module registry for member permissions.
//
// This is the single frontend source of truth for the sidebar-module
// permission system. It mirrors the backend catalog in
// `backend/app/schemas/admin_permissions.py` (MODULE_CATALOG + ROLE_MODULE_DEFAULTS)
// and the enforcement rules in `backend/app/api/dependencies.py`
// (`require_module` / `_module_access_allowed`) — keep the two sides in sync.
//
// Consumers: the ModulePermissionSelector (create/edit member forms), any
// future permission display, and (indirectly) the sidebar/route gates which
// already use `hasModuleAccess` from `utils/rbac.js`.

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
 * Modules the backend auto-grants to Manager / Lead / Employee regardless of
 * the stored list (`require_module` in dependencies.py). They are shown as
 * always-on for those roles so the selector never promises something the
 * backend would override.
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
