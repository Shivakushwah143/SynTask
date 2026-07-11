import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { GlobalSearch } from '../components/GlobalSearch'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'

const BREADCRUMB_LABELS = {
  dashboard: 'Dashboard',
  tasks: 'Tasks',
  tickets: 'Requests',
  chat: 'Chat',
  projects: 'Projects',
  calendar: 'Calendar',
  meetings: 'Meetings',
  notifications: 'Notifications',
  'crm': 'CRM',
  pipeline: 'Pipeline',
  leads: 'Leads',
  companies: 'Companies',
  contacts: 'Contacts',
  activities: 'Activities',
  reports: 'Reports',
  settings: 'Settings',
}

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()
  const isChatPage = location.pathname === '/chat'
  const isDashboardPage = location.pathname === '/dashboard' || location.pathname === '/'
  const openSearch = () => setSearchOpen(true)
  const breadcrumbParts = location.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => BREADCRUMB_LABELS[segment] || segment)
  const breadcrumb = breadcrumbParts.join(' / ')
  const pageTitle = breadcrumbParts[breadcrumbParts.length - 1] || 'Dashboard'

  useKeyboardShortcut('k', openSearch, { ctrlKey: true })
  useKeyboardShortcut('k', openSearch, { metaKey: true })

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex min-w-0 w-full flex-1 flex-col overflow-hidden">
        {/* Header */}
        <Header title={pageTitle} subtitle="Workspace overview" breadcrumb={breadcrumb} onMenuClick={() => setSidebarOpen(true)} onSearchOpen={openSearch} showAiFullscreenAction={isDashboardPage} />

        {/* Page Content */}
        <main className={`min-w-0 flex-1 ${isChatPage ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'} w-full`}> 
          <Outlet />
        </main>
      </div>
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}

export default MainLayout
