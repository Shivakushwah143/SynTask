import { useState } from 'react'
import { useQuery } from 'react-query'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { reportsAPI } from '../api/reports'
import { Button, EmptyState, PageHeader, SkeletonCard } from '../components/ui'

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626']

export default function Reports() {
  const [period, setPeriod] = useState('month')
  const { data, isLoading, isError } = useQuery(['analytics-charts', period], () => reportsAPI.getAnalyticsCharts(period))
  const taskRows = data?.tasks_by_status || data?.task_status || [{ name: 'Open', value: 0 }]
  const priorityRows = data?.tasks_by_priority || data?.priority || [{ name: 'Medium', value: 0 }]
  const tickets = data?.tickets || data?.tickets_by_status || [{ name: 'Open', value: 0 }]
  const trend = data?.completion_trend || data?.trend || taskRows

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Reports"
        description="Operational reporting for tasks, projects, time, and delivery signals."
        actions={(
          <div className="flex flex-wrap gap-2">
            {['week', 'month', 'quarter'].map((item) => (
              <Button key={item} variant={period === item ? 'primary' : 'secondary'} size="sm" onClick={() => setPeriod(item)}>
                {item}
              </Button>
            ))}
          </div>
        )}
      />

      {isLoading ? (
        <ReportsSkeleton />
      ) : isError ? (
        <EmptyState icon={BarChart3} title="Could not load reports" description="The reporting data could not be loaded right now." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <ChartCard title="Tasks by status">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={taskRows} dataKey="value" nameKey="name" label>
                  {taskRows.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Tasks by priority">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={priorityRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Ticket resolution">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={tickets}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Completion trend">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line dataKey="value" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      {children}
    </section>
  )
}

function ReportsSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-2" role="status" aria-label="Loading reports">
      {[1, 2, 3, 4].map((item) => <SkeletonCard key={item} lines={6} />)}
    </div>
  )
}
