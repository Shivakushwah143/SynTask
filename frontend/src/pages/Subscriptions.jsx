import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, CheckCircle, CreditCard, Package, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { companiesAPI } from '../api/companies'
import { subscriptionsAPI } from '../api/subscriptions'
import { superadminApi } from '../api/superadmin'
import { useAuthStore } from '../store/authStore'
import { Button, EmptyState, PageHeader, SkeletonCard } from '../components/ui'
import { isSuperAdminRole } from '../utils/roles'
import { asArray, formatDate, formatMoney } from './phase4Utils'

const FALLBACK_PLANS = [
  { name: 'Free', price_monthly: 0, max_users: 10, max_projects: 5, max_storage_gb: 5, enabled_modules: ['Tasks'] },
  { name: 'Basic', price_monthly: 29, max_users: 25, max_projects: null, max_storage_gb: 25, enabled_modules: ['Tasks', 'Projects'] },
  { name: 'Professional', price_monthly: 99, max_users: 100, max_projects: null, max_storage_gb: 100, enabled_modules: ['Tasks', 'Projects', 'CRM', 'Reports'] },
  { name: 'Enterprise', price_monthly: 299, max_users: null, max_projects: null, max_storage_gb: null, enabled_modules: ['All modules', 'Priority support'] },
]

const getPlanName = (plan) => plan?.name || plan?.plan_name || plan?.plan || plan?.subscription_plan || 'Free'
const getPlanPrice = (plan) => Number(plan?.price_monthly ?? plan?.monthly_price ?? plan?.price ?? plan?.amount ?? 0)
const normalizeResponse = (response) => response?.data || response || {}
const normalizePlanKey = (value) => String(value || '').toLowerCase().replace(/[_\s-]+/g, '')

export default function Subscriptions() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const isSuperAdmin = isSuperAdminRole(user?.role)
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState(null)
  const [plans, setPlans] = useState([])
  const [tenants, setTenants] = useState([])
  const [revenue, setRevenue] = useState(null)
  const [upgradingPlan, setUpgradingPlan] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      if (isSuperAdmin) {
        const [tenantResponse, planResponse, revenueResponse] = await Promise.all([
          superadminApi.getTenants().catch(() => null),
          superadminApi.getPlans().catch(() => null),
          superadminApi.getRevenueAnalytics().catch(() => null),
        ])
        const tenantData = normalizeResponse(tenantResponse)
        const planData = normalizeResponse(planResponse)
        setTenants(asArray(tenantData, ['tenants', 'companies']))
        setPlans(asArray(planData, ['plans']).length ? asArray(planData, ['plans']) : FALLBACK_PLANS)
        setRevenue(normalizeResponse(revenueResponse))
        return
      }

      const [companyResponse, plansResponse] = await Promise.all([
        user?.company_id ? companiesAPI.getCompany(user.company_id).catch(() => null) : Promise.resolve(null),
        subscriptionsAPI.getPlans().catch(() => null),
      ])
      const companyData = normalizeResponse(companyResponse)
      const publicPlans = normalizeResponse(plansResponse)
      setCompany(companyData.company || companyData)
      setPlans(asArray(publicPlans, ['plans']).length ? asArray(publicPlans, ['plans']) : FALLBACK_PLANS)
    } catch (error) {
      toast.error('Could not load subscription data')
    } finally {
      setLoading(false)
    }
  }, [isSuperAdmin, user?.company_id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const currentSubscription = company?.subscription || company?.company_subscription || company?.current_subscription || {}
  const currentPlanName = getPlanName(company?.plan || company?.subscription_plan || currentSubscription?.plan || currentSubscription || company?.requested_plan)
  const currentPlan = plans.find((plan) => normalizePlanKey(getPlanName(plan)) === normalizePlanKey(currentPlanName)) || { name: currentPlanName }
  const activeTenants = tenants.filter((tenant) => String(tenant.status || '').toLowerCase() === 'active')
  const pendingTenants = tenants.filter((tenant) => String(tenant.status || '').toLowerCase() === 'pending')

  const handleUpgrade = async (plan) => {
    const planName = getPlanName(plan)
    try {
      setUpgradingPlan(planName)
      await subscriptionsAPI.createPaymentIntent(normalizePlanKey(planName), 'monthly', user?.company_id)
      toast.success('Upgrade request created')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Upgrade request could not be started')
    } finally {
      setUpgradingPlan('')
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Subscription & Billing" description="Loading subscription workspace..." />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((item) => <SkeletonCard key={item} lines={4} />)}
        </div>
      </div>
    )
  }

  if (isSuperAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Platform Subscriptions"
          description="Owner view for renting SynTask access to tenant companies."
          actions={(
            <>
              <Button variant="secondary" onClick={() => navigate('/super-admin/tenants')}>Tenant Companies</Button>
              <Button onClick={() => navigate('/super-admin/plans')}>Manage Plans</Button>
            </>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Building2} label="Tenant companies" value={tenants.length} />
          <MetricCard icon={ShieldCheck} label="Active tenants" value={activeTenants.length} />
          <MetricCard icon={Package} label="Plans" value={plans.length} />
          <MetricCard icon={TrendingUp} label="MRR" value={formatMoney(revenue?.mrr || revenue?.monthly_recurring_revenue || 0)} />
        </div>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-2xl border border-surface-border bg-surface p-5 dark:bg-[var(--color-app-surface)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Rental business controls</h2>
                <p className="mt-1 text-sm text-text-secondary">Create plans, assign company access, suspend tenants, and review billing.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => navigate('/super-admin/billing')}>Billing</Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <OwnerAction icon={Package} title="Plan catalog" text="Define pricing, limits, modules, trials." onClick={() => navigate('/super-admin/plans')} />
              <OwnerAction icon={Building2} title="Tenant access" text="Approve companies and assign plans." onClick={() => navigate('/super-admin/tenants')} />
              <OwnerAction icon={CreditCard} title="Revenue" text="Track payments and recurring billing." onClick={() => navigate('/super-admin/billing')} />
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
            <h2 className="text-lg font-semibold text-amber-950 dark:text-amber-100">Needs review</h2>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">{pendingTenants.length} pending tenant{pendingTenants.length === 1 ? '' : 's'} awaiting approval.</p>
            <Button className="mt-4" size="sm" onClick={() => navigate('/companies')}>Review companies</Button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription & Billing"
        description="View your current company plan and upgrade when your team needs more capacity."
        actions={<Button variant="secondary" onClick={loadData}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />

      <section className="rounded-2xl border border-primary-200 bg-primary-50/70 p-5 dark:border-primary-900/50 dark:bg-primary-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700 dark:text-primary-300">Current company plan</p>
            <h2 className="mt-2 text-3xl font-bold text-text-primary">{currentPlanName}</h2>
            <p className="mt-2 text-sm text-text-secondary">This is the active plan for {company?.name || 'your company'}.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <PlanFact label="Status" value={currentSubscription?.status || company?.status || 'Active'} />
            <PlanFact label="Billing" value={currentSubscription?.billing_cycle || 'Monthly'} />
            <PlanFact label="Next billing" value={formatDate(currentSubscription?.next_billing_date)} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Upgrade options</h2>
          <p className="mt-1 text-sm text-text-secondary">Choose a larger plan when users, projects, modules, or storage need more room.</p>
        </div>
        {plans.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const planName = getPlanName(plan)
              const isCurrent = normalizePlanKey(planName) === normalizePlanKey(getPlanName(currentPlan))
              return (
                <PlanCard
                  key={plan.id || planName}
                  plan={plan}
                  current={isCurrent}
                  loading={upgradingPlan === planName}
                  onUpgrade={() => handleUpgrade(plan)}
                />
              )
            })}
          </div>
        ) : (
          <EmptyState title="No plans available" description="Ask the platform owner to publish subscription plans." />
        )}
      </section>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface p-5 dark:bg-[var(--color-app-surface)]">
      <Icon className="h-5 w-5 text-primary-600" />
      <p className="mt-3 text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text-primary">{value}</p>
    </div>
  )
}

