import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2,
  Calendar,
  CheckSquare,
  Clock,
  FileText,
  FolderKanban,
  History,
  MessageSquare,
  Search,
  Sparkles,
  Ticket,
  Users,
  X,
  ArrowRight,
} from 'lucide-react'
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

// Quick page shortcuts shown before the user types (empty query state). Results
// from the backend always win once a query is entered.
const LOCAL_RESULTS = [
  { id: 'dashboard', type: 'crm', title: 'Main Dashboard', subtitle: 'Overview and widgets', href: '/dashboard', keywords: ['dashboard', 'overview', 'home', 'analytics'] },
  { id: 'tasks', type: 'task', title: 'Tasks', subtitle: 'Task board and list', href: '/tasks', keywords: ['tasks', 'todo', 'work', 'assigned'] },
  { id: 'projects', type: 'project', title: 'Projects', subtitle: 'Project list and board', href: '/projects', keywords: ['projects', 'workspaces', 'boards', 'delivery'] },
  { id: 'tickets', type: 'ticket', title: 'Service Requests', subtitle: 'Requests and support items', href: '/tickets', keywords: ['tickets', 'requests', 'support', 'help'] },
  { id: 'clients', type: 'client', title: 'Clients', subtitle: 'Client directory', href: '/clients', keywords: ['clients', 'accounts', 'customers', 'companies'] },
  { id: 'crm-pipeline', type: 'crm', title: 'CRM Pipeline', subtitle: 'Sales pipeline board', href: '/crm/pipeline', keywords: ['crm', 'pipeline', 'sales', 'deals'] },
  { id: 'crm-leads', type: 'crm', title: 'CRM Leads', subtitle: 'Lead list and workspace', href: '/crm/leads', keywords: ['leads', 'prospects', 'sales'] },
  { id: 'crm-companies', type: 'crm', title: 'CRM Companies', subtitle: 'Company directory', href: '/crm/companies', keywords: ['companies', 'accounts', 'crm'] },
  { id: 'crm-contacts', type: 'crm', title: 'CRM Contacts', subtitle: 'Contact management', href: '/crm/contacts', keywords: ['contacts', 'people', 'crm'] },
  { id: 'calendar', type: 'calendar', title: 'Workspace Calendar', subtitle: 'Meetings and content calendar', href: '/calendar', keywords: ['calendar', 'meetings', 'schedule', 'events'] },
  { id: 'timesheet', type: 'task', title: 'Timesheet', subtitle: 'Time tracking and logs', href: '/timesheet', keywords: ['timesheet', 'hours', 'time', 'tracking'] },
  { id: 'attendance', type: 'task', title: 'Attendance', subtitle: 'Attendance tracking', href: '/attendance', keywords: ['attendance', 'check-in', 'check-out'] },
  { id: 'leaves', type: 'task', title: 'Leave Management', subtitle: 'Leave requests and approvals', href: '/leaves', keywords: ['leaves', 'holiday', 'time off', 'request'] },
  { id: 'eod', type: 'task', title: 'Daily Updates', subtitle: 'End of day reports', href: '/eod', keywords: ['eod', 'daily', 'report', 'summary'] },
  { id: 'users', type: 'user', title: 'Users', subtitle: 'Team management', href: '/users', keywords: ['users', 'people', 'team', 'employees'] },
  { id: 'departments', type: 'user', title: 'Departments', subtitle: 'Department management', href: '/departments', keywords: ['departments', 'org', 'structure'] },
  { id: 'settings', type: 'user', title: 'Settings', subtitle: 'System configuration', href: '/settings', keywords: ['settings', 'config', 'preferences'] },
].map((result) => ({ ...result, local: true }))

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

// Render text with the matched tokens wrapped in highlight marks.
const Highlight = ({ text, tokens }) => {
  if (!text) return null
  if (!tokens || tokens.length === 0) return text
  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  if (!escaped) return text
  let regex
  try {
    regex = new RegExp(`(${escaped})`, 'gi')
  } catch {
    return text
  }
  const parts = String(text).split(regex)
  return parts.map((part, index) =>
    part && tokens.some((token) => part.toLowerCase() === token.toLowerCase())
      ? (
        <mark
          key={index}
          className="rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-400/30"
        >
          {part}
        </mark>
      )
      : part,
  )
}

// Stable module display order so groups don't jump around between queries.
const MODULE_ORDER = ['work', 'content', 'people', 'clients', 'sales', 'finance', 'calendar', 'inbox', 'ai', 'settings']

const RECENT_SEARCHES_KEY = 'syntask_recent_searches'

const loadRecentSearches = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}

const saveRecentSearch = (value) => {
  try {
    const next = [value, ...loadRecentSearches().filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 6)
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
  } catch {
    // localStorage unavailable — recent searches are best-effort only
  }
}

