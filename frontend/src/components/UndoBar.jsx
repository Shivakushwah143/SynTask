import { useEffect, useState } from 'react'
import { useUIStore } from '../store/uiStore'

export const UndoBar = () => {
  const { undoNotification, executeUndo, hideUndo } = useUIStore()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(undoNotification.isVisible)
  }, [undoNotification.isVisible])

  if (!isVisible) {
    return null
  }

  














  

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-lg px-4 py-3 flex items-center gap-4 max-w-sm">
        {/* Message */}
        <span className="text-sm font-medium flex-1">{undoNotification.message}</span>

        {/* Undo Button */}
        <button
          onClick={executeUndo}
          className="px-3 py-1.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 rounded transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          Undo
        </button>

        {/* Close Button */}
        <button
          onClick={hideUndo}
          className="p-1 text-gray-400 hover:text-gray-200 transition-colors focus:outline-none"
          aria-label="Dismiss undo notification"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default UndoBar
