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
    <header className="sticky top-0 z-30 min-w-0 border-b border-primary-200/70 bg-[rgba(252,250,244,0.98)] shadow-[0_8px_24px_rgba(63,49,37,0.08)] backdrop-blur-xl dark:border-[#5a4635] dark:bg-[rgb(36_28_20_/_0.96)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
      <div className="flex h-16 min-w-0 items-center justify-between gap-3 px-3 sm:px-5 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex rounded-full border border-surface-border bg-surface/95 p-2 text-text-secondary transition-colors hover:bg-surface-muted lg:hidden dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:text-[var(--color-app-text-secondary)] dark:hover:bg-[var(--color-app-surface-muted)]"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 max-w-full flex-1 overflow-hidden">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-text-muted dark:text-[var(--color-app-text-muted)]">SynTask</p>
            <h1 className="truncate text-base font-semibold text-text-primary dark:text-[var(--color-app-text)]">{title}</h1>
            {subtitle ? <p className="hidden truncate text-sm text-text-secondary sm:block dark:text-[var(--color-app-text-secondary)]">{subtitle}</p> : null}
            {breadcrumb ? <p className="hidden truncate text-xs text-text-muted md:block dark:text-[var(--color-app-text-muted)]">{breadcrumb}</p> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          {communicationLinks.length ? (
            <nav className="flex items-center gap-1 rounded-full border border-surface-border/70 bg-surface/90 p-1 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]" aria-label="Global communication">
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
                        ? 'bg-primary-500 text-white shadow-none dark:bg-primary-500 dark:text-white'
                        : 'text-text-secondary hover:bg-surface-muted hover:text-primary-600 dark:text-[var(--color-app-text-secondary)] dark:hover:bg-[var(--color-app-surface-muted)] dark:hover:text-primary-200'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="hidden xl:inline">{item.name}</span>
                  </Link>
                )
              })}
            </nav>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onCommandOpen} className="hidden md:inline-flex rounded-full border border-surface-border bg-surface/95 text-text-primary hover:bg-surface-muted dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:text-[var(--color-app-text)]">
            <span className="inline-flex items-center gap-2">
              <Search className="h-4 w-4" />
              Command
            </span>
            <kbd className="rounded-full border border-surface-border bg-surface-muted px-1.5 py-0.5 text-[10px] text-text-muted dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)] dark:text-[var(--color-app-text-muted)]">Ctrl K</kbd>
          </Button>
          <button
            type="button"
            onClick={onSearchOpen}
            className="rounded-full border border-surface-border bg-surface/95 p-2 text-text-secondary transition-colors hover:bg-surface-muted md:hidden dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:text-[var(--color-app-text-secondary)] dark:hover:bg-[var(--color-app-surface-muted)]"
            aria-label="Open global search"
          >
            <Search className="h-5 w-5" />
          </button>
          <ThemeToggle />
          {showAiFullscreenAction ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('syntask:toggle-ai-briefing-fullscreen'))}
              className="rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label={fullscreenLabel}
              title={fullscreenLabel}
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
          ) : null}
          <NotificationBell />
          <Button variant="ghost" size="sm" onClick={onLogout} loading={logoutLoading} loadingText="Logging out" className="hidden sm:inline-flex rounded-full border border-surface-border bg-surface/95 text-text-primary hover:bg-surface-muted dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:text-[var(--color-app-text)]">
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}
