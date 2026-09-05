import { lazy, useCallback, Suspense, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import Header from '../components/Header'
const GlobalSearch = lazy(() => import('../components/GlobalSearch').then(m => ({ default: m.GlobalSearch })))
const CommandPalette = lazy(() => import('../components/CommandPalette').then(m => ({ default: m.CommandPalette })))
const AIAssistantDialog = lazy(() => import('../components/ai/AIAssistantDialog').then(m => ({ default: m.AIAssistantDialog })))
import { SynzinHelpPrompt } from '../components/ai/SynzinHelpPrompt'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import ReminderToastListener from '../components/ReminderToastListener'
import SectionTabs from '../components/layout/SectionTabs'
import { AttendanceStatusBootstrap } from '../components/attendance/AttendanceStatusBootstrap'
import { buildBreadcrumbTrail } from '../utils/breadcrumbs'

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [synzinPromptOpen, setSynzinPromptOpen] = useState(true)
  const location = useLocation()
  const isChatPage = location.pathname === '/chat'
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  const openCommand = useCallback(() => setCommandOpen(true), [])
  const closeCommand = useCallback(() => setCommandOpen(false), [])
  // const openSearch = () => setSearchOpen(true)
  const pathSegments = location.pathname.split('/').filter(Boolean)
  const trail = buildBreadcrumbTrail(location.pathname, location.search)
  const breadcrumb = trail.join(' / ')
  const pageTitle = trail[trail.length - 1] || 'Home'
  const pageSubtitle = pathSegments.length ? 'Workspace' : 'Overview'

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
          background: var(--color-app-bg);
          position: relative;
        }

        .dark .app-shell {
          background: var(--color-app-bg);
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
          min-height: 0;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          overflow: hidden;
        }

        @media (min-width: 768px) {
          .main-content-wrapper {
            padding: 1rem 1rem 1rem 0.5rem;
            gap: 0.75rem;
          }
        }

        /* --- Content Card - Clean & Minimal --- */
        .content-card {
          background: var(--color-app-surface);
          border-radius: 1.25rem;
          border: 1px solid var(--color-app-border);
          box-shadow: 
            0 1px 3px rgba(0, 0, 0, 0.02),
            0 4px 12px rgba(0, 0, 0, 0.03);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          flex: 1 1 auto;
          min-height: 0;
          height: auto;
          overflow: hidden;
          position: relative;
        }

        .dark .content-card {
          background: var(--color-app-surface);
          border-color: var(--color-app-border);
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
          height: 100%;
          min-height: 0;
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
          padding: 0;
        }

        @media (min-width: 768px) {
          .content-inner.chat-page {
            padding: 0;
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
            title={pageTitle}
            subtitle={pageSubtitle}
            breadcrumb={breadcrumb}
            onMenuClick={() => setSidebarOpen(true)}
            onSearchOpen={openSearch}
            onCommandOpen={openCommand}
            onAssistantOpen={() => {
              setSynzinPromptOpen(false)
              setAssistantOpen(true)
            }}
          />

          {/* Content Wrapper */}
          <div className="main-content-wrapper flex-1">
            {/* In-page section tabs (tab sub-nav plan): renders only on section pages */}
            <SectionTabs />
            <div className="content-card glow-on-load page-enter">
              <div className={`content-inner ${isChatPage ? 'chat-page' : ''}`}>
                <Outlet />
              </div>
            </div>
          </div>
        </div>

        {/* Modals — lazy-loaded so their bundles don't block initial render */}
        <Suspense fallback={null}>
          <GlobalSearch isOpen={searchOpen} onClose={closeSearch} />
          <CommandPalette isOpen={commandOpen} onClose={closeCommand} />
          <AIAssistantDialog isOpen={assistantOpen} onClose={() => setAssistantOpen(false)} />
        </Suspense>
        <SynzinHelpPrompt
          isOpen={synzinPromptOpen && !assistantOpen}
          onAsk={() => {
            setSynzinPromptOpen(false)
            setAssistantOpen(true)
          }}
          onDismiss={() => setSynzinPromptOpen(false)}
          onOpen={() => setSynzinPromptOpen(true)}
        />
        <ReminderToastListener />
      </div>
      <AttendanceStatusBootstrap />
    </>
  )
}

export default MainLayout
