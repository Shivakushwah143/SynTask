import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

export function Modal({ isOpen, onClose, title, children, size = 'md', description, footer, bodyClassName = '', zIndexClass = 'z-50', closeOnBackdrop = true }) {
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' }
  const modalRef = useRef(null)
  const previouslyFocusedRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return undefined
    const previous = document.body.style.overflow
    previouslyFocusedRef.current = document.activeElement
    document.body.style.overflow = 'hidden'
    const focusableSelector = 'input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
    const focusFirst = () => modalRef.current?.querySelector(focusableSelector)?.focus()
    const timer = setTimeout(focusFirst, 0)

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        modalRef.current?.querySelectorAll(
          'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ) || [],
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previous
      previouslyFocusedRef.current?.focus?.()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex max-w-[100vw] items-center justify-center overflow-x-hidden overflow-y-auto p-3 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onCloseRef.current?.()
      }}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={() => closeOnBackdrop && onCloseRef.current?.()} aria-hidden="true" />
      <div ref={modalRef} className={`relative flex max-h-[calc(100dvh-1.5rem)] min-w-0 w-full flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl transition-all dark:border-gray-800 dark:bg-gray-900 sm:max-h-[90vh] ${sizes[size]}`}>
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50/70 via-white to-white px-5 py-5 dark:border-gray-800 dark:from-indigo-950/30 dark:via-gray-900 dark:to-gray-900 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="min-w-0 break-words text-xl font-bold tracking-tight text-gray-900 dark:text-white">{title}</h2>
            {description ? <p className="mt-1 break-words text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full border border-gray-200 bg-white/90 p-2 text-gray-500 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700 dark:hover:text-white" aria-label="Close modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-5 sm:p-6 ${bodyClassName}`}>{children}</div>
        {footer ? (
          /* Mobile: actions stack (primary first) so they never overflow or
             become unreachable; desktop keeps the existing end-aligned row. */
          <div className="flex min-w-0 flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4 backdrop-blur [&>*]:min-w-0 dark:border-gray-800 dark:bg-gray-900/90 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
