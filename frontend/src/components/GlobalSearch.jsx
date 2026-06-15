import { useEffect, useRef, useState } from 'react'
import { Building2, CheckSquare, FileText, Search, Ticket, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useDebounce } from '../hooks/useDebounce'
import { Skeleton } from './ui'

const icons = {
  task: CheckSquare,
  project: FileText,
  ticket: Ticket,
  client: Building2,
}

export function GlobalSearch({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const debouncedQuery = useDebounce(query, 300)

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
      setResults([])
      return undefined
    }

    let active = true
    setLoading(true)
    api.get('/search', { params: { q: debouncedQuery.trim() } })
      .then((data) => {
        if (active) setResults(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (active) setResults([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [debouncedQuery])

  const handleSelect = (result) => {
    const paths = {
      task: `/tasks/${result.id}`,
      project: `/projects/${result.id}/board`,
      ticket: `/tickets/${result.id}`,
      client: `/clients/${result.id}`,
    }
    navigate(paths[result.type] || '/dashboard')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-20" role="dialog" aria-modal="true" aria-label="Global search">
      <button className="absolute inset-0 cursor-default bg-black/40" aria-label="Close search" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-modal">
        <div className="flex items-center gap-3 border-b border-surface-border p-4">
          <Search className="h-5 w-5 flex-none text-gray-400" />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 text-base outline-none placeholder:text-gray-400"
            placeholder="Search tasks, projects, tickets, clients..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search query"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 sm:inline-flex">ESC</kbd>
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {loading && (
            <div className="space-y-2 p-2" role="status" aria-label="Searching">
              {[1, 2, 3].map((item) => <Skeleton key={item} className="h-14 rounded-lg" />)}
            </div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-text-secondary">No results for {query}</div>
          )}
          {!loading && query.length < 2 && (
            <div className="px-6 py-10 text-center text-sm text-text-secondary">Type at least 2 characters to search.</div>
          )}
          {results.map((result) => {
            const Icon = icons[result.type] || FileText
            return (
              <button
                key={`${result.type}-${result.id}`}
                type="button"
                onClick={() => handleSelect(result)}
                className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-gray-50 focus:bg-gray-50"
              >
                <span className="rounded-lg bg-gray-100 p-2">
                  <Icon className="h-4 w-4 text-gray-600" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text-primary">{result.title}</span>
                  <span className="block truncate text-xs capitalize text-text-secondary">{result.type} · {result.subtitle || 'No details'}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
