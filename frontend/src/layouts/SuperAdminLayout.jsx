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
  TrendingUp,
  Zap
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import ThemeToggle from '../components/ThemeToggle'
import { AIAssistantDialog } from '../components/ai/AIAssistantDialog'
import { SynzinAvatar } from '../components/ai/SynzinAvatar'
import { SynzinHelpPrompt } from '../components/ai/SynzinHelpPrompt'

const SuperAdminLayout = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, isLoggingOut } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [synzinPromptOpen, setSynzinPromptOpen] = useState(true)

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
      name: 'Subscription Plans',
      href: '/super-admin/plans',
      icon: Package
    },
    {
      name: 'Clients',
      href: '/super-admin/tenants',
      icon: Building2
    },
    {
      name: 'Billing & Revenue',
      href: '/super-admin/billing',
      icon: TrendingUp
    },
    {
      name: 'Usage Analytics',
      href: '/super-admin/usage',
      icon: BarChart3
    },
    {
      name: 'Feature Flags',
      href: '/super-admin/feature-flags',
      icon: Zap
    },
    {
      name: 'Platform Audit Log',
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
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-surface-muted dark:bg-black">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 border-r border-surface-border bg-surface/95 transition-transform duration-300 dark:border-gray-800 dark:bg-black lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-surface-border px-6 dark:border-gray-800">
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
              <span className="text-sm font-bold text-white">SA</span>
            </div>
            <span className="font-bold text-text-primary dark:text-gray-100">Super Admin</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 text-text-muted hover:bg-surface-muted hover:text-text-primary dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 lg:hidden"
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
                    : 'text-text-secondary hover:bg-surface-muted dark:text-gray-300 dark:hover:bg-black'
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
        <div className="absolute bottom-0 left-0 right-0 border-t border-surface-border p-4 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                <span className="text-sm font-medium text-primary-700">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary dark:text-gray-100">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs text-text-secondary dark:text-gray-400">Super Admin</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-lg p-2 text-text-muted hover:bg-surface-muted hover:text-text-primary dark:hover:bg-gray-800 dark:hover:text-gray-100"
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
        <header className="flex h-16 items-center justify-between border-b border-surface-border bg-surface/95 px-4 dark:border-gray-800 dark:bg-black lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-text-muted hover:bg-surface-muted hover:text-text-primary dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="flex items-center space-x-4 ml-auto">
            <button
              type="button"
              onClick={() => {
                setSynzinPromptOpen(false)
                setAssistantOpen(true)
              }}
              className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface/95 px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-muted dark:border-gray-800 dark:bg-black dark:text-gray-100 dark:hover:bg-gray-900"
            >
              <SynzinAvatar />
              Synzin
            </button>
            <ThemeToggle />
            <span className="text-sm text-text-secondary dark:text-gray-300">
              Welcome back, <span className="font-medium text-text-primary dark:text-gray-100">{user?.first_name}</span>
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="min-w-0 max-w-full overflow-x-hidden p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
      <AIAssistantDialog isOpen={assistantOpen} onClose={() => setAssistantOpen(false)} />
      <SynzinHelpPrompt
        isOpen={synzinPromptOpen && !assistantOpen}
        onAsk={() => {
          setSynzinPromptOpen(false)
          setAssistantOpen(true)
        }}
        onDismiss={() => setSynzinPromptOpen(false)}
      />
    </div>
  )
}

export default SuperAdminLayout
