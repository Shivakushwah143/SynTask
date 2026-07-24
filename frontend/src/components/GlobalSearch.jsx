import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, CheckSquare, FileText, Search, Sparkles, Ticket, X, Clock, ArrowRight, FolderKanban, Users, Calendar, MessageSquare, Briefcase } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useDebounce } from '../hooks/useDebounce'
import { Skeleton } from './ui'

const icons = {
  task: CheckSquare,
  project: FolderKanban,
  ticket: Ticket,
  client: Building2,
  crm: Sparkles,
  calendar: Calendar,
  message: MessageSquare,
  user: Users,
}

// Enhanced local results with more types and metadata
const LOCAL_RESULTS = [
  { id: 'dashboard', type: 'crm', title: 'Main Dashboard', subtitle: 'Overview and widgets', keywords: ['dashboard', 'overview', 'home', 'analytics'] },
  { id: 'tasks', type: 'task', title: 'Tasks', subtitle: 'Task board and list', keywords: ['tasks', 'todo', 'work', 'assigned'] },
  { id: 'projects', type: 'project', title: 'Projects', subtitle: 'Project list and board', keywords: ['projects', 'workspaces', 'boards', 'delivery'] },
  { id: 'tickets', type: 'ticket', title: 'Service Requests', subtitle: 'Requests and support items', keywords: ['tickets', 'requests', 'support', 'help'] },
  { id: 'clients', type: 'client', title: 'Clients', subtitle: 'Client directory', keywords: ['clients', 'accounts', 'customers', 'companies'] },
  { id: 'crm-pipeline', type: 'crm', title: 'CRM Pipeline', subtitle: 'Sales pipeline board', keywords: ['crm', 'pipeline', 'sales', 'deals'] },
  { id: 'crm-leads', type: 'crm', title: 'CRM Leads', subtitle: 'Lead list and workspace', keywords: ['leads', 'prospects', 'sales'] },
  { id: 'crm-companies', type: 'crm', title: 'CRM Companies', subtitle: 'Company directory', keywords: ['companies', 'accounts', 'crm'] },
  { id: 'crm-contacts', type: 'crm', title: 'CRM Contacts', subtitle: 'Contact management', keywords: ['contacts', 'people', 'crm'] },
  { id: 'calendar', type: 'calendar', title: 'Workspace Calendar', subtitle: 'Meetings and content calendar', keywords: ['calendar', 'meetings', 'schedule', 'events'] },
  { id: 'timesheet', type: 'task', title: 'Timesheet', subtitle: 'Time tracking and logs', keywords: ['timesheet', 'hours', 'time', 'tracking'] },
  { id: 'attendance', type: 'task', title: 'Attendance', subtitle: 'Attendance tracking', keywords: ['attendance', 'check-in', 'check-out'] },
  { id: 'leaves', type: 'task', title: 'Leave Management', subtitle: 'Leave requests and approvals', keywords: ['leaves', 'holiday', 'time off', 'request'] },
  { id: 'eod', type: 'task', title: 'Daily EOD', subtitle: 'End of day reports', keywords: ['eod', 'daily', 'report', 'summary'] },
  { id: 'users', type: 'user', title: 'Users', subtitle: 'Team management', keywords: ['users', 'people', 'team', 'employees'] },
  { id: 'departments', type: 'user', title: 'Departments', subtitle: 'Department management', keywords: ['departments', 'org', 'structure'] },
  { id: 'settings', type: 'user', title: 'Settings', subtitle: 'System configuration', keywords: ['settings', 'config', 'preferences'] },
]

// Get color for result type
const getTypeColor = (type) => {
  const colors = {
    task: 'from-blue-500 to-blue-600',
    project: 'from-indigo-500 to-purple-500',
    ticket: 'from-amber-500 to-orange-500',
    client: 'from-emerald-500 to-teal-500',
    crm: 'from-purple-500 to-pink-500',
    calendar: 'from-pink-500 to-rose-500',
    message: 'from-cyan-500 to-blue-500',
    user: 'from-gray-500 to-gray-600',
  }
  return colors[type] || 'from-gray-500 to-gray-600'
}

// Get badge label for result type
const getTypeLabel = (type) => {
  const labels = {
    task: 'Task',
    project: 'Project',
    ticket: 'Ticket',
    client: 'Client',
    crm: 'CRM',
    calendar: 'Calendar',
    message: 'Message',
    user: 'User',
  }
  return labels[type] || type
}

