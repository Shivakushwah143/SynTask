import { useEffect, useState } from 'react'
import { Maximize2, Menu, Minimize2, Search } from 'lucide-react'
import NotificationBell from '../NotificationBell'
import ThemeToggle from '../ThemeToggle'
import { Button } from '../ui'

export function TopNavigation({ title, subtitle, breadcrumb, onMenuClick, onSearchOpen, onCommandOpen, onLogout, logoutLoading = false, showAiFullscreenAction = false }) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement))
    syncFullscreen()
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  const fullscreenLabel = isFullscreen
    ? 'Exit AI briefing fullscreen. Shortcut: Esc'
    : 'Open AI briefing fullscreen. Shortcut: click this button, Esc exits fullscreen'

  return (
    <header className="sticky top-0 z-30 min-w-0 border-b border-surface-border/80 bg-white/90 backdrop-blur-xl dark:border-gray-800/80 dark:bg-gray-950/85">
      <div className="flex h-16 min-w-0 items-center justify-between gap-2 px-3 sm:gap-4 sm:px-5 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex shrink-0 rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 lg:hidden dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 truncate text-sm font-semibold leading-5 text-gray-900 sm:text-base dark:text-gray-100">{title}</h1>
              {breadcrumb && breadcrumb !== title ? (
                <span className="hidden min-w-0 truncate text-xs text-gray-400 md:inline dark:text-gray-500">/ {breadcrumb}</span>
              ) : null}
            </div>
            {subtitle ? <p className="hidden truncate text-xs leading-4 text-gray-500 sm:block dark:text-gray-400">{subtitle}</p> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
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
          <Button variant="ghost" size="sm" onClick={onLogout} loading={logoutLoading} loadingText="Logging out" className="hidden sm:inline-flex">
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}
