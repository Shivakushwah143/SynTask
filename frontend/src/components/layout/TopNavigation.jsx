import { Link, useLocation } from 'react-router-dom'
import { Maximize2, Menu, MessageCircle, Minimize2, Search, Video, Command, Sparkles, LayoutDashboard, Bell } from 'lucide-react'
import NotificationBell from '../NotificationBell'
import ThemeToggle from '../ThemeToggle'
import GlobalClock from '../GlobalClock'
import { Button } from '../ui'
import { useAuthStore } from '../../store/authStore'
import { ROLE, hasCompanyAdminAccess, isManagerRole, isSuperAdminRole, normalizeRole } from '../../utils/roles'
import { SynzinAvatar } from '../ai/SynzinAvatar'

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

export function TopNavigation({
  title,
  subtitle,
  breadcrumb,
  onMenuClick,
  onSearchOpen,
  onCommandOpen,
  onAssistantOpen,
  onLogout,
  logoutLoading = false,
  showAiFullscreenAction = false,
  isFullscreen = false,
  fullscreenLabel = 'Toggle AI briefing fullscreen',
}) {
  const location = useLocation()
  const { user } = useAuthStore()
  const userRole = normalizeRole(user?.role)
  const hasModule = (module) =>
    !module || user?.modules?.includes(module) || isSuperAdminRole(userRole)
  const communicationLinks = GLOBAL_COMMUNICATION_LINKS.filter(
    (item) => item.roles.includes(userRole) && hasModule(item.module),
  )
  const canUseAssistant = hasCompanyAdminAccess(userRole) || isManagerRole(userRole)

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-xl shadow-sm dark:border-gray-700 dark:bg-gray-900/95">
      <div className="flex h-16 items-center justify-between gap-3 px-3 sm:px-5 lg:px-6">
        {/* Left Section - Logo & Title */}
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 lg:hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          
          <div className="min-w-0 max-w-full flex-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/20">
                <LayoutDashboard className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                  {title}
                </h1>
                {subtitle && (
                  <p className="hidden truncate text-xs text-gray-500 sm:block dark:text-gray-400">
                    {subtitle}
                  </p>
                )}
                {breadcrumb && (
                  <p className="hidden truncate text-xs text-gray-400 md:block dark:text-gray-500">
                    {breadcrumb}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Section - Actions */}
        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          <GlobalClock />
          {/* Communication Links */}
          {communicationLinks.length > 0 && (
            <nav className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50/80 p-1 dark:border-gray-700 dark:bg-gray-800/50" aria-label="Global communication">
              {communicationLinks.map((item) => {
                const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.name}
                    className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-indigo-400'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{item.name}</span>
                  </Link>
                )
              })}
            </nav>
          )}

          {/* AI Assistant Button */}
          {canUseAssistant && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAssistantOpen}
              className="hidden sm:inline-flex h-9 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition-all hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
            >
              <SynzinAvatar />
              <span>Synzin</span>
            </Button>
          )}

          {/* Command Palette Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onCommandOpen}
            className="hidden md:inline-flex h-9 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
          >
            <Search className="h-4 w-4" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 lg:inline-flex">
              ⌘K
            </kbd>
          </Button>

          {/* Mobile Search */}
          <button
            type="button"
            onClick={onSearchOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 md:hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
            aria-label="Open global search"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* AI Fullscreen Toggle */}
          {showAiFullscreenAction && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('syntask:toggle-ai-briefing-fullscreen'))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
              aria-label={fullscreenLabel}
              title={fullscreenLabel}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          )}

          {/* Notification Bell */}
          <NotificationBell />

          {/* Logout Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            loading={logoutLoading}
            loadingText="Logging out"
            className="hidden sm:inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-600 transition-all hover:bg-rose-50 hover:text-rose-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}
