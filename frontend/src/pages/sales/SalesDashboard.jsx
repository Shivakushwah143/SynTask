import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Briefcase, IndianRupee, TrendingUp, Users } from 'lucide-react'
import { salesApi } from '../../api/sales'
import { Button, EmptyState, PageHeader, SkeletonCard } from '../../components/ui'
import { ChartTooltip } from '../../components/charts/ChartTooltip'
import { asArray, formatMoney, sumBy } from '../phase4Utils'

export default function SalesDashboard() {
  const overview = useQuery('sales-overview', salesApi.getOverview)
  const contacts = useQuery('sales-dashboard-contacts', () => salesApi.getContacts({ limit: 100 }))
  const prospects = useQuery('sales-dashboard-prospects', () => salesApi.getProspects({ limit: 100 }))

  const contactList = asArray(contacts.data, ['contacts'])
  const prospectList = asArray(prospects.data, ['prospects'])
  const loading = overview.isLoading || contacts.isLoading || prospects.isLoading
  const pipelineValue = sumBy(prospectList, (item) => item.won_amount || item.expected_value || item.value)
  const stageRows = Object.entries(
    prospectList.reduce((acc, item) => {
      const stage = item.current_stage || item.stage || 'Unstaged'
      acc[stage] = (acc[stage] || 0) + 1
      return acc
    }, {})
  ).map(([stage, count]) => ({ stage, count }))

  return (
    <div className="p-6">
      <PageHeader
        title="Sales Dashboard"
        description="Pipeline, contact, and revenue snapshot."
        actions={<Button as={Link} onClick={undefined}><Link to="/sales/prospects">Open Prospects</Link></Button>}
      />
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <SkeletonCard key={item} lines={3} />)}
        </div>
      ) : prospectList.length || contactList.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat icon={Users} label="Contacts" value={contactList.length} />
            <Stat icon={Briefcase} label="Prospects" value={prospectList.length} />
            <Stat icon={IndianRupee} label="Pipeline Value" value={formatMoney(pipelineValue)} />
            <Stat icon={TrendingUp} label="Won" value={prospectList.filter((p) => p.status === 'won').length} />
          </div>
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Prospects by stage</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip />
                  <Bar dataKey="count" name="Prospects" fill="#2563eb" radius={[4, 4, 0, 0]} activeBar={{ stroke: '#1d4ed8', strokeWidth: 2, fillOpacity: 0.85 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <EmptyState icon={TrendingUp} title="No sales activity yet" description="Add contacts and prospects to start tracking the pipeline." />
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <Icon className="h-5 w-5 text-primary-600" />
      <p className="mt-3 text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
