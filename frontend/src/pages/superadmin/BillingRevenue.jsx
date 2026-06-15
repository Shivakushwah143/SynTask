import { useQuery } from 'react-query'
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CreditCard } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { EmptyState, PageHeader, SkeletonTable, Table } from '../../components/ui'
import { asArray, formatDate, formatMoney } from '../phase4Utils'

export default function BillingRevenue() {
  const revenue = useQuery('superadmin-revenue', superadminApi.getRevenueAnalytics)
  const transactions = useQuery('superadmin-transactions', () => superadminApi.getTransactions({ limit: 50 }))
  const rows = asArray(transactions.data, ['transactions'])
  const trend = asArray(revenue.data?.monthly || revenue.data?.trend || [], ['items'])
  const columns = [
    { key: 'company', header: 'Company', render: (row) => row.company_name || row.company_id || '-' },
    { key: 'amount', header: 'Amount', render: (row) => formatMoney(row.amount) },
    { key: 'status', header: 'Status', render: (row) => row.status || '-' },
    { key: 'date', header: 'Date', render: (row) => formatDate(row.created_at || row.date) },
  ]
  return (
    <div>
      <PageHeader title="Billing & Revenue" description="Revenue analytics and transactions." />
      {revenue.isLoading || transactions.isLoading ? <SkeletonTable rows={6} cols={5} /> : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label="MRR" value={formatMoney(revenue.data?.mrr || revenue.data?.monthly_recurring_revenue)} />
            <Stat label="ARR" value={formatMoney(revenue.data?.arr || revenue.data?.annual_recurring_revenue)} />
            <Stat label="Collected" value={formatMoney(revenue.data?.total_collected || revenue.data?.total_revenue)} />
          </div>
          {trend.length ? <section className="rounded-lg border border-gray-200 bg-white p-4"><h2 className="mb-4 font-semibold">Revenue trend</h2><div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Line dataKey="revenue" stroke="#2563eb" strokeWidth={2} /></LineChart></ResponsiveContainer></div></section> : null}
          {rows.length ? <Table columns={columns} data={rows} /> : <EmptyState icon={CreditCard} title="No transactions found" />}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-sm text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>
}
