import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { Building2, CreditCard, TrendingUp, Users } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { Button, LoadingSpinner, PageHeader } from '../../components/ui'
import { asArray, formatMoney } from '../phase4Utils'

export default function AdminDashboard() {
  const tenants = useQuery('superadmin-tenants-dashboard', superadminApi.getTenants)
  const revenue = useQuery('superadmin-revenue-dashboard', superadminApi.getRevenueAnalytics)
  const tenantRows = asArray(tenants.data, ['tenants', 'companies'])

  return (
    <div>
      <PageHeader title="Super Admin Dashboard" description="Tenant, usage, and billing overview." actions={<Link to="/super-admin/tenants"><Button>Manage Tenants</Button></Link>} />
      {tenants.isLoading ? <LoadingSpinner label="Loading dashboard" /> : (
        <div className="grid gap-4 md:grid-cols-4">
          <Stat icon={Building2} label="Tenants" value={tenantRows.length} />
          <Stat icon={Users} label="Active" value={tenantRows.filter((t) => t.status === 'active').length} />
          <Stat icon={CreditCard} label="Plans" value={tenantRows.filter((t) => t.plan || t.subscription_plan).length} />
          <Stat icon={TrendingUp} label="MRR" value={formatMoney(revenue.data?.mrr || revenue.data?.monthly_recurring_revenue)} />
        </div>
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4"><Icon className="h-5 w-5 text-primary-600" /><p className="mt-3 text-sm text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>
}
