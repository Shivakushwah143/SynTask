import React, { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'

export const ConfirmDialog = () => {
  const { confirmDialog, closeConfirm } = useUIStore()
  const dialogRef = React.useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (confirmDialog.isOpen) {
      dialog.showModal()
    } else {
      dialog.close()
    }
  }, [confirmDialog.isOpen])

  const handleCancel = () => {
    confirmDialog.onCancel?.()
    closeConfirm()
  }

  const handleConfirm = () => {
    confirmDialog.onConfirm?.()
    closeConfirm()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) {
      handleCancel()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="rounded-lg shadow-xl backdrop:bg-black/50 dark:bg-gray-800 dark:text-white"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
    >
      <div className="w-96 p-6">
        <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
          {confirmDialog.title}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
          {confirmDialog.message}
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {confirmDialog.cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              confirmDialog.isDangerous
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
            }`}
          >
            {confirmDialog.confirmText}
          </button>
        </div>
      </div>
    </dialog>
  )
}

export default ConfirmDialog
