import { Tooltip } from 'recharts'

const LABELS = {
  count: 'Count',
  name: 'Category',
  stage: 'Stage',
  tasks: 'Tasks',
  users: 'Users',
  value: 'Value',
}

function titleCase(value) {
  return LABELS[value] || String(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') return value.toLocaleString()
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export function ChartTooltipContent({ active, label, payload, labelFormatter, valueFormatter }) {
  if (!active || !payload?.length) return null

  const point = payload[0]?.payload || {}
  const heading = label ?? point.name ?? point.stage
  const plottedKeys = new Set(payload.map((entry) => entry.dataKey))
  const labelKeys = new Set(['name', 'stage', 'label', 'category'])
  const extras = Object.entries(point).filter(([key, value]) => (
    !plottedKeys.has(key)
    && !labelKeys.has(key)
    && value !== null
    && value !== undefined
    && ['string', 'number', 'boolean'].includes(typeof value)
  ))

  return (
    <div
      className="min-w-[10rem] max-w-[18rem] rounded-lg border border-gray-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95"
      role="status"
      aria-live="polite"
    >
      {heading !== undefined && (
        <p className="mb-2 border-b border-gray-100 pb-2 font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
          {labelFormatter ? labelFormatter(heading, point) : displayValue(heading)}
        </p>
      )}
      <div className="space-y-1.5">
        {payload.map((entry) => (
          <div key={`${entry.dataKey}-${entry.name}`} className="flex items-center justify-between gap-5">
            <span className="flex min-w-0 items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
              <span className="truncate">{titleCase(entry.name || entry.dataKey)}</span>
            </span>
            <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {valueFormatter ? valueFormatter(entry.value, entry.dataKey, point) : displayValue(entry.value)}
            </span>
          </div>
        ))}
        {extras.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-5">
            <span className="truncate text-gray-500 dark:text-gray-400">{titleCase(key)}</span>
            <span className="font-medium tabular-nums text-gray-800 dark:text-gray-200">{displayValue(value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartTooltip(props) {
  return (
    <Tooltip
      {...props}
      content={<ChartTooltipContent valueFormatter={props.valueFormatter} labelFormatter={props.labelFormatter} />}
      cursor={props.cursor ?? { fill: '#2563eb', fillOpacity: 0.08, stroke: '#2563eb', strokeOpacity: 0.18 }}
      isAnimationActive
      animationDuration={140}
      animationEasing="ease-out"
      offset={14}
      allowEscapeViewBox={{ x: false, y: true }}
      wrapperStyle={{ outline: 'none', pointerEvents: 'none', transition: 'transform 100ms ease-out' }}
    />
  )
}
