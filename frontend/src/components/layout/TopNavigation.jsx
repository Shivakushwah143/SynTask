import { Link, useLocation } from 'react-router-dom'
import { Menu, MessageCircle, Search, Video } from 'lucide-react'
import NotificationBell from '../NotificationBell'
import ThemeToggle from '../ThemeToggle'
import { Button } from '../ui'
import { useAuthStore } from '../../store/authStore'
import { ROLE, isSuperAdminRole, normalizeRole } from '../../utils/roles'

const GLOBAL_COMMUNICATION_LINKS = [
  {
    name: 'Chat',
    href: '/chat',
    icon: MessageCircle,
    roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    module: 'task',
  },
  {
    name: 'Meetings',
    href: '/meetings',
    icon: Video,
    roles: [ROLE.ADMIN, ROLE.LEAD, ROLE.EMPLOYEE, ROLE.MANAGER],
    module: 'task',
  },
]

export function TopNavigation({ title, subtitle, breadcrumb, onMenuClick, onSearchOpen, onCommandOpen, onLogout, logoutLoading = false }) {
  const location = useLocation()
  const { user } = useAuthStore()
  const userRole = normalizeRole(user?.role)
  const hasModule = (module) =>
    !module || user?.modules?.includes(module) || isSuperAdminRole(userRole)
  const communicationLinks = GLOBAL_COMMUNICATION_LINKS.filter(
    (item) => item.roles.includes(userRole) && hasModule(item.module),
  )

  return (
    <header className="sticky top-0 z-30 min-w-0 border-b border-surface-border/80 bg-white/90 backdrop-blur-xl dark:border-gray-800/80 dark:bg-gray-950/85">
      <div className="flex h-16 min-w-0 items-center justify-between gap-3 px-3 sm:px-5 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 lg:hidden dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 max-w-full flex-1 overflow-hidden">
            <p className="truncate text-xs font-medium uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">SynTask</p>
            <h1 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
            {subtitle ? <p className="hidden truncate text-sm text-gray-500 sm:block dark:text-gray-400">{subtitle}</p> : null}
            {breadcrumb ? <p className="hidden truncate text-xs text-gray-400 md:block dark:text-gray-500">{breadcrumb}</p> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          {communicationLinks.length ? (
            <nav className="flex items-center gap-1 rounded-2xl border border-surface-border/70 bg-gray-50/70 p-1 dark:border-gray-800 dark:bg-gray-900/70" aria-label="Global communication">
              {communicationLinks.map((item) => {
                const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.name}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-medium transition-colors xl:w-auto xl:gap-2 xl:px-3 ${
                      isActive
                        ? 'bg-white text-purple-700 shadow-sm dark:bg-gray-950 dark:text-purple-200'
                        : 'text-gray-600 hover:bg-white hover:text-purple-700 dark:text-gray-300 dark:hover:bg-gray-950 dark:hover:text-purple-200'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="hidden xl:inline">{item.name}</span>
                  </Link>
                )
              })}
            </nav>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onCommandOpen} className="hidden md:inline-flex">
            <span className="inline-flex items-center gap-2">
              <Search className="h-4 w-4" />
              Command
            </span>
            <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">Ctrl K</kbd>
          </Button>
          <button
            type="button"
            onClick={onSearchOpen}
            className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 md:hidden dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Open global search"
          >
            <Search className="h-5 w-5" />
          </button>
          <ThemeToggle />
          <NotificationBell />
          <Button variant="ghost" size="sm" onClick={onLogout} loading={logoutLoading} loadingText="Logging out" className="hidden sm:inline-flex">
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}
