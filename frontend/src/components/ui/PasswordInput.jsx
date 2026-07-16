import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { inputClassName } from './FormField'

export function PasswordInput({ className = inputClassName, leftIcon = null, toggleLabel = 'password', ...props }) {
  const [visible, setVisible] = useState(false)
  const label = visible ? `Hide ${toggleLabel}` : `Show ${toggleLabel}`

  return (
    <div className="relative">
      {leftIcon ? <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">{leftIcon}</span> : null}
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${className} ${leftIcon ? 'pl-11' : ''} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center px-3 text-gray-500 transition-colors hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:hover:text-gray-300 dark:focus:ring-offset-gray-950"
        aria-label={label}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  )
}
