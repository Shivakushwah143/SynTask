import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { GlobalSearch } from '../components/GlobalSearch'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'

const BREADCRUMB_LABELS = {
  dashboard: 'Main Dashboard',
  tasks: 'Tasks',
  tickets: 'Service Requests',
  chat: 'Chat',
  projects: 'Projects',
  calendar: 'Workspace Calendar',
  meetings: 'Meetings',
  notifications: 'Notifications',
  'crm': 'CRM',
  reports: 'Workspace Reports',
  settings: 'System Settings',
}

const CRM_BREADCRUMB_LABELS = {
  pipeline: 'CRM Pipeline',
  dashboard: 'CRM Dashboard',
  leads: 'Leads',
  companies: 'CRM Companies',
  contacts: 'CRM Contacts',
  // activities: 'CRM Activities',
  calendar: 'CRM Calendar',
  reports: 'CRM Reports',
  settings: 'CRM Configuration',
}

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()
  const isChatPage = location.pathname === '/chat'
  const openSearch = () => setSearchOpen(true)
  const pathSegments = location.pathname.split('/').filter(Boolean)
  const isCrmPath = pathSegments[0] === 'crm'
  const breadcrumb = pathSegments
    .map((segment, index) => (isCrmPath && index > 0 ? CRM_BREADCRUMB_LABELS[segment] : BREADCRUMB_LABELS[segment]) || segment)
    .join(' / ')

  useKeyboardShortcut('k', openSearch, { ctrlKey: true })
  useKeyboardShortcut('k', openSearch, { metaKey: true })

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex min-w-0 w-full flex-1 flex-col  overflow-hidden">
        {/* Header */}
        <Header title="Main Dashboard" subtitle="Overview" breadcrumb={breadcrumb} onMenuClick={() => setSidebarOpen(true)} onSearchOpen={openSearch} />

        {/* Page Content */}
        <main className={`min-w-0 flex-1 px-4 pl-2 md:pl-6 py-4 md:py-6 ${isChatPage ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'} w-full`}> 
          <Outlet />
        </main>
      </div>
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}

export default MainLayout


