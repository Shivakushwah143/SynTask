import { useMemo, useState } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Building2,
  Calendar,
  BarChart3,
  Settings,
  GitBranch,
  UserPlus,
  UserCheck,
  Factory,
  CalendarRange,
  LineChart,
  Settings as SettingsIcon,
  Search,
  ChevronRight,
  Home,
  Sparkles,
  Zap,
  Award,
  Briefcase,
  FileText,
  PieChart,
  Activity,
  Menu,
  X,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Eye,
  EyeOff
} from 'lucide-react'
import { CRMWorkspace } from '../components/crm'
import { CRM_NAV_ITEMS, CRM_ROUTE_DESCRIPTIONS, CRM_ROUTE_LABELS } from '../pages/crm/metadata'
import { Badge, Button } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isManagerRole } from '../utils/roles'

// Enhanced navigation items with icons and colors
const ENHANCED_NAV_ITEMS = [
  {
    id: 'pipeline',
    label: 'Pipeline',
    href: '/crm/pipeline',
    icon: GitBranch,
    color: 'from-blue-500 to-cyan-500',
    badge: null,
    description: 'Sales pipeline board'
  },
  {
    id: 'leads',
    label: 'Leads',
    href: '/crm/leads',
    icon: UserPlus,
    color: 'from-purple-500 to-pink-500',
    badge: null,
    description: 'Lead management'
  },
  {
    id: 'companies',
    label: 'Companies',
    href: '/crm/companies',
    icon: Building2,
    color: 'from-emerald-500 to-teal-500',
    badge: null,
    description: 'Company directory'
  },
  {
    id: 'contacts',
    label: 'Contacts',
    href: '/crm/contacts',
    icon: Users,
    color: 'from-indigo-500 to-purple-500',
    badge: null,
    description: 'Contact management'
  },
  {
    id: 'calendar',
    label: 'Calendar',
    href: '/crm/calendar',
    icon: CalendarRange,
    color: 'from-rose-500 to-pink-500',
    badge: null,
    description: 'CRM calendar'
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/crm/reports',
    icon: BarChart3,
    color: 'from-amber-500 to-orange-500',
    badge: 'New',
    description: 'Sales analytics'
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/crm/settings',
    icon: SettingsIcon,
    color: 'from-gray-500 to-gray-600',
    badge: null,
    description: 'CRM configuration'
  },
]

