import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { parseNaturalDate } from '@/utils/parseNaturalDate'
import { timeService } from '@/services/timeService'

export default function NaturalDateInput({ value = '', onChange, onDateResolved }) {
  const [text, setText] = useState(value || '')
  const [preview, setPreview] = useState(null)
  const [manualMode, setManualMode] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => {
      const parsed = parseNaturalDate(text, timeService.now())
      setPreview(parsed)
      onDateResolved?.(parsed?.date ?? null)
    }, 200)

    return () => clearTimeout(timeout)
  }, [text, onDateResolved])

  if (manualMode) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="datetime-local"
          onChange={(e) => {
            const val = e.target.value
            onDateResolved?.(val ? new Date(timeService.toUtcISOString(val)) : null)
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => setManualMode(false)}
          className="text-xs text-gray-600 hover:text-blue-600"
        >
          text
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange?.(e.target.value)
        }}
        placeholder="e.g. tomorrow 5pm, next friday"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-28 text-sm"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
        {preview && (
          <span className="text-xs font-medium text-blue-600">
            {format(preview.date, preview.hasTime ? 'MMM d, h:mma' : 'MMM d')}
          </span>
        )}
        {text && !preview && (
          <span className="text-xs text-gray-500">no date found</span>
        )}
        <button
          type="button"
          onClick={() => setManualMode(true)}
          className="text-xs text-gray-600 hover:text-blue-600"
        >
          picker
        </button>
      </div>
    </div>
  )
}
