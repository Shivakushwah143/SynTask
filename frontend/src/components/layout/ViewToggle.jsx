import { LayoutGrid, List } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'

export default function ViewToggle() {
  const { view, setView } = useViewStore()

  return (
    <div className="inline-flex rounded-lg border border-surface-border bg-surface/95 p-1 shadow-sm dark:border-gray-800 dark:bg-black">
      <button
        type="button"
        onClick={() => setView('list')}
        className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
          view === 'list' ? 'bg-primary-600 text-white' : 'text-text-secondary hover:text-text-primary dark:text-gray-300 dark:hover:text-gray-100'
        }`}
      >
        <List size={16} />
        List
      </button>
      <button
        type="button"
        onClick={() => setView('board')}
        className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
          view === 'board' ? 'bg-primary-600 text-white' : 'text-text-secondary hover:text-text-primary dark:text-gray-300 dark:hover:text-gray-100'
        }`}
      >
        <LayoutGrid size={16} />
        Board
      </button>
    </div>
  )
}
