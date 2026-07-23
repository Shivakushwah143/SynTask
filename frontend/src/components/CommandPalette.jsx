import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Search, Sparkles, FolderKanban, CheckSquare, CalendarDays, 
  MessageSquareText, X, Command, ArrowRight, LayoutDashboard,
  Users, Settings, Clock, TrendingUp, GitBranch, Zap, Award,
  Home, Briefcase, Calendar, Activity, BarChart3, FileText
} from 'lucide-react'
import { useDebounce } from '../hooks/useDebounce'
import { Skeleton } from './ui'

// Enhanced commands with categories and keyboard shortcuts
const COMMANDS = [
  // Navigation
  { 
    id: 'dashboard', 
    label: 'Open Main Dashboard', 
    description: 'Return to the workspace overview', 
    href: '/dashboard', 
    icon: LayoutDashboard,
    category: 'Navigation',
    shortcut: 'G D'
  },
  { 
    id: 'projects', 
    label: 'Open Projects', 
    description: 'View project workspace', 
    href: '/projects', 
    icon: FolderKanban,
    category: 'Navigation',
    shortcut: 'G P'
  },
  { 
    id: 'tasks', 
    label: 'Open Tasks', 
    description: 'Review task list', 
    href: '/tasks', 
    icon: CheckSquare,
    category: 'Navigation',
    shortcut: 'G T'
  },
  { 
    id: 'calendar', 
    label: 'Open Workspace Calendar', 
    description: 'Check workspace schedule', 
    href: '/calendar', 
    icon: CalendarDays,
    category: 'Navigation',
    shortcut: 'G C'
  },
  { 
    id: 'meetings', 
    label: 'Open Meetings', 
    description: 'Review meeting cadence', 
    href: '/meetings', 
    icon: MessageSquareText,
    category: 'Navigation',
    shortcut: 'G M'
  },
  
  // CRM
  { 
    id: 'crm-pipeline', 
    label: 'Open CRM Pipeline', 
    description: 'Sales pipeline board', 
    href: '/crm/pipeline', 
    icon: TrendingUp,
    category: 'CRM',
    shortcut: 'G R'
  },
  { 
    id: 'crm-leads', 
    label: 'Open CRM Leads', 
    description: 'Lead management', 
    href: '/crm/leads', 
    icon: GitBranch,
    category: 'CRM',
    shortcut: 'G L'
  },
  { 
    id: 'crm-companies', 
    label: 'Open CRM Companies', 
    description: 'Company directory', 
    href: '/crm/companies', 
    icon: Briefcase,
    category: 'CRM',
    shortcut: 'G C'
  },
  
  // HR
  { 
    id: 'hr', 
    label: 'Open HR Dashboard', 
    description: 'HR management overview', 
    href: '/hr', 
    icon: Users,
    category: 'HR',
    shortcut: 'G H'
  },
  
  // Time & Attendance
  { 
    id: 'timesheet', 
    label: 'Open Timesheet', 
    description: 'Time tracking and logs', 
    href: '/timesheet', 
    icon: Clock,
    category: 'Time',
    shortcut: 'G I'
  },
  { 
    id: 'attendance', 
    label: 'Open Attendance', 
    description: 'Attendance tracking', 
    href: '/attendance', 
    icon: Activity,
    category: 'Time',
    shortcut: 'G A'
  },
  
  // Reports
  { 
    id: 'reports', 
    label: 'Open Reports', 
    description: 'Workspace analytics', 
    href: '/reports', 
    icon: BarChart3,
    category: 'Reports',
    shortcut: 'G R'
  },
  
  // Settings
  { 
    id: 'settings', 
    label: 'Open Settings', 
    description: 'System configuration', 
    href: '/settings', 
    icon: Settings,
    category: 'System',
    shortcut: 'G S'
  },
  
  // Quick Actions
  { 
    id: 'workflow', 
    label: 'Open Workflow Shortcuts', 
    description: 'Jump into CRM pipeline shortcuts', 
    href: '/crm/pipeline', 
    icon: Zap,
    category: 'Quick Actions',
    shortcut: '⌘ K'
  },
]

// Get icon color based on category
const getCategoryColor = (category) => {
  const colors = {
    'Navigation': 'from-indigo-500 to-purple-500',
    'CRM': 'from-blue-500 to-cyan-500',
    'HR': 'from-emerald-500 to-teal-500',
    'Time': 'from-amber-500 to-orange-500',
    'Reports': 'from-rose-500 to-pink-500',
    'System': 'from-gray-500 to-gray-600',
    'Quick Actions': 'from-purple-500 to-pink-500',
  }
  return colors[category] || 'from-gray-500 to-gray-600'
}

// Get category badge color
const getCategoryBadgeColor = (category) => {
  const colors = {
    'Navigation': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    'CRM': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    'HR': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    'Time': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    'Reports': 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    'System': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    'Quick Actions': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  }
  return colors[category] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
}

