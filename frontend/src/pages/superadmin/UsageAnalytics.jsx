import { useState } from 'react'
import { useQuery } from 'react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { EmptyState, PageHeader, SkeletonCard, SkeletonTable, Table } from '../../components/ui'
import { ChartTooltip } from '../../components/charts/ChartTooltip'
import { asArray } from '../phase4Utils'

export default function UsageAnalytics() {
  const [selected, setSelected] = useState(null)
  const { data, isLoading, isError } = useQuery('superadmin-usage-summary', superadminApi.getAllCompaniesUsageSummary)
  const detail = useQuery(['superadmin-usage-detail', selected?.company_id], () => superadminApi.getCompanyDetailedUsage(selected.company_id), { enabled: Boolean(selected?.company_id) })
  const companies = asArray(data, ['companies', 'usage'])
  const chartData = companies.slice(0, 10).map((company) => ({
    name: company.company_name || 'Company',
    users: company.total_users || 0,
    projects: company.project_count || 0,
  }))
  const columns = [
    { key: 'company_name', header: 'Company' },
    { key: 'plan', header: 'Plan' },
    { key: 'total_users', header: 'Users', render: (row) => `${row.total_users || 0} / ${row.max_users || '-'}` },
    { key: 'project_count', header: 'Projects' },
    { key: 'status', header: 'Status' },
  ]
  return (
    <div>
      <PageHeader title="Usage Analytics" description="Per-client users, projects, storage, and API request usage." />
      {isLoading ? <SkeletonTable rows={6} cols={5} /> : isError ? <EmptyState icon={BarChart3} title="Could not load usage analytics" /> : companies.length ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-surface-border bg-surface/95 p-4"><h2 className="mb-4 font-semibold text-gray-900">Top companies</h2><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} /><XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} /><YAxis tick={{ fill: '#6b7280', fontSize: 11 }} /><ChartTooltip /><Bar dataKey="users" name="Users" fill="#2563eb" /><Bar dataKey="projects" name="Projects" fill="#16a34a" /></BarChart></ResponsiveContainer></div></section>
          <Table columns={columns} data={companies} rowKey="company_id" onRowClick={(row) => setSelected(row)} />
          {selected ? <DetailPanel company={selected} data={detail.data} loading={detail.isLoading} /> : null}
        </div>
      ) : <EmptyState icon={BarChart3} title="No usage data yet" />}
    </div>
  )
}

function DetailPanel({ company, data, loading }) {
  if (loading) return <SkeletonCard lines={5} />
  const storageLimit = Number(company.max_storage_gb || 10) * 1024
  const used = Number(data?.storage_used_mb || 0)
  const pct = storageLimit ? Math.min((used / storageLimit) * 100, 100) : 0
  return (
    <section className="rounded-2xl border border-surface-border bg-surface/95 p-4">
      <h2 className="text-lg font-semibold text-gray-900">{company.company_name}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Metric label="Active Users" value={data?.active_users || 0} />
        <Metric label="Total Users" value={data?.total_users || 0} />
        <Metric label="API Requests This Month" value={data?.api_requests_this_month || 0} />
        <Metric label="Projects" value={data?.project_count || 0} />
        <Metric label="Tasks" value={data?.task_count || 0} />
        <div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase text-gray-500">Storage</p><p className="mt-2 text-sm text-gray-900">{used} MB / {storageLimit} MB</p><div className="mt-3 h-2 rounded-full bg-gray-100"><div className={`h-2 rounded-full ${pct >= 90 ? 'bg-red-600' : pct >= 75 ? 'bg-amber-500' : 'bg-primary-600'}`} style={{ width: `${pct}%` }} /></div></div>
      </div>
    </section>
  )
}

function Metric({ label, value }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-gray-900">{value}</p></div>
}
