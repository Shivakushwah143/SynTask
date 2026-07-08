import { useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Settings, 
  Activity,
  LogOut,
  Loader2,
  Menu,
  X,
  Package,
  BarChart3,
  TrendingUp
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import ThemeToggle from '../components/ThemeToggle'

const SuperAdminLayout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isLoggingOut } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = async () => {
    if (isLoggingOut) return
    useUIStore.getState().setLoading(true)
    try {
      await logout()
    } finally {
      useUIStore.getState().setLoading(false)
      navigate('/login', { replace: true })
    }
  }

  const navigation = [
    {
      name: 'Dashboard',
      href: '/super-admin/dashboard',
      icon: LayoutDashboard
    },
    {
      name: 'User Management',
      href: '/super-admin/users',
      icon: Users
    },
    {
      name: 'Companies',
      href: '/super-admin/companies',
      icon: Building2
    },
    {
      name: 'Subscription Plans',
      href: '/super-admin/plans',
      icon: Package
    },
    {
      name: 'Tenant Management',
      href: '/super-admin/tenants',
      icon: Building2
    },
    {
      name: 'Usage Analytics',
      href: '/super-admin/usage',
      icon: BarChart3
    },
    {
      name: 'Billing & Revenue',
      href: '/super-admin/billing',
      icon: TrendingUp
    },
    {
      name: 'Activity Logs',
      href: '/super-admin/activity',
      icon: Activity
    },
    {
      name: 'System Settings',
      href: '/super-admin/settings',
      icon: Settings
    }
  ]

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-gray-50 dark:bg-gray-950">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transition-transform duration-300 dark:border-gray-800 dark:bg-gray-950 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">SA</span>
            </div>
            <span className="font-bold text-gray-900 dark:text-gray-100">Super Admin</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900'
                }`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{item.name}</span>
              </Link>
            )
          })}
        </nav>

        {/* User info & logout */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-700 font-medium text-sm">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Super Admin</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              aria-label={isLoggingOut ? 'Logging out' : 'Logout'}
            >
              {isLoggingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 max-w-full lg:pl-64">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 dark:border-gray-800 dark:bg-gray-950 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="flex items-center space-x-4 ml-auto">
            <ThemeToggle />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Welcome back, <span className="font-medium text-gray-900 dark:text-gray-100">{user?.first_name}</span>
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="min-w-0 max-w-full overflow-x-hidden p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default SuperAdminLayout
