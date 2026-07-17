import {
  Activity,
  CalendarDays,
  LayoutDashboard,
  FileText,
  TrendingUp,
  Settings,
  Users,
  Building2,
} from 'lucide-react'

export const CRM_NAV_ITEMS = [
  { key: 'pipeline', label: 'Pipeline', path: '/crm/pipeline', status: 'active', icon: TrendingUp },
  { key: 'leads', label: 'Leads', path: '/crm/leads', status: 'active', icon: Users },
  { key: 'companies', label: 'Companies', path: '/crm/companies', status: 'active', icon: Building2 },
  { key: 'contacts', label: 'Contacts', path: '/crm/contacts', status: 'active', icon: Users },
  // { key: 'activities', label: 'Activities', path: '/crm/activities', status: 'active', icon: Activity },
  { key: 'calendar', label: 'Calendar', path: '/crm/calendar', status: 'planned', icon: CalendarDays },
  { key: 'reports', label: 'Reports', path: '/crm/reports', status: 'planned', icon: FileText },
  { key: 'settings', label: 'Settings', path: '/crm/settings', status: 'planned', icon: Settings },
]

export const CRM_ROUTE_LABELS = {
  '/crm': 'CRM',
  '/crm/pipeline': 'Pipeline',
  '/crm/leads': 'Leads',
  '/crm/companies': 'Companies',
  '/crm/contacts': 'Contacts',
  '/crm/activities': 'Activities',
  '/crm/calendar': 'Calendar',
  '/crm/reports': 'Reports',
  '/crm/settings': 'Settings',
}

export const CRM_ROUTE_DESCRIPTIONS = {
  '/crm/pipeline': 'Production-ready CRM pipeline board powered by live sales data.',
  '/crm/leads': 'Lead workspace for selected pipeline records.',
  '/crm/companies': 'Company workspace for account management and related contacts.',
  '/crm/contacts': 'Contact directory for CRM relationships.',
  '/crm/activities': 'CRM activities hub for calls, meetings, tasks and follow-ups.',
  '/crm/calendar': 'Calendar workspace placeholder for meetings and scheduling.',
  '/crm/reports': 'Report workspace placeholder for later analytics.',
  '/crm/settings': 'CRM settings placeholder for workspace configuration.',
}

export const CRM_ROUTE_ICONS = {
  '/crm/pipeline': TrendingUp,
  '/crm/leads': Users,
  '/crm/companies': Building2,
  '/crm/contacts': Users,
  '/crm/activities': Activity,
  '/crm/calendar': CalendarDays,
  '/crm/reports': FileText,
  '/crm/settings': Settings,
}
