import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Sparkles, FolderKanban, CheckSquare, CalendarDays, MessageSquareText, X } from 'lucide-react'
import { useDebounce } from '../hooks/useDebounce'
import { Skeleton } from './ui'

const COMMANDS = [
  { id: 'workflow', label: 'Open Workflow Shortcuts', description: 'Jump into CRM pipeline shortcuts', href: '/crm/pipeline', icon: Sparkles },
  { id: 'dashboard', label: 'Open Main Dashboard', description: 'Return to the workspace overview', href: '/dashboard', icon: Sparkles },
  { id: 'projects', label: 'Open Projects', description: 'View project workspace', href: '/projects', icon: FolderKanban },
  { id: 'tasks', label: 'Open Tasks', description: 'Review task list', href: '/tasks', icon: CheckSquare },
  { id: 'calendar', label: 'Open Workspace Calendar', description: 'Check workspace schedule', href: '/calendar', icon: CalendarDays },
  { id: 'meetings', label: 'Open Meetings', description: 'Review meeting cadence', href: '/meetings', icon: MessageSquareText },
]

export function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const debouncedQuery = useDebounce(query, 200)

  useEffect(() => {
    if (!isOpen) return undefined
    setQuery('')
    setResults(COMMANDS)
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return undefined
    const value = debouncedQuery.trim().toLowerCase()
    if (!value) {
      setResults(COMMANDS)
      setLoading(false)
      return undefined
    }

    setLoading(true)
    const filtered = COMMANDS.filter(
      (command) =>
        command.label.toLowerCase().includes(value) ||
        command.description.toLowerCase().includes(value),
    )

    const timer = setTimeout(() => {
      setResults(filtered)
      setLoading(false)
    }, 120)

    return () => clearTimeout(timer)
  }, [debouncedQuery, isOpen])

  const selectCommand = (command) => {
    navigate(command.href)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-24" role="dialog" aria-modal="true" aria-label="Command palette">
      <button type="button" className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-[2px]" aria-label="Close command palette" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-surface-border bg-surface/95 shadow-modal dark:border-gray-700 dark:bg-black">
        <div className="flex items-center gap-3 border-b border-surface-border px-4 py-4 dark:border-gray-800">
          <Search className="h-5 w-5 flex-none text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-muted dark:text-gray-100 dark:placeholder:text-gray-500"
            placeholder="Search commands..."
            aria-label="Command search"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="rounded-xl p-2 text-text-muted hover:bg-surface-muted dark:text-gray-400 dark:hover:bg-gray-800" aria-label="Clear command search">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-surface-border px-2 py-1 text-xs text-text-muted dark:border-gray-700 dark:text-gray-400 sm:inline-flex">ESC</kbd>
          )}
        </div>
        <div className="max-h-[28rem] overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map((item) => <Skeleton key={item} className="h-14 rounded-xl" />)}
            </div>
          ) : null}
          {!loading && results.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-text-secondary dark:text-gray-400">
              No commands found.
            </div>
          ) : null}
          {!loading && results.map((command) => {
            const Icon = command.icon
            return (
              <button
                key={command.id}
                type="button"
                onClick={() => selectCommand(command)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-surface-muted focus:bg-surface-muted dark:hover:bg-gray-800 dark:focus:bg-gray-800"
              >
                <span className="rounded-2xl bg-surface-muted p-2 dark:bg-gray-800">
                  <Icon className="h-4 w-4 text-text-secondary dark:text-gray-300" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text-primary dark:text-gray-100">{command.label}</span>
                  <span className="block text-xs text-text-secondary dark:text-gray-400">{command.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
