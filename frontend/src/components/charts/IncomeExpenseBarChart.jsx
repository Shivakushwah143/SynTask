import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { ChartTooltip } from '../charts/ChartTooltip'
import { ChartCard } from './ChartCard'

const formatCompact = (value) => {
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`
  if (value >= 1000) return `${Math.round(value / 1000)}K`
  return `${value}`
}

/**
 * Two-series bar chart styled after the reference "Income and Expense" widget:
 * green bars for the primary series, orange bars for the secondary series,
 * a toggle pair top-right (optional), and a totals legend beneath the chart.
 *
 * data: [{ label, primary, secondary }]
 */
const IncomeExpenseBarChart = ({
  title,
  data,
  primaryLabel = 'Primary',
  secondaryLabel = 'Secondary',
  primaryTotal,
  secondaryTotal,
  primaryColor = '#2FB47C',
  secondaryColor = '#FF8A4C',
  toggleOptions,
  activeToggle,
  onToggle,
  footnote,
}) => {
  return (
    <ChartCard
      title={title}
      right={
        toggleOptions ? (
          <div className="flex overflow-hidden rounded-md border border-gray-200 text-xs dark:border-gray-700">
            {toggleOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle?.(opt)}
                className={`px-3 py-1 transition-colors ${
                  activeToggle === opt
                    ? 'bg-gray-100 font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                    : 'bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.15} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
            <YAxis tickLine={false} axisLine={false} tickFormatter={formatCompact} tick={{ fontSize: 11, fill: '#9ca3af' }} />
            <ChartTooltip />
            <Bar dataKey="primary" name={primaryLabel} fill={primaryColor} radius={[3, 3, 0, 0]} maxBarSize={20} />
            <Bar dataKey="secondary" name={secondaryLabel} fill={secondaryColor} radius={[3, 3, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-10 gap-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: primaryColor }} />
          {primaryLabel}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: secondaryColor }} />
          {secondaryLabel}
        </div>
        {primaryTotal !== undefined ? (
          <div>
            <p className="text-sm font-medium" style={{ color: primaryColor }}>Total {primaryLabel}</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{primaryTotal}</p>
          </div>
        ) : null}
        {secondaryTotal !== undefined ? (
          <div>
            <p className="text-sm font-medium" style={{ color: secondaryColor }}>Total {secondaryLabel}</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{secondaryTotal}</p>
          </div>
        ) : null}
      </div>
      {footnote ? <p className="mt-3 text-xs text-gray-400">* {footnote}</p> : null}
    </ChartCard>
  )
}

export default IncomeExpenseBarChart
