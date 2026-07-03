import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { GlobalSearch } from '../components/GlobalSearch'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()
  const isChatPage = location.pathname === '/chat'
  const openSearch = () => setSearchOpen(true)

  useKeyboardShortcut('k', openSearch, { ctrlKey: true })
  useKeyboardShortcut('k', openSearch, { metaKey: true })

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col ml-2 overflow-hidden min-w-0 w-full">
        {/* Header */}
        <Header onMenuClick={() => setSidebarOpen(true)} onSearchOpen={openSearch} />

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





