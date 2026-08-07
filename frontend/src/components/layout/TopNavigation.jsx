import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Maximize2, Menu, MessageCircle, Minimize2, Search, Video, LayoutDashboard } from 'lucide-react'
import NotificationBell from '../NotificationBell'
import ThemeToggle from '../ThemeToggle'
import GlobalClock from '../GlobalClock'
import AttendanceStatusPill from '../attendance/AttendanceStatusPill'
import { Button } from '../ui'
import { useAuthStore } from '../../store/authStore'
import { ROLE, hasCompanyAdminAccess, isManagerRole, normalizeRole } from '../../utils/roles'
import { filterNavItems } from '../../utils/rbac'
import { SynzinAvatar } from '../ai/SynzinAvatar'
import { getAvatarUrl } from '../../utils/avatarUrl'

// Same role set used by the sidebar (backend: /chat is gated by the chat module
// which aliases task; /meetings has no backend module gate).
const ALL_ROLES = [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.SUB_ADMIN, ROLE.MANAGER, ROLE.LEAD, ROLE.EMPLOYEE]

const GLOBAL_COMMUNICATION_LINKS = [
  {
    name: 'Chat',
    href: '/chat',
    icon: MessageCircle,
    roles: ALL_ROLES,
    module: 'chat',
  },
  {
    name: 'Meetings',
    href: '/meetings',
    icon: Video,
    roles: ALL_ROLES,
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
  const communicationLinks = filterNavItems(GLOBAL_COMMUNICATION_LINKS, user)
  const canUseAssistant = hasCompanyAdminAccess(userRole) || isManagerRole(userRole)
  const avatarUrl = getAvatarUrl(user?.avatar, user?.avatar_version)
  const searchShortcut = useMemo(() => getSearchShortcutLabel(), [])
  const [highlightSearch, setHighlightSearch] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const storageKey = 'syntask:search-discovery-seen'
    if (window.localStorage.getItem(storageKey)) return undefined
    setHighlightSearch(true)
    window.localStorage.setItem(storageKey, 'true')
    const timer = window.setTimeout(() => setHighlightSearch(false), 1800)
    return () => window.clearTimeout(timer)
  }, [])

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
                {/* {subtitle && (
                  <p className="hidden truncate text-xs text-gray-500 sm:block dark:text-gray-400">
                    {subtitle}
                  </p>
                )} */}
                {breadcrumb && (
                  <p className="hidden truncate text-xs text-gray-400 md:block dark:text-gray-500">
                    {breadcrumb}
                  </p>
                )}
                {/* <p className="hidden truncate text-xs text-indigo-600 lg:block dark:text-indigo-300">
                  Tip: Press {searchShortcut} to search commands, projects, tasks, and people.
                </p> */}
              </div>
            </div>
          </div>
        </div>

        {/* Right Section - Actions */}
        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          <GlobalClock />
          {/* Attendance Status (status indicator + navigation shortcut only) */}
          <AttendanceStatusPill />
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

          {/* Quick Search */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSearchOpen || onCommandOpen}
            className={`hidden md:inline-flex h-10 w-[18rem] max-w-[28vw] items-center gap-3 rounded-2xl border bg-white px-3 text-sm font-medium text-gray-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-white hover:text-gray-900 hover:shadow-lg hover:shadow-indigo-500/10 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 xl:w-[23rem] dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white ${
              highlightSearch
                ? 'animate-[search-discovery-pulse_1.4s_ease-out_1] border-indigo-400 shadow-lg shadow-indigo-500/20 dark:border-indigo-500'
                : 'border-gray-200 dark:border-gray-700'
            }`}
            aria-label="Open quick search. Search commands, projects, tasks, and people."
          >
            <Search className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
            <span className="min-w-0 flex-1 truncate text-left text-gray-500 dark:text-gray-300">Search projects, tasks...</span>
            <kbd className="shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {searchShortcut}
            </kbd>
          </Button>

          {/* Mobile Search */}
          <button
            type="button"
            onClick={onSearchOpen || onCommandOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 md:hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
            aria-label="Open quick search"
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

          <div className="hidden h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-xs font-semibold text-white shadow-sm dark:border-gray-700 sm:flex" aria-label="Current user profile photo">
            {avatarUrl ? (
              <img src={avatarUrl} alt={user?.first_name || 'Profile'} className="h-full w-full object-cover" />
            ) : (
              <span>{user?.first_name?.[0]}{user?.last_name?.[0]}</span>
            )}
          </div>

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

function getSearchShortcutLabel() {
  if (typeof window === 'undefined') return 'Ctrl K'
  const platform = window.navigator?.platform || ''
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘ K' : 'Ctrl K'
}


