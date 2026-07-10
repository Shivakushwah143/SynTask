import { useMemo } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Building2, CreditCard, ShieldAlert, TrendingUp, Users } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { Button, PageHeader, SkeletonCard } from '../../components/ui'
import { asArray, formatMoney } from '../phase4Utils'

export default function AdminDashboard() {
  const tenants = useQuery('superadmin-tenants-dashboard', superadminApi.getTenants)
  const revenue = useQuery('superadmin-revenue-dashboard', superadminApi.getRevenueAnalytics)
  const tenantRows = asArray(tenants.data, ['tenants', 'companies'])
  const urgentTenants = useMemo(() => {
    const riskyStatuses = new Set(['pending', 'suspended', 'inactive', 'overdue', 'blocked'])
    return tenantRows
      .filter((tenant) => riskyStatuses.has(String(tenant.status || '').toLowerCase()))
      .slice(0, 5)
  }, [tenantRows])
  const urgentCount = urgentTenants.length

  return (
    <div>
      <PageHeader
        title="Super Admin Dashboard"
        description="Tenant, usage, and billing overview."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/super-admin/tenants">
              <Button variant="secondary">Review Tenants</Button>
            </Link>
            <Link to="/super-admin/usage">
              <Button>View Usage</Button>
            </Link>
          </div>
        }
      />
      {tenants.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <SkeletonCard key={item} lines={3} />)}</div> : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Stat icon={Building2} label="Tenants" value={tenantRows.length} />
            <Stat icon={Users} label="Active" value={tenantRows.filter((t) => t.status === 'active').length} />
            <Stat icon={CreditCard} label="Plans" value={tenantRows.filter((t) => t.plan || t.subscription_plan).length} />
            <Stat icon={TrendingUp} label="MRR" value={formatMoney(revenue.data?.mrr || revenue.data?.monthly_recurring_revenue)} />
          </div>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Urgent review</p>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {urgentCount ? `${urgentCount} tenant${urgentCount === 1 ? '' : 's'} need attention before routine work.` : 'No urgent tenant issues right now.'}
                  </p>
                </div>
              </div>
              <Link to="/super-admin/tenants">
                <Button size="sm" variant="secondary" className="gap-2">
                  Review now
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            {urgentTenants.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {urgentTenants.map((tenant) => (
                  <Link
                    key={tenant.id || tenant._id || tenant.name}
                    to={`/super-admin/tenants/${tenant.id || tenant._id}`}
                    className="rounded-xl border border-amber-200 bg-white/80 p-3 transition hover:border-amber-300 hover:bg-white dark:border-amber-900/60 dark:bg-gray-950/60 dark:hover:bg-gray-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{tenant.name || tenant.company_name || 'Untitled tenant'}</p>
                      <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        {String(tenant.status || 'unknown')}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {tenant.user_count ?? tenant.current_users ?? 0} users · {tenant.plan || tenant.subscription_plan || 'no plan'}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4"><Icon className="h-5 w-5 text-primary-600" /><p className="mt-3 text-sm text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>
}
