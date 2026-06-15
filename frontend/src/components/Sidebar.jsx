import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Building2,
  Settings,
  CreditCard,
  Clock,
  Calendar as CalendarIcon,
  BarChart3,
  TrendingUp,
  Video,
  FolderKanban,
  Ticket,
  MessageCircle,
  Briefcase,
  FileText,
  X,
  DollarSign,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation()
  const { user } = useAuthStore()
  const userRole = user?.role === 'admin' ? 'company_admin' : user?.role
  const hasModule = (module) => !module || user?.modules?.includes(module) || userRole === 'super_admin'

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      roles: ['super_admin', 'company_admin', 'lead', 'employee', 'manager'],
    },
    {
      name: 'Projects',
      href: '/projects',
      icon: FolderKanban,
      roles: ['company_admin', 'lead', 'employee', 'manager'],
      module: 'task',
    },
    {
      name: 'Requests',
      href: '/tickets',
      icon: Ticket,
      roles: ['company_admin', 'lead', 'employee', 'manager'],
      module: 'task',
    },
    {
      name: 'Chat',
      href: '/chat',
      icon: MessageCircle,
      roles: ['company_admin', 'lead', 'employee', 'manager'],
      module: 'task',
    },
    {
      name: 'Meetings',
      href: '/meetings',
      icon: Video,
      roles: ['company_admin', 'lead', 'employee', 'manager'],
      module: 'task',
    },
    {
      name: 'Calendar',
      href: '/calendar',
      icon: CalendarIcon,
      roles: ['company_admin', 'lead', 'employee', 'manager'],
      module: 'task',
    },
    {
      name: 'Timesheet',
      href: '/timesheet',
      icon: Clock,
      roles: ['company_admin', 'lead', 'employee', 'manager'],
      module: 'task',
    },
    {
      name: 'Reports',
      href: '/reports',
      icon: BarChart3,
      roles: ['company_admin', 'lead', 'employee', 'manager'],
      module: 'task',
    },
    {
      name: 'Sales',
      href: '/sales',
      icon: TrendingUp,
      roles: ['company_admin', 'lead', 'employee', 'manager'],
      module: 'sales',
    },
    {
      name: 'Clients',
      href: '/clients',
      icon: Briefcase,
      roles: ['company_admin'],
      module: 'task',
    },
    {
      name: 'Invoices',
      href: '/invoices',
      icon: FileText,
      roles: ['company_admin'],
      module: 'task',
    },
    {
      name: 'MSA',
      href: '/msa',
      icon: FileText,
      roles: ['company_admin', 'lead'],
      module: 'task',
    },
    {
      name: 'Ledger',
      href: '/ledger',
      icon: DollarSign,
      roles: ['company_admin'],
      module: 'task',
    },
    {
      name: 'Users',
      href: '/users',
      icon: Users,
      roles: ['company_admin', 'super_admin'],
    },
    {
      name: 'My Team',
      href: '/my-team',
      icon: Users,
      roles: ['lead'],
      module: 'task',
    },
    {
      name: 'Companies',
      href: '/companies',
      icon: Building2,
      roles: ['super_admin'],
    },
    {
      name: 'Subscriptions',
      href: '/subscriptions',
      icon: CreditCard,
      roles: ['company_admin'],
    },
    {
      name: 'Activity Log',
      href: '/activity',
      icon: Clock,
      roles: ['company_admin', 'lead'],
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      roles: ['super_admin', 'company_admin', 'lead', 'employee', 'manager'],
    },
  ]

  const filteredNavigation = navigation.filter((item) =>
    item.roles.includes(userRole) && hasModule(item.module)
  )

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
          role="presentation"
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 lg:w-52 bg-white border-r border-gray-200 flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <img
              src="/logo.svg"
              alt="SynTask Logo"
              className="h-8 w-8 object-contain"
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
            <h1 className="text-base font-bold text-primary-600">SynTask</h1>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1 hover:bg-gray-100 rounded"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {filteredNavigation.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.name}
                to={item.href}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.name}
                onClick={onClose}
                className={`flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors ${isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-700 hover:bg-gray-50'
                  }`}
              >
                <item.icon className="mr-2.5 h-5 w-5 flex-shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            )
          })}
        </nav>

        {/* User Info */}
        <div className="p-4 border-t border-gray-200">
          <Link
            to="/settings"
            className="flex items-center hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors cursor-pointer"
            onClick={onClose}
          >
            <div className="flex-shrink-0">
              {user?.avatar ? (
                <img
                  src={user.avatar.startsWith('http') ? user.avatar : `${import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000'}${user.avatar}`}
                  alt={user?.first_name}
                  className="h-10 w-10 rounded-full object-cover border border-gray-200"
                  onError={(e) => {
                    // Fallback to initials if image fails to load
                    e.target.style.display = 'none'
                    e.target.nextSibling.style.display = 'flex'
                  }}
                />
              ) : null}
              <div className={`h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center ${user?.avatar ? 'hidden' : ''}`}>
                <span className="text-primary-600 font-semibold text-sm">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </span>
              </div>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-xs text-gray-500 capitalize truncate">
                {user?.role?.replace('_', ' ')}
              </p>
            </div>
          </Link>
        </div>
      </div>
    </>
  )
}

export default Sidebar