function OwnerAction({ icon: Icon, title, text, onClick }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-surface-border bg-white p-4 text-left transition hover:border-primary-300 hover:bg-primary-50/50 dark:bg-[var(--color-app-bg)] dark:hover:bg-[var(--color-app-surface-subtle)]">
      <Icon className="h-5 w-5 text-primary-600" />
      <p className="mt-3 font-semibold text-text-primary">{title}</p>
      <p className="mt-1 text-sm leading-5 text-text-secondary">{text}</p>
    </button>
  )
}

function PlanFact({ label, value }) {
  return (
    <div className="rounded-xl border border-white/70 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-black/20">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize text-text-primary">{value || '-'}</p>
    </div>
  )
}

function PlanCard({ plan, current, loading, onUpgrade }) {
  const name = getPlanName(plan)
  const modules = plan.enabled_modules || plan.features || []
  const facts = [
    plan.max_users ? `${plan.max_users} users` : 'Unlimited users',
    plan.max_projects ? `${plan.max_projects} projects` : 'Unlimited projects',
    plan.max_storage_gb ? `${plan.max_storage_gb}GB storage` : 'Flexible storage',
  ]

  return (
    <article className={`flex min-h-full flex-col rounded-2xl border bg-surface p-5 dark:bg-[var(--color-app-surface)] ${current ? 'border-primary-500 ring-4 ring-primary-500/10' : 'border-surface-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-text-primary">{name}</h3>
          <p className="mt-1 text-sm text-text-secondary">{plan.description || 'Company subscription plan'}</p>
        </div>
        {current ? <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">Current</span> : null}
      </div>
      <div className="mt-5">
        <span className="text-3xl font-bold text-text-primary">{formatMoney(getPlanPrice(plan))}</span>
        <span className="text-sm text-text-secondary"> / month</span>
      </div>
      <ul className="mt-5 flex-1 space-y-2">
        {[...facts, ...modules.slice(0, 3)].map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-text-secondary">
            <CheckCircle className="mt-0.5 h-4 w-4 flex-none text-emerald-500" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Button className="mt-5 w-full" variant={current ? 'secondary' : 'primary'} disabled={current} loading={loading} loadingText="Starting" onClick={current ? undefined : onUpgrade}>
        {current ? 'Current Plan' : <>Upgrade <ArrowRight className="h-4 w-4" /></>}
      </Button>
    </article>
  )
}
