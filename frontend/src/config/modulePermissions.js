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
  { id: 'tasks_projects', label: 'All Work', group: 'Work', core: true },
  { id: 'projects', label: 'Projects', group: 'Work', core: false },
  { id: 'tasks', label: 'Tasks', group: 'Work', core: false },
  { id: 'scheduled_work', label: 'Scheduled Work', group: 'Work', core: false },
  { id: 'time_tracking', label: 'Time Tracking', group: 'Work', core: false },
  { id: 'daily_updates', label: 'Daily Updates', group: 'Work', core: false },
  { id: 'content_calendar', label: 'Content Calendar', group: 'Work', core: false },
  { id: 'automation_rules', label: 'Automation Rules', group: 'Administration', core: false },
  { id: 'chat', label: 'Chat', group: 'Work', core: false },
  { id: 'meetings_calendar', label: 'Meetings & Calendar', group: 'Work', core: false },
  { id: 'tickets', label: 'Tickets', group: 'Work', core: false },
  { id: 'sales_crm', label: 'Sales & CRM', group: 'CRM', core: false },
  { id: 'sales_overview', label: 'Sales Overview', group: 'CRM', core: false },
  { id: 'leads', label: 'Leads', group: 'CRM', core: false },
  { id: 'sales_pipeline', label: 'Sales Pipeline', group: 'CRM', core: false },
  { id: 'import_leads', label: 'Import Leads', group: 'CRM', core: false },
  { id: 'sales_reports', label: 'Sales Reports', group: 'CRM', core: false },
  { id: 'clients', label: 'Clients', group: 'CRM', core: false },
  { id: 'companies', label: 'Companies', group: 'CRM', core: false },
  { id: 'contacts', label: 'Contacts', group: 'CRM', core: false },
  { id: 'client_calendar', label: 'Client Calendar', group: 'CRM', core: false },
  { id: 'client_insights', label: 'Client Insights', group: 'CRM', core: false },
  { id: 'meta_messages', label: 'Meta Messages', group: 'CRM', core: false },
  { id: 'meta_settings', label: 'Meta Settings', group: 'CRM', core: false },
  { id: 'publishing_centre', label: 'Publishing Centre', group: 'CRM', core: false },
  { id: 'social_accounts', label: 'Social Accounts', group: 'CRM', core: false },
  { id: 'publishing_analytics', label: 'Publishing Analytics', group: 'CRM', core: false },
  { id: 'integrations', label: 'Integrations', group: 'CRM', core: false },
  { id: 'attendance_leaves', label: 'Attendance & Leaves', group: 'Workforce', core: false },
  { id: 'attendance', label: 'Attendance', group: 'Workforce', core: false },
  { id: 'live_attendance', label: 'Live Attendance', group: 'Workforce', core: false },
  { id: 'attendance_reports', label: 'Attendance Reports', group: 'Workforce', core: false },
  { id: 'leave_management', label: 'Leave Management', group: 'Workforce', core: false },
  { id: 'recruitment', label: 'Recruitment', group: 'Workforce', core: false },
  { id: 'invoicing_ledger', label: 'Invoicing & Ledger', group: 'Finance', core: false },
  { id: 'invoices', label: 'Invoices', group: 'Finance', core: false },
  { id: 'transactions', label: 'Transactions', group: 'Finance', core: false },
  { id: 'reports', label: 'Reports', group: 'Administration', core: false },
  { id: 'activity_logs', label: 'Activity Logs', group: 'Administration', core: false },
  { id: 'ai_agents', label: 'AI & Agents', group: 'Work', core: false },
  { id: 'ai_assistant', label: 'AI Assistant', group: 'Work', core: false },
  { id: 'ai_content_assistant', label: 'AI Content Assistant', group: 'Work', core: false },
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
    note: 'Dashboard and Calendar are core authenticated pages in the current app.',
    options: [
      { id: 'home-dashboard', label: 'Home dashboard', moduleIds: [], fixed: true },
      { id: 'calendar', label: 'Calendar', moduleIds: [], fixed: true },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    moduleIds: ['sales_overview', 'leads', 'sales_pipeline', 'import_leads', 'sales_reports'],
    options: [
      { id: 'sales-overview', label: 'Sales overview', moduleIds: ['sales_overview'] },
      { id: 'leads', label: 'Leads and All Leads', moduleIds: ['leads'] },
      { id: 'pipeline', label: 'Pipeline stages', moduleIds: ['sales_pipeline'] },
      { id: 'import-leads', label: 'Import Leads', moduleIds: ['import_leads'] },
      { id: 'sales-reports', label: 'Sales Reports', moduleIds: ['sales_reports'] },
    ],
  },
  {
    id: 'clients',
    label: 'Clients',
    moduleIds: ['clients', 'companies', 'contacts', 'client_calendar', 'client_insights'],
    options: [
      { id: 'all-clients', label: 'All Clients', moduleIds: ['clients'] },
      { id: 'companies', label: 'Companies', moduleIds: ['companies'] },
      { id: 'contacts', label: 'Contacts', moduleIds: ['contacts'] },
      { id: 'client-calendar', label: 'Client Calendar', moduleIds: ['client_calendar'] },
      { id: 'client-insights', label: 'Client Insights', moduleIds: ['client_insights'] },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    moduleIds: ['projects', 'tasks', 'tickets', 'scheduled_work', 'time_tracking', 'daily_updates'],
    options: [
      { id: 'projects', label: 'Projects', moduleIds: ['projects'] },
      { id: 'tasks', label: 'Tasks', moduleIds: ['tasks'] },
      { id: 'requests', label: 'Requests', moduleIds: ['tickets'] },
      { id: 'scheduled-work', label: 'Scheduled Work', moduleIds: ['scheduled_work'] },
      { id: 'time-tracking', label: 'Time Tracking', moduleIds: ['time_tracking'] },
      { id: 'daily-updates', label: 'Daily Updates', moduleIds: ['daily_updates'] },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    moduleIds: ['content_calendar', 'ai_agents'],
    options: [
      { id: 'content-calendar', label: 'Content Calendar', moduleIds: ['content_calendar'] },
      { id: 'content-studio', label: 'Content Studio', moduleIds: ['ai_agents'] },
    ],
  },
  {
    id: 'inbox',
    label: 'Inbox',
    moduleIds: ['meta_messages', 'meta_settings'],
    options: [
      { id: 'meta-messages', label: 'Meta Messages', moduleIds: ['meta_messages'] },
      { id: 'notifications', label: 'Notifications', moduleIds: [], fixed: true },
      { id: 'activity-feed', label: 'Activity Feed', moduleIds: [], fixed: true },
      { id: 'meta-settings', label: 'WhatsApp, Instagram, Messenger and AI Replies', moduleIds: ['meta_settings'] },
    ],
  },
  {
    id: 'publishing',
    label: 'Publishing',
    note: 'These shortcuts currently open CRM/Meta settings panels and are controlled by role plus Sales/CRM access.',
    moduleIds: ['publishing_centre', 'social_accounts', 'publishing_analytics', 'integrations'],
    options: [
      { id: 'publishing-centre', label: 'Publishing Centre', moduleIds: ['publishing_centre'] },
      { id: 'social-accounts', label: 'Social Accounts', moduleIds: ['social_accounts'] },
      { id: 'publishing-analytics', label: 'Publishing Analytics', moduleIds: ['publishing_analytics'] },
      { id: 'integrations', label: 'Integrations', moduleIds: ['integrations'] },
    ],
  },
  {
    id: 'ai',
    label: 'AI Workspace',
    moduleIds: ['ai_assistant', 'ai_content_assistant'],
    options: [
      { id: 'ai-assistant', label: 'AI Assistant', moduleIds: ['ai_assistant'] },
      { id: 'ai-content-assistant', label: 'AI Content Assistant', moduleIds: ['ai_content_assistant'] },
    ],
  },
  {
    id: 'people',
    label: 'People',
    moduleIds: ['attendance', 'live_attendance', 'attendance_reports', 'leave_management', 'recruitment'],
    options: [
      { id: 'employees', label: 'Employees and My People', moduleIds: [], fixed: true },
      { id: 'attendance', label: 'Attendance', moduleIds: ['attendance'] },
      { id: 'live-attendance', label: 'Live Attendance', moduleIds: ['live_attendance'] },
      { id: 'attendance-reports', label: 'Attendance Reports', moduleIds: ['attendance_reports'] },
      { id: 'leave', label: 'Leave Management', moduleIds: ['leave_management'] },
      { id: 'departments', label: 'Departments', moduleIds: [], fixed: true },
      { id: 'recruitment', label: 'Recruitment', moduleIds: ['recruitment'] },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    moduleIds: ['invoices', 'transactions'],
    options: [
      { id: 'invoices', label: 'Invoices', moduleIds: ['invoices'] },
      { id: 'transactions', label: 'Transactions', moduleIds: ['transactions'] },
      { id: 'subscriptions', label: 'Subscriptions', moduleIds: [], fixed: true },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    moduleIds: ['sales_reports'],
    note: 'Workspace Reports is core by role today; Sales Reports follows Sales/CRM.',
    options: [
      { id: 'workspace-reports', label: 'Workspace Reports', moduleIds: [], fixed: true },
      { id: 'sales-reports-insights', label: 'Sales Reports', moduleIds: ['sales_reports'] },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    moduleIds: ['automation_rules', 'activity_logs', 'meta_settings'],
    options: [
      { id: 'system-settings', label: 'System Settings', moduleIds: [], fixed: true },
      { id: 'roles-permissions', label: 'Roles & Permissions', moduleIds: [], fixed: true },
      { id: 'automation-rules', label: 'Automation Rules', moduleIds: ['automation_rules'] },
      { id: 'google-workspace', label: 'Google Workspace', moduleIds: [], fixed: true },
      { id: 'activity-logs', label: 'Activity Logs', moduleIds: ['activity_logs'] },
      { id: 'client-settings', label: 'Client Settings and Connected Accounts', moduleIds: ['meta_settings'] },
    ],
  },
  {
    id: 'sop',
    label: 'SOP Library',
    note: 'SOP Library is intentionally visible to every authenticated user.',
    options: [
      { id: 'sop-library', label: 'SOP Library', moduleIds: [], fixed: true },
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
  manager: ['projects', 'tasks', 'scheduled_work', 'time_tracking', 'daily_updates', 'content_calendar', 'chat', 'meetings_calendar', 'clients', 'attendance', 'live_attendance', 'attendance_reports', 'leave_management', 'ai_assistant', 'ai_content_assistant'],
  lead: ['projects', 'tasks', 'scheduled_work', 'time_tracking', 'daily_updates', 'content_calendar', 'chat', 'meetings_calendar', 'attendance', 'attendance_reports', 'leave_management'],
  employee: ['projects', 'tasks', 'time_tracking', 'daily_updates', 'content_calendar', 'chat', 'meetings_calendar', 'attendance', 'leave_management'],
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
