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

export const MODULE_LABELS = MODULE_CATALOG.reduce((acc, module) => {
  acc[module.id] = module.label
  return acc
}, {})

export const SIDEBAR_PERMISSION_SECTIONS = [
  {
    id: 'home',
    label: 'Home',
    note: 'Dashboard is always available. Calendar follows Meetings & Calendar.',
    options: [
      { id: 'home-dashboard', label: 'Home dashboard', moduleIds: [], fixed: true },
      { id: 'calendar', label: 'Calendar', moduleIds: ['meetings_calendar'] },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    moduleIds: ['sales_crm'],
    options: [
      { id: 'sales-overview', label: 'Sales overview', moduleIds: ['sales_crm'] },
      { id: 'leads', label: 'Leads and All Leads', moduleIds: ['sales_crm'] },
      { id: 'pipeline', label: 'Pipeline stages', moduleIds: ['sales_crm'] },
      { id: 'import-leads', label: 'Import Leads', moduleIds: ['sales_crm'] },
      { id: 'sales-reports', label: 'Sales Reports', moduleIds: ['sales_crm', 'reports'] },
    ],
  },
  {
    id: 'clients',
    label: 'Clients',
    moduleIds: ['sales_crm'],
    options: [
      { id: 'all-clients', label: 'All Clients', moduleIds: ['sales_crm'] },
      { id: 'companies', label: 'Companies', moduleIds: ['sales_crm'] },
      { id: 'contacts', label: 'Contacts', moduleIds: ['sales_crm'] },
      { id: 'client-calendar', label: 'Client Calendar', moduleIds: ['sales_crm', 'meetings_calendar'] },
      { id: 'client-insights', label: 'Client Insights', moduleIds: ['sales_crm', 'reports'] },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    moduleIds: ['tasks_projects', 'tickets'],
    options: [
      { id: 'projects', label: 'Projects', moduleIds: ['tasks_projects'] },
      { id: 'tasks', label: 'Tasks', moduleIds: ['tasks_projects'] },
      { id: 'requests', label: 'Requests', moduleIds: ['tickets'] },
      { id: 'scheduled-work', label: 'Scheduled Work', moduleIds: ['tasks_projects'] },
      { id: 'time-tracking', label: 'Time Tracking', moduleIds: ['tasks_projects'] },
      { id: 'daily-updates', label: 'Daily Updates', moduleIds: ['tasks_projects'] },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    moduleIds: ['tasks_projects', 'ai_agents'],
    options: [
      { id: 'content-calendar', label: 'Content Calendar', moduleIds: ['tasks_projects'] },
      { id: 'content-studio', label: 'Content Studio', moduleIds: ['ai_agents'] },
    ],
  },
  {
    id: 'inbox',
    label: 'Inbox',
    moduleIds: ['sales_crm'],
    options: [
      { id: 'meta-messages', label: 'Meta Messages', moduleIds: ['sales_crm'] },
      { id: 'notifications', label: 'Notifications', moduleIds: [], fixed: true },
      { id: 'activity-feed', label: 'Activity Feed', moduleIds: [], fixed: true },
      { id: 'meta-settings', label: 'WhatsApp, Instagram, Messenger and AI Replies', moduleIds: ['sales_crm'] },
    ],
  },
  {
    id: 'ai',
    label: 'AI Workspace',
    moduleIds: ['ai_agents'],
    options: [
      { id: 'ai-assistant', label: 'AI Assistant', moduleIds: ['ai_agents'] },
      { id: 'ai-content-assistant', label: 'AI Content Assistant', moduleIds: ['ai_agents'] },
    ],
  },
  {
    id: 'people',
    label: 'People',
    moduleIds: ['attendance_leaves', 'recruitment'],
    options: [
      { id: 'employees', label: 'Employees and My People', moduleIds: [], fixed: true },
      { id: 'attendance', label: 'Attendance, Live Attendance and Attendance Reports', moduleIds: ['attendance_leaves'] },
      { id: 'leave', label: 'Leave Management', moduleIds: ['attendance_leaves'] },
      { id: 'departments', label: 'Departments', moduleIds: [], fixed: true },
      { id: 'recruitment', label: 'Recruitment', moduleIds: ['recruitment'] },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    moduleIds: ['invoicing_ledger'],
    options: [
      { id: 'invoices', label: 'Invoices', moduleIds: ['invoicing_ledger'] },
      { id: 'transactions', label: 'Transactions', moduleIds: ['invoicing_ledger'] },
      { id: 'subscriptions', label: 'Subscriptions', moduleIds: [], fixed: true },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    moduleIds: ['reports'],
    options: [
      { id: 'workspace-reports', label: 'Workspace Reports', moduleIds: ['reports'] },
      { id: 'sales-reports-insights', label: 'Sales Reports', moduleIds: ['sales_crm', 'reports'] },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    moduleIds: ['ai_agents', 'sales_crm'],
    options: [
      { id: 'system-settings', label: 'System Settings', moduleIds: [], fixed: true },
      { id: 'roles-permissions', label: 'Roles & Permissions', moduleIds: [], fixed: true },
      { id: 'automation-rules', label: 'Automation Rules', moduleIds: ['tasks_projects'] },
      { id: 'google-workspace', label: 'Google Workspace', moduleIds: [], fixed: true },
      { id: 'activity-logs', label: 'Activity Logs', moduleIds: ['reports'] },
      { id: 'client-settings', label: 'Client Settings and Connected Accounts', moduleIds: ['sales_crm'] },
    ],
  },
]

export const getOptionState = (selected, option) => {
  if (!option.moduleIds?.length) return option.fixed ? 'fixed' : 'none'
  return option.moduleIds.every((id) => selected.has(id)) ? 'checked' : 'unchecked'
}

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
// NOTE: `['tasks_projects']` is deliberately NOT here — it is a new id written
// only by the permission-system flows, so a member created with just
// "Tasks & Projects" selected must be treated as explicit, not legacy (which
// would auto-grant Sales/Tickets/Recruitment).
const LEGACY_MODULE_SETS = [
  [],
  ['task'],
  ['task', 'attendance_leaves'],
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
