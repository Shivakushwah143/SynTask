import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { AIAssistantDialog } from '../components/ai/AIAssistantDialog'

const SalesLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

  return (
    <div className="flex h-screen w-full max-w-full overflow-hidden bg-surface-muted dark:bg-black">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} moduleName="sales" />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} onAssistantOpen={() => setAssistantOpen(true)} />
        <main className="min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto bg-surface-muted dark:bg-black">
          <Outlet />
        </main>
      </div>
      <AIAssistantDialog isOpen={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  )
}

export default SalesLayout
