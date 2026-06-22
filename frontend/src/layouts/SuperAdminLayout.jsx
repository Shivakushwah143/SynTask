import { useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  Settings, 
  Activity,
  LogOut,
  Menu,
  X,
  Package,
  BarChart3,
  TrendingUp
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import ThemeToggle from '../components/ThemeToggle'

const SuperAdminLayout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
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
    <div className="app-shell min-h-screen">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`app-header fixed top-0 left-0 z-50 h-full w-64 border-r transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-[var(--color-app-border)]">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">SA</span>
            </div>
            <span className="font-display font-bold text-[var(--color-app-text)]">Super Admin</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="app-icon-button lg:hidden"
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
                    ? 'bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-200/70 dark:bg-primary-950/60 dark:text-primary-200 dark:ring-primary-500/20'
                    : 'text-[var(--color-app-text-secondary)] hover:bg-[var(--color-app-accent-soft)] hover:text-[var(--color-app-accent)]'
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
        <div className="absolute bottom-0 left-0 right-0 border-t border-[var(--color-app-border)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-700 font-medium text-sm">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-app-text)]">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs text-[var(--color-app-text-muted)]">Super Admin</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="app-icon-button"
              aria-label="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="app-header h-16 border-b flex items-center justify-between px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="app-icon-button lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="flex items-center space-x-4 ml-auto">
            <ThemeToggle />
            <span className="text-sm text-[var(--color-app-text-secondary)]">
              Welcome back, <span className="font-semibold text-[var(--color-app-text)]">{user?.first_name}</span>
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default SuperAdminLayout