const rankLocalResults = (query) => {
  const value = query.trim().toLowerCase()
  const scored = LOCAL_RESULTS.map((item) => {
    const haystack = [item.title, item.subtitle, ...(item.keywords || [])].join(' ').toLowerCase()
    let score = 0
    if (!value) score = 10
    else if (item.title.toLowerCase().startsWith(value)) score = 100
    else if (haystack.includes(value)) score = 60
    else if (value.split(/\s+/).some((part) => part && haystack.includes(part))) score = 40
    // Boost score for exact matches in title
    if (value && item.title.toLowerCase() === value) score = 120
    // Boost score for matches in keywords
    if (item.keywords?.some(k => k.includes(value))) score += 20
    return { ...item, score }
  })
  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
}

export function GlobalSearch({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef(null)
  const resultsRef = useRef(null)
  const navigate = useNavigate()
  const debouncedQuery = useDebounce(query, 300)
  const initialResults = useMemo(() => rankLocalResults(''), [])

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) return undefined
    setQuery('')
    setResults([])
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
        if (selected) handleSelect(selected)
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

  // Search logic
  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery.trim().length < 2) {
      setResults(initialResults)
      return undefined
    }

    let active = true
    setLoading(true)
    api.get('/search', { params: { q: debouncedQuery.trim() } })
      .then((response) => {
        if (!active) return
        const serverResults = Array.isArray(response?.data) ? response.data : Array.isArray(response?.data?.items) ? response.data.items : []
        const merged = serverResults.length ? serverResults : rankLocalResults(debouncedQuery.trim())
        setResults(merged)
        setSelectedIndex(-1)
      })
      .catch(() => {
        if (active) {
          setResults(rankLocalResults(debouncedQuery.trim()))
          setSelectedIndex(-1)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [debouncedQuery, initialResults])

  const handleSelect = (result) => {
    const paths = {
      task: `/tasks/${result.id}`,
      project: `/projects/${result.id}/board`,
      ticket: `/tickets/${result.id}`,
      client: `/clients/${result.id}/workspace`,
      crm: '/crm/pipeline',
      calendar: '/calendar',
      user: `/users/${result.id}`,
      message: `/messages/${result.id}`,
    }
    navigate(paths[result.type] || '/dashboard')
    onClose()
  }

  const getIcon = (type) => icons[type] || FileText

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-16 sm:pt-24" 
      role="dialog" 
      aria-modal="true" 
      aria-label="Global search"
    >
      {/* Backdrop */}
      <button 
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm" 
        aria-label="Close search" 
        onClick={onClose} 
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900 animate-fade-in-up">
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
          <Search className="h-5 w-5 flex-none text-gray-400 dark:text-gray-500" />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
            placeholder="Search tasks, projects, tickets, clients..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search query"
          />
          {query ? (
            <button 
              type="button" 
              onClick={() => setQuery('')} 
              className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300" 
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <kbd className="hidden rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 sm:inline-flex">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-96 overflow-y-auto p-3">
          {/* Recent searches or empty state */}
          {!query && !loading && results.length > 0 && (
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Recent & Popular
            </div>
          )}

          {loading ? (
            <div className="space-y-2 p-2" role="status" aria-label="Searching">
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

          {!loading && results.length === 0 && query && (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                <Search className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">No results found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Try adjusting your search or browse the categories below.
              </p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-1">
              {results.map((result, index) => {
                const Icon = getIcon(result.type)
                const typeColor = getTypeColor(result.type)
                const isSelected = index === selectedIndex
                const typeLabel = getTypeLabel(result.type)
                
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    onClick={() => handleSelect(result)}
                    className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 ${
                      isSelected
                        ? 'bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-950/30 dark:ring-indigo-500'
                        : 'hover:bg-gray-50 focus:bg-gray-50 dark:hover:bg-gray-800/50 dark:focus:bg-gray-800/50'
                    }`}
                  >
                    <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br ${typeColor} text-white shadow-lg shadow-indigo-500/20`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                        {result.title}
                      </span>
                      <span className="flex items-center gap-2 truncate text-xs text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          {typeLabel}
                        </span>
                        {result.subtitle}
                      </span>
                    </span>
                    {isSelected && (
                      <ArrowRight className="h-4 w-4 flex-none text-indigo-500 dark:text-indigo-400" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer with keyboard shortcuts */}
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
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {results.length} results
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