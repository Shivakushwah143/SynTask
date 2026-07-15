import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, CheckSquare, FileText, Search, Sparkles, Ticket, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useDebounce } from '../hooks/useDebounce'
import { Skeleton } from './ui'

const icons = {
  task: CheckSquare,
  project: FileText,
  ticket: Ticket,
  client: Building2,
  crm: Sparkles,
}

const LOCAL_RESULTS = [
  { id: 'dashboard', type: 'crm', title: 'Main Dashboard', subtitle: 'Overview and widgets', keywords: ['dashboard', 'overview', 'home'] },
  { id: 'tasks', type: 'task', title: 'Tasks', subtitle: 'Task board and list', keywords: ['tasks', 'todo', 'work'] },
  { id: 'projects', type: 'project', title: 'Projects', subtitle: 'Project list and board', keywords: ['projects', 'workspaces', 'boards'] },
  { id: 'tickets', type: 'ticket', title: 'Tickets', subtitle: 'Requests and support items', keywords: ['tickets', 'requests', 'support'] },
  { id: 'clients', type: 'client', title: 'Clients', subtitle: 'Client directory', keywords: ['clients', 'accounts', 'customers'] },
  { id: 'crm-pipeline', type: 'crm', title: 'CRM Pipeline', subtitle: 'Sales pipeline board', keywords: ['crm', 'pipeline', 'sales'] },
  { id: 'crm-leads', type: 'crm', title: 'CRM Leads', subtitle: 'Lead list and workspace', keywords: ['leads', 'prospects'] },
  { id: 'calendar', type: 'crm', title: 'Calendar', subtitle: 'Meetings and content calendar', keywords: ['calendar', 'meetings', 'schedule'] },
]

const rankLocalResults = (query) => {
  const value = query.trim().toLowerCase()
  const scored = LOCAL_RESULTS.map((item) => {
    const haystack = [item.title, item.subtitle, ...(item.keywords || [])].join(' ').toLowerCase()
    let score = 0
    if (!value) score = 10
    else if (item.title.toLowerCase().startsWith(value)) score = 100
    else if (haystack.includes(value)) score = 60
    else if (value.split(/\s+/).some((part) => part && haystack.includes(part))) score = 40
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
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const debouncedQuery = useDebounce(query, 300)
  const initialResults = useMemo(() => rankLocalResults(''), [])

  useEffect(() => {
    if (!isOpen) return undefined
    setQuery('')
    setResults([])
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

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
      })
      .catch(() => {
        if (active) setResults(rankLocalResults(debouncedQuery.trim()))
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
    }
    navigate(paths[result.type] || '/dashboard')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-20" role="dialog" aria-modal="true" aria-label="Global search">
      <button className="absolute inset-0 cursor-default bg-black/50" aria-label="Close search" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-surface/95 shadow-modal dark:bg-gray-900 dark:shadow-none">
        <div className="flex items-center gap-3 border-b border-surface-border p-4 dark:border-gray-800">
          <Search className="h-5 w-5 flex-none text-text-muted" />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-muted dark:text-gray-100 dark:placeholder:text-gray-500"
            placeholder="Search tasks, projects, tickets, clients..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search query"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="rounded-xl p-2 text-text-muted hover:bg-surface-muted dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <kbd className="hidden rounded border border-surface-border px-2 py-1 text-xs text-text-muted dark:border-gray-700 dark:text-gray-400 sm:inline-flex">ESC</kbd>
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-2 p-2" role="status" aria-label="Searching">
              {[1, 2, 3].map((item) => <Skeleton key={item} className="h-14 rounded-xl" />)}
            </div>
          ) : null}
          {!loading && results.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-text-secondary dark:text-gray-400">No matching results found.</div>
          ) : null}
          {results.map((result) => {
            const Icon = icons[result.type] || FileText
            return (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                onClick={() => handleSelect(result)}
              className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-surface-muted focus:bg-surface-muted dark:hover:bg-gray-800 dark:focus:bg-gray-800"
              >
                <span className="rounded-xl bg-surface-muted p-2 dark:bg-gray-800">
                  <Icon className="h-4 w-4 text-text-secondary dark:text-gray-300" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text-primary dark:text-gray-100">{result.title}</span>
                  <span className="block truncate text-xs capitalize text-text-secondary dark:text-gray-400">{result.type} - {result.subtitle || 'No details'}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
