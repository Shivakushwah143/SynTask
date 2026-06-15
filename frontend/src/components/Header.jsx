import { LogOut, Menu, Search } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import NotificationBell from './NotificationBell'

const Header = ({ onMenuClick, onSearchOpen }) => {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    toast.success('Logged out successfully')
    navigate('/login')
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-3 lg:px-4">
      {/* Left Side - Menu Button & Title */}
      <div className="flex items-center space-x-3">
        {/* Mobile Menu Button */}
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5 text-gray-600" />
        </button>
        {/* Page Title */}
        <div>
          <h2 className="text-sm lg:text-base font-semibold text-gray-800 truncate max-w-[200px] lg:max-w-none">
            Welcome back, {user?.first_name}!
          </h2>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center space-x-2 lg:space-x-3">
        <button
          type="button"
          onClick={onSearchOpen}
          className="hidden min-w-44 items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm text-gray-500 transition-colors hover:bg-gray-100 md:flex"
          aria-label="Open global search"
        >
          <span className="inline-flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search
          </span>
          <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-500">Ctrl K</kbd>
        </button>

        <button
          type="button"
          onClick={onSearchOpen}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
          aria-label="Open global search"
        >
          <Search className="h-5 w-5" />
        </button>

        {/* Notifications */}
        <NotificationBell />

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center space-x-1 lg:space-x-1.5 px-2 lg:px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
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

