import { useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { GlobalSearch } from '../components/GlobalSearch'
import { CommandPalette } from '../components/CommandPalette'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import { AppShell } from '../components/layout/AppShell'

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const location = useLocation()

  const openSearch = () => setSearchOpen(true)
  const openCommandPalette = () => setCommandOpen(true)

  useKeyboardShortcut('k', openSearch, { ctrlKey: true })
  useKeyboardShortcut('k', openSearch, { metaKey: true })
  useKeyboardShortcut('k', openCommandPalette, { ctrlKey: true, shiftKey: true })
  useKeyboardShortcut('k', openCommandPalette, { metaKey: true, shiftKey: true })

  const shellTitle = useMemo(() => {
    const path = location.pathname
    if (path.startsWith('/projects')) return 'Projects'
    if (path.startsWith('/tasks')) return 'Tasks'
    if (path.startsWith('/calendar')) return 'Calendar'
    if (path.startsWith('/meetings')) return 'Meetings'
    if (path.startsWith('/reports')) return 'Reports'
    if (path.startsWith('/ai-hub')) return 'AI Hub'
    if (path.startsWith('/creative-director')) return 'Creative Director'
    if (path.startsWith('/clients')) return 'Clients'
    return 'Dashboard'
  }, [location.pathname])

  return (
    <AppShell
      sidebar={<Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}
      header={
        <Header
          title={shellTitle}
          subtitle="AI-first operating system for agency delivery"
          onMenuClick={() => setSidebarOpen(true)}
          onSearchOpen={openSearch}
          onCommandOpen={openCommandPalette}
          onLogout={() => setSidebarOpen(false)}
        />
      }
    >
      <Outlet />
      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <CommandPalette isOpen={commandOpen} onClose={() => setCommandOpen(false)} />
    </AppShell>
  )
}

export default MainLayout