// Navigation Item Component with enhanced styling
const NavItem = ({ item, isActive, onClick, collapsed = false }) => {
  const Icon = item.icon

  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${isActive
          ? 'bg-indigo-50 text-indigo-700 shadow-sm dark:bg-indigo-950/30 dark:text-indigo-300'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
        } ${collapsed ? 'justify-center px-2' : ''}`}
      title={collapsed ? item.label : undefined}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r ${item.color} text-white shadow-lg shadow-indigo-500/20 transition-all group-hover:scale-105 ${isActive ? 'ring-2 ring-indigo-500/30' : ''
          }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      {!collapsed && (
        <>
          <span className="flex-1 text-left">{item.label}</span>
          {item.badge && (
            <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              {item.badge}
            </span>
          )}
          {isActive && (
            <span className="absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
          )}
        </>
      )}
      {collapsed && isActive && (
        <span className="absolute right-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
      )}
    </button>
  )
}

const CRMLayout = () => {
  const location = useLocation()
  const { user } = useAuthStore()
  const canSeeSettings = hasCompanyAdminAccess(user?.role) || isManagerRole(user?.role)
  const [searchValue, setSearchValue] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)

  const routePath = useMemo(() => {
    const pathname = location.pathname.replace(/\/+$/, '') || '/crm/pipeline'
    if (pathname === '/crm') return '/crm/pipeline'
    return pathname
  }, [location.pathname])

  const title = routePath.startsWith('/crm/companies/')
    ? 'Companies'
    : routePath.startsWith('/crm/leads/')
      ? 'Leads'
      : CRM_ROUTE_LABELS[routePath] || 'CRM'

  const description = routePath.startsWith('/crm/companies/')
    ? 'Company workspace for accounts and contacts.'
    : routePath.startsWith('/crm/leads/')
      ? 'Lead workspace for the selected record.'
      : CRM_ROUTE_DESCRIPTIONS[routePath] || 'Workspace foundation for agency relationships.'

  const searchPlaceholder = routePath.startsWith('/crm/companies')
    ? 'Search companies...'
    : routePath.startsWith('/crm/contacts')
      ? 'Search contacts...'
      : routePath === '/crm/pipeline'
        ? 'Search pipeline leads...'
        : 'Search CRM records...'

  // Determine active nav item
  const activeNavId = useMemo(() => {
    if (routePath.startsWith('/crm/pipeline')) return 'pipeline'
    if (routePath.startsWith('/crm/leads')) return 'leads'
    if (routePath.startsWith('/crm/companies')) return 'companies'
    if (routePath.startsWith('/crm/contacts')) return 'contacts'
    if (routePath.startsWith('/crm/calendar')) return 'calendar'
    if (routePath.startsWith('/crm/reports')) return 'reports'
    if (routePath.startsWith('/crm/settings')) return 'settings'
    return 'pipeline'
  }, [routePath])

  // Get current page icon
  const currentNavItem = ENHANCED_NAV_ITEMS.find(item => item.id === activeNavId)
  const PageIcon = currentNavItem?.icon || LayoutDashboard
  const pageColor = currentNavItem?.color || 'from-indigo-500 to-purple-500'

  // Toggle functions
  const toggleSidebarVisibility = () => {
    setSidebarVisible(!sidebarVisible)
  }

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  // Determine sidebar width based on state
  const getSidebarWidth = () => {
    if (!sidebarVisible) return 'w-0'
    return sidebarCollapsed ? 'w-20' : 'w-64'
  }

  return (
    <div className="flex h-full min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar Navigation */}
      <aside
        className={`sticky top-0 flex h-screen flex-col overflow-hidden border-r border-gray-200 bg-white transition-all duration-300 dark:border-gray-700 dark:bg-gray-900 ${getSidebarWidth()
          } ${!sidebarVisible ? 'border-0' : ''}`}
      >
        {sidebarVisible && (
          <>
            {/* Logo / Brand with Hide Button */}
            <div className={`flex items-center border-b border-gray-200 px-4 py-3 dark:border-gray-700 ${sidebarCollapsed ? 'flex-col gap-2' : 'justify-between'
              }`}>
              <div className={`flex items-center ${sidebarCollapsed ? 'flex-col' : 'gap-2'}`}>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/20">
                  <Sparkles className="h-4 w-4" />
                </div>
                {!sidebarCollapsed && (
                  <>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">CRM</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">v2.0</span>
                  </>
                )}
              </div>

              {/* Hide Sidebar Button - Always visible at top */}
              <button
                onClick={toggleSidebarVisibility}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300 ${sidebarCollapsed ? 'justify-center' : ''
                  }`}
                title="Hide sidebar"
              >
                <EyeOff className="h-4 w-4" />
                {!sidebarCollapsed && <span className="text-xs">Hide</span>}
              </button>
            </div>

            {/* Collapse/Expand Button - Now below the logo */}
            <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
              <button
                onClick={toggleSidebarCollapse}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 ${sidebarCollapsed ? 'justify-center' : ''
                  }`}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? (
                  <ChevronRightIcon className="h-4 w-4" />
                ) : (
                  <>
                    <ChevronLeft className="h-4 w-4" />
                    <span>Collapse</span>
                  </>
                )}
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {ENHANCED_NAV_ITEMS.filter((item) => item.id !== 'settings' || canSeeSettings).map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  isActive={activeNavId === item.id}
                  collapsed={sidebarCollapsed}
                  onClick={() => {
                    window.location.href = item.href
                  }}
                />
              ))}
            </nav>
          </>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {/* Page Header with enhanced styling */}
        <div className="border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {/* Show Sidebar Button (when hidden) */}
              {!sidebarVisible && (
                <button
                  onClick={toggleSidebarVisibility}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                  title="Show sidebar"
                >
                  <Menu className="h-5 w-5" />
                </button>
              )}

              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r ${pageColor} text-white shadow-lg shadow-indigo-500/20`}
              >
                <PageIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
                  {currentNavItem?.badge && (
                    <Badge label={currentNavItem.badge} colorKey="info" />
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
              </div>
            </div>

            {/* Quick Action */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-64 rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Breadcrumbs */}
          <div className="mt-3 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Home className="h-3.5 w-3.5" />
            <span>Workspace</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-gray-700 dark:text-gray-300">{title}</span>
          </div>
        </div>

        {/* Outlet */}
        <div className="h-[calc(100%-80px)] overflow-y-auto p-6">
          <Outlet context={{ searchValue, setSearchValue }} />
        </div>
      </div>
    </div>
  )
}

export default CRMLayout