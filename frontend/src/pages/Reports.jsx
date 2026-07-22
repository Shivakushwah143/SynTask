import { useState } from 'react'
import { useQuery } from 'react-query'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, XAxis, YAxis, Cell } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { reportsAPI } from '../api/reports'
import { Button, EmptyState, PageHeader, SkeletonCard } from '../components/ui'
import { ChartTooltip } from '../components/charts/ChartTooltip'

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626']

export default function Reports() {
  const [period, setPeriod] = useState('month')
  const [tab, setTab] = useState('tasks')
  const { data, isLoading, isError } = useQuery(['analytics-charts', period], () => reportsAPI.getAnalyticsCharts(period))
  const taskRows = data?.tasks_by_status || data?.task_status || [{ name: 'Open', value: 0 }]
  const priorityRows = data?.tasks_by_priority || data?.priority || [{ name: 'Medium', value: 0 }]
  const tickets = data?.tickets || data?.tickets_by_status || [{ name: 'Open', value: 0 }]
  const trend = data?.completion_trend || data?.trend || taskRows

  const handlePeriodChange = (nextPeriod) => {
    setPeriod(nextPeriod)
  }

  const handleExport = () => {
    const csvRows = []
    const rows = tab === 'tickets' ? tickets : taskRows
    csvRows.push(['name', 'value'].join(','))
    rows.forEach((row) => {
      csvRows.push([String(row.name ?? ''), String(row.value ?? 0)].join(','))
    })
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${tab}_report_${period}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Reports"
        description="Operational reporting for tasks, projects, time, and delivery signals."
        actions={(
          <div className="flex flex-wrap gap-2">
            {['week', 'month', 'quarter'].map((item) => (
              <Button key={item} variant={period === item ? 'primary' : 'secondary'} size="sm" onClick={() => handlePeriodChange(item)}>
                {item}
              </Button>
            ))}
            <Button variant="secondary" size="sm" onClick={handleExport}>
              Export CSV
            </Button>
          </div>
        )}
      />

      {isLoading ? (
        <ReportsSkeleton />
      ) : isError ? (
        <EmptyState icon={BarChart3} title="Could not load reports" description="The reporting data could not be loaded right now." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="flex gap-2 xl:col-span-2">
            <Button variant={tab === 'tasks' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('tasks')}>
              Tasks
            </Button>
            <Button variant={tab === 'tickets' ? 'primary' : 'secondary'} size="sm" onClick={() => setTab('tickets')}>
              Tickets
            </Button>
          </div>

          {tab === 'tasks' ? (
            <>
              <ChartCard title="Tasks by status">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={taskRows} dataKey="value" nameKey="name" label>
                    {taskRows.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                <ChartTooltip cursor={false} />
              </PieChart>
            </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Tasks by priority">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={priorityRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                <ChartTooltip />
                <Bar dataKey="value" name="Tasks" fill="#f59e0b" activeBar={{ stroke: '#b45309', strokeWidth: 2, fillOpacity: 0.85 }} />
              </BarChart>
            </ResponsiveContainer>
              </ChartCard>
            </>
          ) : (
            <>
              <ChartCard title="Ticket resolution">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={tickets}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <ChartTooltip />
                <Bar dataKey="value" name="Tickets" fill="#16a34a" activeBar={{ stroke: '#047857', strokeWidth: 2, fillOpacity: 0.85 }} />
              </BarChart>
            </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Completion trend">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <ChartTooltip cursor={{ stroke: '#2563eb', strokeDasharray: '4 4', strokeOpacity: 0.45 }} />
                <Line dataKey="value" name="Completed" stroke="#2563eb" strokeWidth={2} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
              </ChartCard>
            </>
          )}
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
