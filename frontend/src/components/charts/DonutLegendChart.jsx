import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { ChartTooltip } from '../charts/ChartTooltip'
import { ChartCard } from './ChartCard'

const DEFAULT_COLORS = ['#2FB47C', '#FF6B4A', '#4285F4', '#FFB020', '#7C6FE0', '#3DD5F3', '#EC6FBB']

/**
 * data: [{ name, value }]
 */
const DonutLegendChart = ({ title, data, colors = DEFAULT_COLORS, emptyLabel = 'No data yet' }) => {
  const total = data.reduce((sum, item) => sum + (item.value || 0), 0)
  const withColor = data.map((item, i) => ({ ...item, color: item.color || colors[i % colors.length] }))
  const isEmpty = total === 0

  return (
    <ChartCard title={title}>
      {isEmpty ? (
        <div className="flex h-72 items-center justify-center text-sm text-gray-400">{emptyLabel}</div>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-64 w-full sm:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={withColor}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={0}
                  outerRadius={95}
                  paddingAngle={1}
                  stroke="none"
                >
                  {withColor.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full space-y-3 sm:w-1/2">
            {withColor.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-gray-600 dark:text-gray-300">{item.name}</span>
                <span className="ml-auto font-medium text-gray-800 dark:text-gray-100">
                  {total ? `${((item.value / total) * 100).toFixed(2)}%` : '0%'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  )
}

export default DonutLegendChart
