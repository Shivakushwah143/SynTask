/* eslint-disable react-refresh/only-export-components */
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from 'react-query'
import { resolveValue, toast, ToastBar, useToaster } from 'react-hot-toast'
import { X } from 'lucide-react'
import App from './App.jsx'
import { queryClient } from './api/queryClient'
import './index.css'

const TOAST_POSITION = 'top-right'
const TOAST_GUTTER = 8
const TOAST_TOP_OFFSET = 16
const DISMISS_BUTTON_GUTTER = 8

const TOAST_OPTIONS = {
  duration: 4000,
  style: {
    background: '#363636',
    color: '#fff',
  },
  success: {
    duration: 3000,
    iconTheme: {
      primary: '#10b981',
      secondary: '#fff',
    },
  },
  error: {
    duration: 5000,
    iconTheme: {
      primary: '#ef4444',
      secondary: '#fff',
    },
  },
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const getPositionStyle = (position, offset) => {
  const top = position.includes('top')
  const verticalStyle = top ? { top: 0 } : { bottom: 0 }
  const horizontalStyle = position.includes('center')
    ? { justifyContent: 'center' }
    : position.includes('right')
      ? { justifyContent: 'flex-end' }
      : {}
  return {
    left: 0,
    right: 0,
    display: 'flex',
    position: 'absolute',
    transition: prefersReducedMotion() ? undefined : 'all 230ms cubic-bezier(.21,1.02,.73,1)',
    transform: `translateY(${offset * (top ? 1 : -1)}px)`,
    ...verticalStyle,
    ...horizontalStyle,
  }
}

const ToastWrapper = ({ id, className, style, onHeightUpdate, children }) => {
  const ref = useCallback(
    (el) => {
      if (!el) return
      const updateHeight = () => onHeightUpdate(id, el.getBoundingClientRect().height)
      updateHeight()
      const observer = new MutationObserver(updateHeight)
      observer.observe(el, { subtree: true, childList: true, characterData: true })
    },
    [id, onHeightUpdate],
  )

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  )
}

function AppToaster() {
  const { toasts, handlers } = useToaster(TOAST_OPTIONS)
  const [dismissOffset, setDismissOffset] = useState(0)
  const dismissBtnRef = useRef(null)

  const visibleToasts = toasts.filter((t) => t.visible && !t.dismissed)
  const showDismissAll = visibleToasts.length > 1

  useLayoutEffect(() => {
    if (!showDismissAll) {
      setDismissOffset(0)
      return
    }
    const height = dismissBtnRef.current?.getBoundingClientRect().height || 32
    setDismissOffset(height + DISMISS_BUTTON_GUTTER)
  }, [showDismissAll, visibleToasts.length])

  return (
    <div
      data-rht-toaster=""
      style={{
        position: 'fixed',
        zIndex: 9999,
        top: TOAST_TOP_OFFSET,
        left: TOAST_TOP_OFFSET,
        right: TOAST_TOP_OFFSET,
        bottom: TOAST_TOP_OFFSET,
        pointerEvents: 'none',
      }}
      onMouseEnter={handlers.startPause}
      onMouseLeave={handlers.endPause}
    >
      {showDismissAll && (
        <div className="pointer-events-auto absolute right-0 top-0 z-[10000]">
          <button
            ref={dismissBtnRef}
            type="button"
            onClick={() => toast.dismiss()}
            title={`Dismiss all ${visibleToasts.length} notifications`}
            aria-label={`Dismiss all ${visibleToasts.length} notifications`}
            className="inline-flex max-w-[calc(100vw-2rem)] items-center gap-2 overflow-hidden rounded-full border border-red-300/40 bg-red-500/25 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur-md ring-1 ring-red-400/30 transition-all hover:bg-red-500/40 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            <X className="h-4 w-4" />
            Dismiss all
            <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-bold leading-none">
              {visibleToasts.length}
            </span>
          </button>
        </div>
      )}

      {toasts.map((t) => {
        const toastPosition = t.position || TOAST_POSITION
        const isTopRightStack = toastPosition === TOAST_POSITION
        const offset =
          handlers.calculateOffset(t, {
            reverseOrder: false,
            gutter: TOAST_GUTTER,
            defaultPosition: TOAST_POSITION,
          }) + (showDismissAll && isTopRightStack ? dismissOffset : 0)
        const positionStyle = getPositionStyle(toastPosition, offset)

        return (
          <ToastWrapper
            key={t.id}
            id={t.id}
            onHeightUpdate={handlers.updateHeight}
            className={t.visible ? 'z-[9999] [&>*]:pointer-events-auto' : ''}
            style={positionStyle}
          >
            {t.type === 'custom' ? (
              resolveValue(t.message, t)
            ) : (
              <ToastBar toast={t} position={toastPosition} />
            )}
          </ToastWrapper>
        )
      })}
    </div>
  )
}

const AppShell = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <App />
    <AppToaster />
  </BrowserRouter>
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  </React.StrictMode>,
)
