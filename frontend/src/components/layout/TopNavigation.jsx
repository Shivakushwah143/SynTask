import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LogOut, Maximize2, Menu, MessageCircle, Minimize2, Search, Settings, Video, LayoutDashboard } from 'lucide-react'
import NotificationBell from '../NotificationBell'
import ThemeToggle from '../ThemeToggle'
import GlobalClock from '../GlobalClock'
import AttendanceStatusPill from '../attendance/AttendanceStatusPill'
import { Button } from '../ui'
import { useAuthStore } from '../../store/authStore'
import { ROLE, getRoleLabel, hasCompanyAdminAccess, isManagerRole, normalizeRole } from '../../utils/roles'
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
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  // Close the mobile/desktop user menu on outside click or route change.
  useEffect(() => {
    if (!userMenuOpen) return undefined
    const onPointerDown = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setUserMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [userMenuOpen])

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
      <div className="flex h-12 items-center justify-between gap-2 px-3 sm:px-5 lg:px-6">
        {/* Left Section - Logo & Title */}
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 lg:hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
            aria-label="Open navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
          
          <div className="min-w-0 max-w-full flex-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/20">
                <LayoutDashboard className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
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
        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-1.5">
          {/* Clock is secondary; hidden on small phones so attendance, search,
              notifications and the account menu never collide or overflow. */}
          <div className="hidden md:flex">
            <GlobalClock />
          </div>
          {/* Attendance Status (status indicator + navigation shortcut only) */}
          <AttendanceStatusPill />
          {/* Communication Links */}
          {communicationLinks.length > 0 && (
            <nav className="hidden items-center gap-1 rounded-xl border border-gray-200 bg-gray-50/80 p-1 sm:flex dark:border-gray-700 dark:bg-gray-800/50" aria-label="Global communication">
              {communicationLinks.map((item) => {
                const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.name}
                    className={`inline-flex h-7 items-center justify-center rounded-lg px-2 text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-indigo-400'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                  </Link>
                )
              })}
            </nav>
          )}

          {/* AI Assistant Button */}
          {canUseAssistant && (
            <button
              type="button"
              onClick={onAssistantOpen}
              className="hidden sm:inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-all hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
              aria-label="Open AI assistant"
              title="Open AI assistant"
            >
              <SynzinAvatar size="xs" />
            </button>
          )}

          {/* Quick Search */}
          <button
            type="button"
            onClick={onSearchOpen || onCommandOpen}
            className={`hidden md:inline-flex h-8 min-w-0 w-44 max-w-[18vw] items-center gap-2 rounded-full border bg-white px-3 text-sm font-medium text-gray-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-white hover:text-gray-900 hover:shadow-lg hover:shadow-indigo-500/10 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 xl:w-56 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white ${
              highlightSearch
                ? 'animate-[search-discovery-pulse_1.4s_ease-out_1] border-indigo-400 shadow-lg shadow-indigo-500/20 dark:border-indigo-500'
                : 'border-gray-200 dark:border-gray-700'
            }`}
            aria-label="Open quick search. Search commands, projects, tasks, and people."
          >
            <Search className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
            <span className="min-w-0 flex-1 truncate text-left text-gray-500 dark:text-gray-300">Search projects, tasks...</span>
            <kbd className="hidden shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-2  text-[10px] font-semibold text-gray-500 lg:inline-flex dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {searchShortcut}
            </kbd>
          </button>

          {/* Mobile Search */}
          <button
            type="button"
            onClick={onSearchOpen || onCommandOpen}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 md:hidden dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
            aria-label="Open quick search"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* AI Fullscreen Toggle */}
          {showAiFullscreenAction && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('syntask:toggle-ai-briefing-fullscreen'))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
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

          {/* Account menu — always visible, including phones. Previously the
              avatar and logout were hidden below sm, leaving mobile users with
              no way to reach profile settings or log out. */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              aria-label="Account menu"
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-xs font-semibold text-white shadow-sm transition-all hover:ring-2 hover:ring-indigo-500/30 dark:border-gray-700"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={user?.first_name || 'Profile'} className="h-full w-full object-cover" />
              ) : (
                <span>{user?.first_name?.[0]}{user?.last_name?.[0]}</span>
              )}
            </button>
            {userMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900"
              >
                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {`${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Account'}
                  </p>
                  <p className="truncate text-xs capitalize text-gray-500 dark:text-gray-400">
                    {getRoleLabel(user?.role)}
                  </p>
                </div>
                <Link
                  to="/settings"
                  role="menuitem"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex min-h-10 items-center gap-2 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false)
                    onLogout?.()
                  }}
                  disabled={logoutLoading}
                  className="flex min-h-10 w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                >
                  <LogOut className="h-4 w-4" />
                  {logoutLoading ? 'Logging out…' : 'Logout'}
                </button>
              </div>
            ) : null}
          </div>

          {/* Logout Button (desktop/tablet keeps its existing inline action) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            loading={logoutLoading}
            loadingText="Logging out"
            className="hidden sm:inline-flex h-8 items-center rounded-xl border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 transition-all hover:bg-rose-50 hover:text-rose-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
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