export function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const resultsRef = useRef(null)
  const navigate = useNavigate()
  const debouncedQuery = useDebounce(query, 200)

  // Get all commands
  const allCommands = COMMANDS

  // Reset and focus when opened
  useEffect(() => {
    if (!isOpen) return undefined
    setQuery('')
    setResults(allCommands)
    setSelectedIndex(-1)
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, -1))
      } else if (event.key === 'Enter' && selectedIndex >= 0) {
        event.preventDefault()
        const selected = results[selectedIndex]
        if (selected) selectCommand(selected)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, results, selectedIndex])

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const items = resultsRef.current.children
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex])

  // Filter commands based on query
  useEffect(() => {
    if (!isOpen) return undefined
    const value = debouncedQuery.trim().toLowerCase()
    if (!value) {
      setResults(allCommands)
      setLoading(false)
      return undefined
    }

    setLoading(true)
    const filtered = allCommands.filter(
      (command) =>
        command.label.toLowerCase().includes(value) ||
        command.description.toLowerCase().includes(value) ||
        command.category.toLowerCase().includes(value)
    )

    const timer = setTimeout(() => {
      setResults(filtered)
      setSelectedIndex(-1)
      setLoading(false)
    }, 120)

    return () => clearTimeout(timer)
  }, [debouncedQuery, isOpen])

  const selectCommand = (command) => {
    navigate(command.href)
    onClose()
  }

  if (!isOpen) return null

  // Group results by category
  const groupedResults = results.reduce((acc, command) => {
    const category = command.category || 'Other'
    if (!acc[category]) acc[category] = []
    acc[category].push(command)
    return acc
  }, {})

  return (
    <div 
      className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-16 sm:pt-24" 
      role="dialog" 
      aria-modal="true" 
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <button 
        type="button" 
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm" 
        aria-label="Close command palette" 
        onClick={onClose} 
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900 animate-fade-in-up">
        <div className="border-b border-gray-200 px-5 py-5 dark:border-gray-700">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Quick Search</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Search commands, projects, tasks, people, and workspace destinations.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 shadow-sm shadow-indigo-500/5 transition focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-500/15 dark:border-indigo-900/60 dark:bg-indigo-950/20 dark:focus-within:bg-gray-950">
            <Search className="h-5 w-5 flex-none text-indigo-500 dark:text-indigo-300" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-base font-medium text-gray-950 outline-none placeholder:text-gray-500 dark:text-white dark:placeholder:text-gray-400"
              placeholder="Search anything..."
              aria-label="Quick search input"
            />
            {query ? (
              <button 
                type="button" 
                onClick={() => setQuery('')} 
                className="rounded-xl p-2 text-gray-400 transition hover:bg-white hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300" 
                aria-label="Clear quick search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <kbd className="hidden rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 sm:inline-flex">
                ESC
              </kbd>
            )}
          </div>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-[28rem] overflow-y-auto p-3">
          {loading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl p-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!loading && results.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                <Command className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">No commands found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Try adjusting your search or browse the categories below.
              </p>
            </div>
          ) : null}

          {!loading && results.length > 0 && (
            <div className="space-y-4">
              {Object.entries(groupedResults).map(([category, commands]) => (
                <div key={category}>
                  <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {category}
                  </div>
                  <div className="space-y-1">
                    {commands.map((command, index) => {
                      const Icon = command.icon
                      const color = getCategoryColor(category)
                      const badgeColor = getCategoryBadgeColor(category)
                      const isSelected = selectedIndex === results.indexOf(command)
                      
                      return (
                        <button
                          key={command.id}
                          type="button"
                          onClick={() => selectCommand(command)}
                          className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 ${
                            isSelected
                              ? 'bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-950/30 dark:ring-indigo-500'
                              : 'hover:bg-gray-50 focus:bg-gray-50 dark:hover:bg-gray-800/50 dark:focus:bg-gray-800/50'
                          }`}
                        >
                          <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white shadow-lg shadow-indigo-500/20`}>
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                              {command.label}
                            </span>
                            <span className="flex items-center gap-2 truncate text-xs text-gray-500 dark:text-gray-400">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeColor}`}>
                                {command.category}
                              </span>
                              {command.description}
                            </span>
                          </span>
                          <div className="flex flex-none items-center gap-2">
                            {command.shortcut && (
                              <kbd className="hidden rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 sm:inline-flex">
                                {command.shortcut}
                              </kbd>
                            )}
                            {isSelected && (
                              <ArrowRight className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium dark:border-gray-600 dark:bg-gray-800">↑</kbd>
                <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium dark:border-gray-600 dark:bg-gray-800">↓</kbd>
                <span>Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-medium dark:border-gray-600 dark:bg-gray-800">Enter</kbd>
                <span>Select</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium dark:border-gray-600 dark:bg-gray-800">ESC</kbd>
                <span>Close</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium dark:border-gray-600 dark:bg-gray-800">⌘</kbd>
                <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium dark:border-gray-600 dark:bg-gray-800">K</kbd>
                <span>Open</span>
              </span>
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {results.length} command{results.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>
  )
}
