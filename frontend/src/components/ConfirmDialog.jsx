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
      className="rounded-lg shadow-xl backdrop:bg-black/60 dark:bg-black dark:text-white"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
    >
      <div className="w-96 p-6">
        <h2 className="mb-2 text-lg font-semibold text-text-primary dark:text-white">
          {confirmDialog.title}
        </h2>
        <p className="mb-6 text-sm text-text-secondary dark:text-gray-300">
          {confirmDialog.message}
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {confirmDialog.cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              confirmDialog.isDangerous
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-primary-600 hover:bg-primary-700 focus:ring-primary-500'
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
