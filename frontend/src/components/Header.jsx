import { LogOut, Menu, Search } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import NotificationBell from './NotificationBell'
import ThemeToggle from './ThemeToggle'

const Header = ({ onMenuClick, onSearchOpen }) => {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
    navigate('/login')
  }

  return (
    <header className="app-header h-14 border-b flex items-center justify-between px-3 lg:px-4">
      {/* Left Side - Menu Button & Title */}
      <div className="flex items-center space-x-3">
        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={onMenuClick}
          className="app-icon-button lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* Page Title */}
        <div>
          <h2 className="font-display text-sm font-bold text-[var(--color-app-text)] truncate max-w-[200px] lg:max-w-none">
            Welcome back, {user?.first_name}!
          </h2>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center space-x-2 lg:space-x-3">
        <button
          type="button"
          onClick={onSearchOpen}
          className="hidden min-w-48 items-center justify-between gap-3 rounded-xl border border-[var(--color-app-border)] bg-[var(--color-app-surface)] px-3 py-2 text-left text-sm text-[var(--color-app-text-muted)] shadow-sm transition-colors hover:bg-[var(--color-app-accent-soft)] md:flex"
          aria-label="Open global search"
        >
          <span className="inline-flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search
          </span>
          <kbd className="rounded-md border border-[var(--color-app-border)] bg-[var(--color-app-surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--color-app-text-muted)]">Ctrl K</kbd>
        </button>

        <button
          type="button"
          onClick={onSearchOpen}
          className="app-icon-button md:hidden"
          aria-label="Open global search"
        >
          <Search className="h-5 w-5" />
        </button>

        <ThemeToggle />

        {/* Notifications */}
        <NotificationBell />

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-[var(--color-app-text-secondary)] transition-colors hover:bg-[var(--color-app-accent-soft)] hover:text-[var(--color-app-accent)] lg:px-3"
          aria-label="Logout"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline text-xs font-medium">Logout</span>
        </button>
      </div>
    </header>
  )
}

export default Header


