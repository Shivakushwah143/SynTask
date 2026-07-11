import { useQuery } from 'react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { EmptyState, PageHeader, SkeletonTable, Table } from '../../components/ui'
import { ChartTooltip } from '../../components/charts/ChartTooltip'
import { asArray } from '../phase4Utils'

export default function UsageAnalytics() {
  const { data, isLoading, isError } = useQuery('superadmin-usage', superadminApi.getUsageAnalytics)
  const companies = asArray(data?.companies || data, ['usage', 'companies'])
  const chartData = companies.slice(0, 10).map((company) => ({
    name: company.name || company.company_name || 'Company',
    users: company.users || company.user_count || 0,
    tasks: company.tasks || company.task_count || 0,
  }))
  const columns = [
    { key: 'name', header: 'Company', render: (row) => row.name || row.company_name },
    { key: 'users', header: 'Users', render: (row) => row.users || row.user_count || 0 },
    { key: 'tasks', header: 'Tasks', render: (row) => row.tasks || row.task_count || 0 },
    { key: 'storage', header: 'Storage', render: (row) => `${row.storage_gb || row.storage || 0} GB` },
  ]
  return (
    <div>
      <PageHeader title="Usage Analytics" description="Company usage and plan adoption." />
      {isLoading ? <SkeletonTable rows={6} cols={5} /> : isError ? <EmptyState icon={BarChart3} title="Could not load usage analytics" /> : companies.length ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-surface-border bg-surface/95 p-4 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]"><h2 className="mb-4 font-semibold text-gray-900 dark:text-[var(--color-app-text)]">Top companies</h2><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} /><XAxis dataKey="name" tick={{ fill: '#a79b8b', fontSize: 11 }} /><YAxis tick={{ fill: '#a79b8b', fontSize: 11 }} /><ChartTooltip /><Bar dataKey="users" name="Users" fill="#e56a1f" activeBar={{ stroke: '#f8a26d', strokeWidth: 2, fillOpacity: 0.85 }} /><Bar dataKey="tasks" name="Tasks" fill="#2fb47c" activeBar={{ stroke: '#7ed8aa', strokeWidth: 2, fillOpacity: 0.85 }} /></BarChart></ResponsiveContainer></div></section>
          <Table columns={columns} data={companies} />
        </div>
      ) : <EmptyState icon={BarChart3} title="No usage data yet" />}
    </div>
  )
}
