import { useQuery } from 'react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { EmptyState, LoadingSpinner, PageHeader, Table } from '../../components/ui'
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
      {isLoading ? <LoadingSpinner label="Loading usage" /> : isError ? <EmptyState icon={BarChart3} title="Could not load usage analytics" /> : companies.length ? (
        <div className="space-y-6">
          <section className="rounded-lg border border-gray-200 bg-white p-4"><h2 className="mb-4 font-semibold text-gray-900">Top companies</h2><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="users" fill="#2563eb" /><Bar dataKey="tasks" fill="#16a34a" /></BarChart></ResponsiveContainer></div></section>
          <Table columns={columns} data={companies} />
        </div>
      ) : <EmptyState icon={BarChart3} title="No usage data yet" />}
    </div>
  )
}