export function GlobalSearch({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [activeModule, setActiveModule] = useState('all')
  const [recentSearches, setRecentSearches] = useState(loadRecentSearches)
  const inputRef = useRef(null)
  const resultsRef = useRef(null)
  const navigate = useNavigate()
  const debouncedQuery = useDebounce(query, 250)

  // Flatten groups into a single ordered list for keyboard navigation.
  const flatResults = useMemo(() => {
    const rows = []
    groups.forEach((group) => {
      ;(group.items || []).forEach((item) => {
        rows.push({ ...item, _module: group.module, _moduleKey: group.moduleKey })
      })
    })
    return rows
  }, [groups])

  // Module filter chips (ordered, only modules that have results).
  const modules = useMemo(() => {
    const present = groups.map((group) => ({ module: group.module, moduleKey: group.moduleKey }))
    return [...present].sort((a, b) => {
      const ai = MODULE_ORDER.indexOf(a.moduleKey)
      const bi = MODULE_ORDER.indexOf(b.moduleKey)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
  }, [groups])

  const showLocal = !query.trim()
  const visibleItems = useMemo(
    () => (showLocal ? LOCAL_RESULTS : activeModule === 'all' ? flatResults : flatResults.filter((item) => item._moduleKey === activeModule)),
    [showLocal, flatResults, activeModule],
  )

  // Reset state and focus when modal opens (runs only on open/close).
  useEffect(() => {
    if (!isOpen) return undefined
    setQuery('')
    setGroups([])
    setTotal(0)
    setHasSearched(false)
    setSelectedIndex(-1)
    setActiveModule('all')
    setRecentSearches(loadRecentSearches())
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [isOpen])

  const handleSelect = useCallback(
    (result) => {
      const trimmed = query.trim()
      if (trimmed) {
        saveRecentSearch(trimmed)
        setRecentSearches(loadRecentSearches())
      }
      // Local page shortcuts navigate straight to their page.
      if (result.local) {
        navigate(result.href || '/dashboard')
        onClose()
        return
      }
      // Tickets open via the list page + detail modal (no /tickets/:id route).
      if (result.type === 'ticket' && result.id) {
        sessionStorage.setItem('open_ticket_id', result.id)
        navigate('/tickets')
        onClose()
        return
      }
      navigate(result.href || '/dashboard')
      onClose()
    },
    [navigate, onClose, query],
  )

  const handleSelectLocal = useCallback(
    (result) => {
      navigate(result.href || '/dashboard')
      onClose()
    },
    [navigate, onClose],
  )

  const clearQuery = useCallback(() => {
    setQuery('')
    setGroups([])
    setTotal(0)
    setHasSearched(false)
    setSelectedIndex(-1)
    setActiveModule('all')
  }, [])

  // Global keydown listener for keyboard navigation.
  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, visibleItems.length - 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, -1))
      } else if (event.key === 'Enter' && selectedIndex >= 0) {
        event.preventDefault()
        const selected = visibleItems[selectedIndex]
        if (selected) handleSelect(selected)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, handleSelect, visibleItems, selectedIndex])

  // Scroll selected item into view.
  useEffect(() => {
    if (selectedIndex >= 0 && resultsRef.current) {
      const items = resultsRef.current.querySelectorAll('[data-result-row]')
      if (items[selectedIndex]) {
        items[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex])

  // Search logic — backend is authoritative; local results only on failure or empty query.
  useEffect(() => {
    const value = debouncedQuery.trim()
    if (!value || value.length < 2) {
      setGroups([])
      setTotal(0)
      setHasSearched(false)
      setLoading(false)
      return undefined
    }

    let active = true
    setLoading(true)
    setHasSearched(true)
    setSelectedIndex(-1)
    api
      .get('/search', { params: { q: value, limit: 60 } })
      .then((response) => {
        if (!active) return
        const data = response?.data
        const serverGroups = Array.isArray(data?.groups) ? data.groups : []
        setGroups(serverGroups)
        setTotal(typeof data?.total === 'number' ? data.total : serverGroups.reduce((sum, group) => sum + (group.items?.length || 0), 0))
      })
      .catch(() => {
        if (active) {
          // Backend unavailable — degrade to the local page shortcuts ranked by the query.
          const ranked = LOCAL_RESULTS.map((item) => {
            const haystack = [item.title, item.subtitle, ...(item.keywords || [])].join(' ').toLowerCase()
            let score = haystack.includes(value.toLowerCase()) ? 40 : 0
            if (item.title.toLowerCase().startsWith(value.toLowerCase())) score = 80
            return { ...item, score }
          })
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
          setGroups([{ module: 'Quick access', moduleKey: 'quick', items: ranked }])
          setTotal(ranked.length)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [debouncedQuery])

  const getIcon = (type) => icons[type] || FileText
  const tokens = useMemo(() => debouncedQuery.trim().toLowerCase().split(/\s+/).filter(Boolean), [debouncedQuery])

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
      <div className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900 animate-fade-in-up">
        {/* Search Input */}
        <div className="flex flex-none items-center gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
          <Search className="h-5 w-5 flex-none text-gray-400 dark:text-gray-500" />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
            placeholder="Search the entire workspace — tasks, projects, clients, leads, people..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search query"
          />
          {query ? (
            <button
              type="button"
              onClick={clearQuery}
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

        {/* Module filter chips */}
        {!showLocal && !loading && groups.length > 0 && (
          <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-gray-100 px-4 py-2 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setActiveModule('all')}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                activeModule === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              All results
            </button>
            {modules.map((mod) => (
              <button
                key={mod.moduleKey}
                type="button"
                onClick={() => setActiveModule(mod.moduleKey)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  activeModule === mod.moduleKey
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {mod.module}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div ref={resultsRef} className="min-h-0 flex-1 overflow-y-auto p-3">
          {/* Recent searches (empty query) */}
          {showLocal && recentSearches.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between px-3 py-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  <History className="h-3.5 w-3.5" /> Recent searches
                </span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem(RECENT_SEARCHES_KEY)
                    } catch {
                      // ignore
                    }
                    setRecentSearches([])
                  }}
                  className="text-xs font-medium text-gray-400 transition hover:text-red-500 dark:text-gray-500"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 px-3">
                {recentSearches.map((recent) => (
                  <button
                    key={recent}
                    type="button"
                    onClick={() => setQuery(recent)}
                    className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/40"
                  >
                    <Clock className="h-3 w-3" />
                    {recent}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading skeleton */}
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

          {/* Empty query state — quick page shortcuts */}
          {!loading && showLocal && (
            <div className="space-y-1">
              <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Quick access
              </div>
              {LOCAL_RESULTS.map((result, index) => {
                const Icon = getIcon(result.type)
                return (
                  <button
                    key={result.id}
                    type="button"
                    data-result-row
                    onClick={() => handleSelectLocal(result)}
                    className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 ${
                      index === selectedIndex
                        ? 'bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-950/30 dark:ring-indigo-500'
                        : 'hover:bg-gray-50 focus:bg-gray-50 dark:hover:bg-gray-800/50 dark:focus:bg-gray-800/50'
                    }`}
                  >
                    <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br ${getTypeColor(result.type)} text-white shadow-lg shadow-indigo-500/20`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{result.title}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{result.subtitle}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 flex-none text-gray-300 dark:text-gray-600" />
                  </button>
                )
              })}
            </div>
          )}

          {/* No results — only shown after the search actually completed */}
          {!loading && hasSearched && groups.length === 0 && (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                <Search className="h-8 w-8 text-gray-400 dark:text-gray-500" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">No results found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Try a different keyword, or check the spelling.
              </p>
            </div>
          )}

          {/* Grouped server results */}
          {!loading && hasSearched && groups.length > 0 && (
            <div className="space-y-4">
              {groups.map((group) => {
                if (activeModule !== 'all' && group.moduleKey !== activeModule) return null
                const items = group.items || []
                if (items.length === 0) return null
                return (
                  <div key={group.moduleKey}>
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        {group.module}
                      </span>
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        {items.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {items.map((result, index) => {
                        const Icon = getIcon(result.type)
                        const flatIndex = flatResults.indexOf(result)
                        const isSelected = flatIndex === selectedIndex
                        return (
                          <button
                            key={`${result.type}-${result.id}`}
                            type="button"
                            data-result-row
                            onClick={() => handleSelect(result)}
                            onMouseEnter={() => setSelectedIndex(flatIndex)}
                            className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 ${
                              isSelected
                                ? 'bg-indigo-50 ring-2 ring-indigo-500 dark:bg-indigo-950/30 dark:ring-indigo-500'
                                : 'hover:bg-gray-50 focus:bg-gray-50 dark:hover:bg-gray-800/50 dark:focus:bg-gray-800/50'
                            }`}
                          >
                            <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br ${getTypeColor(result.type)} text-white shadow-lg shadow-indigo-500/20`}>
                              <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                                <Highlight text={result.title} tokens={tokens} />
                              </span>
                              <span className="flex items-center gap-2 truncate text-xs text-gray-500 dark:text-gray-400">
                                <span className="inline-flex flex-none items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                  {getTypeLabel(result.type)}
                                </span>
                                {result.parent ? (
                                  <span className="truncate font-medium text-indigo-500/80 dark:text-indigo-400/80">
                                    <Highlight text={result.parent} tokens={tokens} />
                                  </span>
                                ) : null}
                                {result.subtitle ? (
                                  <span className="truncate">
                                    <Highlight text={result.subtitle} tokens={tokens} />
                                  </span>
                                ) : null}
                              </span>
                            </span>
                            {isSelected && (
                              <ArrowRight className="h-4 w-4 flex-none text-indigo-500 dark:text-indigo-400" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer with keyboard shortcuts */}
        <div className="flex flex-none items-center justify-between gap-2 border-t border-gray-200 bg-gray-50/80 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
          <div className="flex flex-wrap items-center gap-3">
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
          {hasSearched && !loading ? (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {total} result{total === 1 ? '' : 's'} across {groups.length} module{groups.length === 1 ? '' : 's'}
            </span>
          ) : null}
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
