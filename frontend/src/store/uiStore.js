import { create } from 'zustand'

export const useUIStore = create((set, get) => ({
  // Confirmation Dialog State
  confirmDialog: {
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDangerous: false,
    onConfirm: null,
    onCancel: null,
  },

  openConfirm: (options = {}) => {
    const {
      title = 'Confirm Action',
      message = 'Are you sure?',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      isDangerous = false,
      onConfirm = () => {},
      onCancel = () => {},
    } = options

    set((state) => ({
      confirmDialog: {
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        isDangerous,
        onConfirm,
        onCancel,
      },
    }))

    // Return a promise for convenience
    return new Promise((resolve) => {
      set((state) => ({
        confirmDialog: {
          ...state.confirmDialog,
          onConfirm: () => {
            onConfirm?.()
            resolve(true)
            get().closeConfirm()
          },
          onCancel: () => {
            onCancel?.()
            resolve(false)
            get().closeConfirm()
          },
        },
      }))
    })
  },

  closeConfirm: () => {
    set((state) => ({
      confirmDialog: {
        ...state.confirmDialog,
        isOpen: false,
      },
    }))
  },

  // Undo Notification State
  undoNotification: {
    isVisible: false,
    message: '',
    onUndo: null,
    timeoutId: null,
  },

  showUndo: (options = {}) => {
    const {
      message = 'Item deleted',
      onUndo = () => {},
      duration = 3000, // 3 seconds default
    } = options

    // Clear any existing timeout
    const prevTimeoutId = get().undoNotification.timeoutId
    if (prevTimeoutId) {
      clearTimeout(prevTimeoutId)
    }

    // Set up new undo notification
    const timeoutId = setTimeout(() => {
      get().hideUndo()
    }, duration)

    set((state) => ({
      undoNotification: {
        isVisible: true,
        message,
        onUndo,
        timeoutId,
      },
    }))
  },

  hideUndo: () => {
    const prevTimeoutId = get().undoNotification.timeoutId
    if (prevTimeoutId) {
      clearTimeout(prevTimeoutId)
    }

    set((state) => ({
      undoNotification: {
        ...state.undoNotification,
        isVisible: false,
        timeoutId: null,
      },
    }))
  },

  executeUndo: () => {
    const { undoNotification, hideUndo } = get()
    if (undoNotification.onUndo) {
      undoNotification.onUndo()
    }
    hideUndo()
  },
}))
