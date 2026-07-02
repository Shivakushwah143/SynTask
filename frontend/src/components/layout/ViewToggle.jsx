import { LayoutGrid, List } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'

export default function ViewToggle() {
  const { view, setView } = useViewStore()

  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => setView('list')}
        className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
          view === 'list' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-800'
        }`}
      >
        <List size={16} />
        List
      </button>
      <button
        type="button"
        onClick={() => setView('board')}
        className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
          view === 'board' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-800'
        }`}
      >
        <LayoutGrid size={16} />
        Board
      </button>
    </div>
  )
}
