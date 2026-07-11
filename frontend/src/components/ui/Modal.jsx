import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

export function Modal({ isOpen, onClose, title, children, size = 'md', description, footer, bodyClassName = '' }) {
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
      <div className="absolute inset-0 bg-black/60" onClick={() => onCloseRef.current?.()} aria-hidden="true" />
      <div ref={modalRef} className={`relative flex max-h-[calc(100dvh-1.5rem)] min-w-0 w-full flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-modal dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:shadow-lg sm:max-h-[90vh] ${sizes[size]}`}>
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-gray-200/80 bg-gradient-to-r from-primary-50/80 via-white to-white px-4 py-4 dark:border-[var(--color-app-border)] dark:from-[var(--color-app-surface-muted)] dark:via-[var(--color-app-surface)] dark:to-[var(--color-app-surface)] sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="min-w-0 break-words text-lg font-semibold text-gray-900 dark:text-[var(--color-app-text)]">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-[var(--color-app-text-muted)]">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/25 dark:text-[var(--color-app-text-secondary)] dark:hover:bg-[var(--color-app-surface-subtle)]" aria-label="Close modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 ${bodyClassName}`}>{children}</div>
        {footer ? (
          <div className="border-t border-gray-200/80 bg-white/95 px-4 py-4 backdrop-blur dark:border-[var(--color-app-border)] dark:bg-[rgb(29_24_19_/_0.96)] sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
