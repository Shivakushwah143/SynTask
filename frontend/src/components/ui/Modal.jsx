import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

export function Modal({ isOpen, onClose, title, children, size = 'md' }) {
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
    <div className="fixed inset-0 z-50 flex max-w-[100vw] items-center justify-center overflow-x-hidden overflow-y-auto p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/50" onClick={() => onCloseRef.current?.()} aria-hidden="true" />
      <div ref={modalRef} className={`relative flex max-h-[calc(100dvh-1.5rem)] min-w-0 w-full flex-col overflow-hidden rounded-2xl bg-white shadow-modal dark:bg-gray-900 dark:shadow-none sm:max-h-[90vh] ${sizes[size]}`}>
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-800 sm:px-6">
          <h2 id={titleId} className="min-w-0 break-words text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/25 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Close modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  )
}
