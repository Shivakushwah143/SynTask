import { useRef, useState } from 'react'
import { LoadingSpinner } from './LoadingSpinner'

const VARIANTS = {
  primary: 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-100',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm',
  ghost: 'hover:bg-gray-100 text-gray-700 dark:hover:bg-gray-800 dark:text-gray-200',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingText = 'Loading',
  disabled,
  onClick,
  className = '',
  children,
  ...props
}) {
  const [internalLoading, setInternalLoading] = useState(false)
  const pendingRef = useRef(false)
  const isLoading = loading || internalLoading

  const handleClick = (event) => {
    if (!onClick || pendingRef.current || isLoading) return

    const result = onClick(event)
    if (result && typeof result.then === 'function') {
      pendingRef.current = true
      setInternalLoading(true)
      Promise.resolve(result).then(() => {
        pendingRef.current = false
        setInternalLoading(false)
      }, () => {
        pendingRef.current = false
        setInternalLoading(false)
      })
    }
  }

  return (
    <button
      className={`relative inline-grid items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-950 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      onClick={onClick ? handleClick : undefined}
      {...props}
    >
      <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${isLoading ? 'invisible' : ''}`}>
        {children}
      </span>
      {isLoading ? (
        <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-2 whitespace-nowrap">
          <LoadingSpinner size="sm" label="" />
          <span>{loadingText}</span>
        </span>
      ) : null}
    </button>
  )
}
