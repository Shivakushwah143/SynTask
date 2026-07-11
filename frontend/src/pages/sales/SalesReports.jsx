import { useQuery } from 'react-query'
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, XAxis, YAxis, Cell } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { salesApi } from '../../api/sales'
import { EmptyState, PageHeader, SkeletonCard } from '../../components/ui'
import { ChartTooltip } from '../../components/charts/ChartTooltip'
import { asArray } from '../phase4Utils'

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed']

export default function SalesReports() {
  const prospects = useQuery('sales-report-prospects', () => salesApi.getLeads({ limit: 200 }))
  const data = asArray(prospects.data, ['prospects'])
  const byStatus = Object.entries(data.reduce((acc, item) => {
    const status = item.status || 'open'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})).map(([name, value]) => ({ name, value }))
  const byInterest = Object.entries(data.reduce((acc, item) => {
    const interest = item.interest_level || 'unknown'
    acc[interest] = (acc[interest] || 0) + 1
    return acc
  }, {})).map(([name, count]) => ({ name, count }))

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Sales Reports" description="Pipeline, conversion, and activity analytics." />
      {prospects.isLoading ? <div className="grid gap-6 xl:grid-cols-2">{[1, 2, 3, 4].map((item) => <SkeletonCard key={item} lines={6} />)}</div> : data.length ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <ChartCard title="Leads by status">
            <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={byStatus} dataKey="value" nameKey="name" label>{byStatus.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}</Pie><ChartTooltip cursor={false} /></PieChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Interest levels">
            <ResponsiveContainer width="100%" height={280}><BarChart data={byInterest}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><ChartTooltip /><Bar dataKey="count" name="Leads" fill="#2563eb" activeBar={{ stroke: '#1d4ed8', strokeWidth: 2, fillOpacity: 0.85 }} /></BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Conversion trend">
            <ResponsiveContainer width="100%" height={280}><LineChart data={byStatus}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><ChartTooltip cursor={{ stroke: '#16a34a', strokeDasharray: '4 4', strokeOpacity: 0.45 }} /><Line dataKey="value" name="Leads" stroke="#16a34a" strokeWidth={2} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} /></LineChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Pipeline volume">
            <ResponsiveContainer width="100%" height={280}><BarChart data={byStatus}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><ChartTooltip /><Bar dataKey="value" name="Leads" fill="#7c3aed" activeBar={{ stroke: '#6d28d9', strokeWidth: 2, fillOpacity: 0.85 }} /></BarChart></ResponsiveContainer>
          </ChartCard>
        </div>
      ) : <EmptyState icon={BarChart3} title="No report data yet" description="Sales charts will appear when leads are available." />}
    </div>
  )
}

function ChartCard({ title, children }) {
  return <section className="rounded-lg border border-gray-200 bg-white p-4"><h2 className="mb-4 font-semibold text-gray-900">{title}</h2>{children}</section>
}
