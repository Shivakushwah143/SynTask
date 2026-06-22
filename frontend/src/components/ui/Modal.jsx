import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

export function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' }
  const modalRef = useRef(null)
  const previouslyFocusedRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (!isOpen) return undefined
    const previous = document.body.style.overflow
    previouslyFocusedRef.current = document.activeElement
    document.body.style.overflow = 'hidden'
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const focusFirst = () => modalRef.current?.querySelector(focusableSelector)?.focus()
    const timer = setTimeout(focusFirst, 0)

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(modalRef.current?.querySelectorAll(focusableSelector) || [])
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
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={modalRef} className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-[var(--color-app-border)] bg-[var(--color-app-surface)] shadow-[var(--color-app-shadow)] ${sizes[size]}`}>
        <div className="flex items-center justify-between border-b border-[var(--color-app-border)] px-6 py-4">
          <h2 id={titleId} className="font-display text-lg font-bold text-[var(--color-app-text)]">{title}</h2>
          <button type="button" onClick={onClose} className="app-icon-button h-9 w-9" aria-label="Close modal">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

