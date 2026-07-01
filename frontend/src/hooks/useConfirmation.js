import { useUIStore } from '../store/uiStore'

/**
 * Hook for using confirmation dialog and undo functionality
 * @returns {Object} Object with confirm and showUndoNotification functions
 */
export const useConfirmation = () => {
  const { openConfirm, showUndo } = useUIStore()

  /**
   * Show a confirmation dialog
   * @param {Object} options Configuration options
   * @param {string} options.title Dialog title
   * @param {string} options.message Dialog message
   * @param {string} options.confirmText Confirm button text (default: "Confirm")
   * @param {string} options.cancelText Cancel button text (default: "Cancel")
   * @param {boolean} options.isDangerous Whether to show dangerous styling (red button)
   * @param {Function} options.onConfirm Callback when confirmed
   * @param {Function} options.onCancel Callback when cancelled
   * @returns {Promise<boolean>} Promise that resolves to true if confirmed, false if cancelled
   */
  const confirm = async (options = {}) => {
    return openConfirm(options)
  }

  /**
   * Show an undo notification
   * @param {Object} options Configuration options
   * @param {string} options.message The undo message to display
   * @param {Function} options.onUndo Callback when undo is clicked
   * @param {number} options.duration How long to show the notification (default: 3000ms - 3 seconds)
   */
  const showUndoNotification = (options = {}) => {
    showUndo(options)
  }

  return {
    confirm,
    showUndoNotification,
  }
}

/**
 * Higher-order function to wrap a delete/remove operation with confirmation and undo
 * @param {Function} deleteOperation The async function that performs the deletion
 * @param {Object} options Configuration options
 * @returns {Function} Function that handles the delete flow
 */
export const withConfirmationAndUndo = (deleteOperation, options = {}) => {
  return async (...args) => {
    const { useUIStore: storeHook } = await import('../store/uiStore')
    const { openConfirm, showUndo } = storeHook()

    const {
      title = 'Delete Item',
      message = 'Are you sure you want to delete this item? This action cannot be undone.',
      confirmText = 'Delete',
      cancelText = 'Cancel',
      undoMessage = 'Item deleted',
      undoDuration = 3000,
    } = options

    const confirmed = await openConfirm({
      title,
      message,
      confirmText,
      cancelText,
      isDangerous: true,
    })

    if (!confirmed) return false

    try {
      const result = await deleteOperation(...args)
      showUndo({
        message: undoMessage,
        undoDuration,
      })
      return result
    } catch (error) {
      throw error
    }
  }
}

export default useConfirmation
