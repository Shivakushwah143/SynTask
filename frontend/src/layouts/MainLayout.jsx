import { useCallback, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
import { GlobalSearch } from '../components/GlobalSearch'
import { CommandPalette } from '../components/CommandPalette'
import { AIAssistantDialog } from '../components/ai/AIAssistantDialog'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import ReminderToastListener from '../components/ReminderToastListener'

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
  hr: 'HR',
  recruitment: 'Recruitment',
  jobs: 'Jobs',
  inbox: 'Inbox',
  candidates: 'Candidates',
  'resume-pool': 'Resume Pool',
  interviews: 'Interviews',
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
  const [commandOpen, setCommandOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const location = useLocation()
  const isChatPage = location.pathname === '/chat'
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  const openCommand = useCallback(() => setCommandOpen(true), [])
  const closeCommand = useCallback(() => setCommandOpen(false), [])
  // const openSearch = () => setSearchOpen(true)
  const pathSegments = location.pathname.split('/').filter(Boolean)
  const isCrmPath = pathSegments[0] === 'crm'
  const isHrPath = pathSegments[0] === 'hr'
  const breadcrumb = pathSegments
    .map((segment, index) => {
      if (isCrmPath && index > 0) return CRM_BREADCRUMB_LABELS[segment] || BREADCRUMB_LABELS[segment] || segment
      if (isHrPath && segment === 'reports') return 'Recruitment Reports'
      return BREADCRUMB_LABELS[segment] || segment
    })
    .join(' / ')

  useKeyboardShortcut('k', openCommand, { ctrlKey: true })
  useKeyboardShortcut('k', openCommand, { metaKey: true })

  return (
    <>
      <style>{`
        /* ============================================
           DASHBOARD INSPIRED BY AGREEMENTS IMAGE
           ============================================ */

        /* --- App Shell with Clean Background --- */
        .app-shell {
          background: #f1f5f9;
          position: relative;
        }

        .dark .app-shell {
          background: #0f172a;
        }

        /* Subtle background pattern */
        .app-shell::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image: 
            radial-gradient(circle at 20% 50%, rgba(99, 102, 241, 0.03) 0%, transparent 60%),
            radial-gradient(circle at 80% 20%, rgba(236, 72, 153, 0.03) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
        }

        .dark .app-shell::before {
          background-image: 
            radial-gradient(circle at 20% 50%, rgba(99, 102, 241, 0.06) 0%, transparent 60%),
            radial-gradient(circle at 80% 20%, rgba(236, 72, 153, 0.04) 0%, transparent 60%);
        }

        /* --- Main Content Wrapper --- */
        .main-content-wrapper {
          position: relative;
          z-index: 1;
          padding: 0.75rem 0.75rem 0.75rem 0.25rem;
          height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        @media (min-width: 768px) {
          .main-content-wrapper {
            padding: 1rem 1rem 1rem 0.5rem;
            gap: 0.75rem;
          }
        }

        /* --- Content Card - Clean & Minimal --- */
        .content-card {
          background: white;
          border-radius: 1.25rem;
          border: 1px solid rgba(226, 232, 240, 0.8);
          box-shadow: 
            0 1px 3px rgba(0, 0, 0, 0.02),
            0 4px 12px rgba(0, 0, 0, 0.03);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          height: 100%;
          overflow: hidden;
          position: relative;
        }

        .dark .content-card {
          background: rgba(30, 41, 59, 0.7);
          border-color: rgba(51, 65, 85, 0.4);
          box-shadow: 
            0 1px 3px rgba(0, 0, 0, 0.1),
            0 4px 12px rgba(0, 0, 0, 0.2);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        /* Subtle border glow on hover */
        .content-card:hover {
          border-color: rgba(99, 102, 241, 0.15);
          box-shadow: 
            0 1px 3px rgba(0, 0, 0, 0.03),
            0 8px 24px rgba(0, 0, 0, 0.04);
        }

        .dark .content-card:hover {
          border-color: rgba(99, 102, 241, 0.12);
          box-shadow: 
            0 1px 3px rgba(0, 0, 0, 0.15),
            0 8px 24px rgba(0, 0, 0, 0.25);
        }

        /* --- Content Inner with proper spacing --- */
        .content-inner {
          padding: 1rem;
          height: calc(100% - 48px);
          overflow-y: auto;
          overflow-x: hidden;
          scroll-behavior: smooth;
        }

        @media (min-width: 768px) {
          .content-inner {
            padding: 1.25rem 1.5rem;
          }
        }

        .content-inner.chat-page {
          overflow: hidden;
          padding: 0.75rem;
        }

        @media (min-width: 768px) {
          .content-inner.chat-page {
            padding: 1rem 1.5rem;
          }
        }

        /* --- Custom Scrollbar --- */
        .content-inner::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }

        .content-inner::-webkit-scrollbar-track {
          background: transparent;
        }

        .content-inner::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.2);
          border-radius: 10px;
          transition: background 0.3s;
        }

        .content-inner::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.4);
        }

        .dark .content-inner::-webkit-scrollbar-thumb {
          background: rgba(71, 85, 105, 0.3);
        }

        .dark .content-inner::-webkit-scrollbar-thumb:hover {
          background: rgba(71, 85, 105, 0.5);
        }

        /* --- Page Entry Animation --- */
        .page-enter {
          animation: fadeSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* --- Floating Status (like the image footer) --- */

        /* --- Responsive --- */
        @media (max-width: 640px) {
          .content-card {
            border-radius: 1rem;
          }
        }

        /* --- Optional: Subtle card shadow glow on load --- */
        .content-card.glow-on-load {
          animation: cardGlow 0.8s ease-out;
        }

        @keyframes cardGlow {
          0% {
            box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
          }
          50% {
            box-shadow: 0 0 40px 4px rgba(99, 102, 241, 0.04);
          }
          100% {
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02), 0 4px 12px rgba(0, 0, 0, 0.03);
          }
        }

        .dark .content-card.glow-on-load {
          animation: cardGlowDark 0.8s ease-out;
        }

        @keyframes cardGlowDark {
          0% {
            box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
          }
          50% {
            box-shadow: 0 0 40px 4px rgba(99, 102, 241, 0.06);
          }
          100% {
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 4px 12px rgba(0, 0, 0, 0.2);
          }
        }

      `}</style>

      <div className="app-shell flex h-screen overflow-hidden">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main Content Area */}
        <div className="flex min-w-0 w-full flex-1 flex-col overflow-hidden">
          {/* Header */}
          <Header
            title="Main Dashboard"
            subtitle="Overview"
            breadcrumb={breadcrumb}
            onMenuClick={() => setSidebarOpen(true)}
            onSearchOpen={openSearch}
            onCommandOpen={openCommand}
            onAssistantOpen={() => setAssistantOpen(true)}
          />

          {/* Content Wrapper */}
          <div className="main-content-wrapper flex-1">
            <div className="content-card glow-on-load page-enter">
              <div className={`content-inner ${isChatPage ? 'chat-page' : ''}`}>
                <Outlet />
              </div>
            </div>
          </div>
        </div>

        {/* Modals */}
        <GlobalSearch isOpen={searchOpen} onClose={closeSearch} />
        <CommandPalette isOpen={commandOpen} onClose={closeCommand} />
        <AIAssistantDialog isOpen={assistantOpen} onClose={() => setAssistantOpen(false)} />
        <ReminderToastListener />
      </div>
    </>
  )
}

export default MainLayout