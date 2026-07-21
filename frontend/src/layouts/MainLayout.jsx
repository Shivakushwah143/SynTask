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

        /* --- Top Bar Accent (like the image header) --- */
        .content-card .card-header-bar {
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid rgba(226, 232, 240, 0.5);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(248, 250, 252, 0.5);
        }

        .dark .content-card .card-header-bar {
          border-bottom: 1px solid rgba(51, 65, 85, 0.3);
          background: rgba(30, 41, 59, 0.3);
        }

        .card-header-bar .title-section {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .card-header-bar .title-section h2 {
          font-size: 1rem;
          font-weight: 600;
          color: #0f172a;
          margin: 0;
        }

        .dark .card-header-bar .title-section h2 {
          color: #f1f5f9;
        }

        .card-header-bar .action-buttons {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .card-header-bar .action-buttons button {
          padding: 0.25rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          border-radius: 0.5rem;
          border: 1px solid rgba(226, 232, 240, 0.6);
          background: white;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.375rem;
        }

        .dark .card-header-bar .action-buttons button {
          background: rgba(51, 65, 85, 0.3);
          border-color: rgba(51, 65, 85, 0.4);
          color: #cbd5e1;
        }

        .card-header-bar .action-buttons button:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }

        .dark .card-header-bar .action-buttons button:hover {
          background: rgba(51, 65, 85, 0.5);
          border-color: rgba(71, 85, 105, 0.5);
        }

        .card-header-bar .action-buttons .filter-btn {
          background: rgba(99, 102, 241, 0.08);
          border-color: rgba(99, 102, 241, 0.2);
          color: #6366f1;
        }

        .dark .card-header-bar .action-buttons .filter-btn {
          background: rgba(99, 102, 241, 0.12);
          border-color: rgba(99, 102, 241, 0.2);
          color: #818cf8;
        }

        .card-header-bar .action-buttons .filter-btn:hover {
          background: rgba(99, 102, 241, 0.15);
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
        .status-footer {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 0.5rem 1.25rem;
          border-top: 1px solid rgba(226, 232, 240, 0.4);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.7rem;
          color: #94a3b8;
          background: rgba(248, 250, 252, 0.3);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }

        .dark .status-footer {
          border-top: 1px solid rgba(51, 65, 85, 0.3);
          background: rgba(30, 41, 59, 0.2);
          color: #64748b;
        }

        .status-footer .status-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .status-footer .status-dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #22c55e;
          display: inline-block;
          animation: pulseDot 2s ease-in-out infinite;
        }

        @keyframes pulseDot {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        .status-footer .status-right {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .status-footer .status-right span {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        /* --- Responsive --- */
        @media (max-width: 640px) {
          .content-card {
            border-radius: 1rem;
          }
          .content-card .card-header-bar {
            padding: 0.5rem 0.75rem;
          }
          .card-header-bar .title-section h2 {
            font-size: 0.875rem;
          }
          .status-footer {
            padding: 0.375rem 0.75rem;
            font-size: 0.6rem;
            flex-direction: column;
            gap: 0.25rem;
            align-items: flex-start;
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

        /* Stats badges like in the image */
        .stat-badge {
          display: inline-flex;
          align-items: center;
          padding: 0.125rem 0.5rem;
          border-radius: 12px;
          font-size: 0.65rem;
          font-weight: 500;
          background: rgba(99, 102, 241, 0.08);
          color: #6366f1;
        }

        .dark .stat-badge {
          background: rgba(99, 102, 241, 0.12);
          color: #818cf8;
        }

        .stat-badge.green {
          background: rgba(34, 197, 94, 0.08);
          color: #16a34a;
        }

        .dark .stat-badge.green {
          background: rgba(34, 197, 94, 0.1);
          color: #4ade80;
        }

        .stat-badge.orange {
          background: rgba(251, 146, 60, 0.08);
          color: #ea580c;
        }

        .dark .stat-badge.orange {
          background: rgba(251, 146, 60, 0.1);
          color: #fb923c;
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
              {/* Card Header - Like the image's "All Agreements" header */}
              <div className="card-header-bar">
                <div className="title-section">
                  <h2>All Agreements</h2>
                  <span className="stat-badge">24 total</span>
                </div>
                <div className="action-buttons">
                  <button className="filter-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="21" x2="4" y2="14"/>
                      <line x1="4" y1="10" x2="4" y2="3"/>
                      <line x1="12" y1="21" x2="12" y2="12"/>
                      <line x1="12" y1="8" x2="12" y2="3"/>
                      <line x1="20" y1="21" x2="20" y2="16"/>
                      <line x1="20" y1="12" x2="20" y2="3"/>
                      <line x1="1" y1="14" x2="7" y2="14"/>
                      <line x1="9" y1="8" x2="15" y2="8"/>
                      <line x1="17" y1="16" x2="23" y2="16"/>
                    </svg>
                    Filter
                  </button>
                  <button>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="4" y1="6" x2="20" y2="6"/>
                      <line x1="4" y1="12" x2="20" y2="12"/>
                      <line x1="4" y1="18" x2="20" y2="18"/>
                    </svg>
                    Sort
                  </button>
                  <button>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="16"/>
                      <line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className={`content-inner ${isChatPage ? 'chat-page' : ''}`}>
                <Outlet />
              </div>

              {/* Status Footer - Like the image's bottom section */}
              <div className="status-footer">
                <div className="status-left">
                  <span className="status-dot"></span>
                  <span>System ready · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <div className="status-right">
                  <span>
                    <span className="stat-badge green">● Open</span>
                  </span>
                  <span>
                    <span className="stat-badge orange">● In progress</span>
                  </span>
                  <span>v2.4.0</span>
                </div>
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