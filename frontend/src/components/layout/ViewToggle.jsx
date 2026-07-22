import { LayoutGrid, List } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'

export default function ViewToggle({ view: controlledView, onChange }) {
  const { view: storedView, setView } = useViewStore()
  const view = controlledView || storedView
  const changeView = onChange || setView

  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={() => changeView('list')}
        className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
          view === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
        }`}
      >
        <List size={16} />
        List
      </button>
      <button
        type="button"
        onClick={() => changeView('board')}
        className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
          view === 'board' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100'
        }`}
      >
        <LayoutGrid size={16} />
        Board
      </button>
    </div>
  )
}
