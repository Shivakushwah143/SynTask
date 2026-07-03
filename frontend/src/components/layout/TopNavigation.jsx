import { Menu, Search } from 'lucide-react'
import NotificationBell from '../NotificationBell'
import ThemeToggle from '../ThemeToggle'
import { Button } from '../ui'

export function TopNavigation({ title, subtitle, onMenuClick, onSearchOpen, onCommandOpen, onLogout, logoutLoading = false }) {
  return (
    <header className="sticky top-0 z-30 border-b border-surface-border/80 bg-white/85 backdrop-blur-xl dark:border-gray-800/80 dark:bg-gray-950/85">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex rounded-xl p-2 text-gray-600 transition-colors hover:bg-gray-100 lg:hidden dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">SynTask</p>
            <h1 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
            {subtitle ? <p className="truncate text-sm text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
