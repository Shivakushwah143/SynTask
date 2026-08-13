import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowRight, 
  Building2, 
  CheckCircle, 
  CreditCard, 
  Package, 
  RefreshCw, 
  ShieldCheck, 
  TrendingUp,
  LayoutDashboard,
  Users,
  DollarSign,
  Clock,
  Calendar,
  Zap,
  Award,
  Target,
  Activity,
  BarChart3,
  PieChart,
  AlertCircle,
  Check,
  X,
  Settings,
  HelpCircle,
  Mail,
  Phone,
  MapPin,
  Star,
  Crown,
  Gem,
  Sparkles,
  Rocket,
  Infinity,
  Database,
  Layers,
  FileText,
  Gift
} from 'lucide-react'
import toast from 'react-hot-toast'
import { companiesAPI } from '../api/companies'
import { subscriptionsAPI } from '../api/subscriptions'
import { superadminApi } from '../api/superadmin'
import { useAuthStore } from '../store/authStore'
import { Button, EmptyState, PageHeader, SkeletonCard } from '../components/ui'
import { isSuperAdminRole } from '../utils/roles'
import { asArray, formatDate, formatMoney } from './phase4Utils'

const FALLBACK_PLANS = [
  { 
    name: 'Free', 
    price_monthly: 0, 
    max_users: 10, 
    max_projects: 5, 
    max_storage_gb: 5, 
    enabled_modules: ['Tasks'],
    icon: Star,
    color: 'gray'
  },
  { 
    name: 'Basic', 
    price_monthly: 29, 
    max_users: 25, 
    max_projects: null, 
    max_storage_gb: 25, 
    enabled_modules: ['Tasks', 'Projects'],
    icon: Gem,
    color: 'blue'
  },
  { 
    name: 'Professional', 
    price_monthly: 99, 
    max_users: 100, 
    max_projects: null, 
    max_storage_gb: 100, 
    enabled_modules: ['Tasks', 'Projects', 'CRM', 'Reports'],
    icon: Crown,
    color: 'purple'
  },
  { 
    name: 'Enterprise', 
    price_monthly: 299, 
    max_users: null, 
    max_projects: null, 
    max_storage_gb: null, 
    enabled_modules: ['All modules', 'Priority support'],
    icon: Rocket,
    color: 'gold'
  },
]

const getPlanName = (plan) => plan?.name || plan?.plan_name || plan?.plan || plan?.subscription_plan || 'Free'
const getPlanPrice = (plan) => Number(plan?.price_monthly ?? plan?.monthly_price ?? plan?.price ?? plan?.amount ?? 0)
const normalizeResponse = (response) => response?.data || response || {}
const normalizePlanKey = (value) => String(value || '').toLowerCase().replace(/[_\s-]+/g, '')

// ============================================================
// STAT CARD COMPONENT
// ============================================================
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r ${colors[color]} text-white shadow-sm`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <span className="truncate text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</span>
          <p className="mt-0.5 truncate text-lg font-bold leading-tight text-gray-900 dark:text-white">{value}</p>
          {subtitle && <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// SECTION HEADER COMPONENT
// ============================================================
const SectionHeader = ({ icon: Icon, title, description, action }) => (
  <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
          <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      {action}
    </div>
  </div>
)

// ============================================================
// METRIC CARD COMPONENT
// ============================================================
const MetricCard = ({ icon: Icon, label, value, color = 'indigo' }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800">
      <div className={`inline-flex rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}

// ============================================================
// OWNER ACTION COMPONENT
// ============================================================
const OwnerAction = ({ icon: Icon, title, text, onClick }) => (
  <button 
    type="button" 
    onClick={onClick} 
    className="group rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700"
  >
    <div className="inline-flex rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 p-2 text-white shadow-lg transition-transform group-hover:scale-110">
      <Icon className="h-5 w-5" />
    </div>
    <p className="mt-3 font-semibold text-gray-900 dark:text-white">{title}</p>
    <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">{text}</p>
  </button>
)

// ============================================================
// PLAN FACT COMPONENT
// ============================================================
const PlanFact = ({ label, value }) => (
  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
    <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
    <p className="mt-1 text-sm font-semibold capitalize text-gray-900 dark:text-white">{value || '-'}</p>
  </div>
)

// ============================================================
// PLAN CARD COMPONENT
// ============================================================
const PlanCard = ({ plan, current, loading, onUpgrade }) => {
  const name = getPlanName(plan)
  const price = getPlanPrice(plan)
  const modules = plan.enabled_modules || plan.features || []
  const Icon = plan.icon || Package
  
  const facts = [
    plan.max_users ? `${plan.max_users} users` : 'Unlimited users',
    plan.max_projects ? `${plan.max_projects} projects` : 'Unlimited projects',
    plan.max_storage_gb ? `${plan.max_storage_gb}GB storage` : 'Flexible storage',
  ]

  const getIconColor = () => {
    if (current) return 'from-indigo-500 to-purple-500'
    if (price === 0) return 'from-gray-500 to-gray-600'
    if (price < 50) return 'from-blue-500 to-cyan-500'
    if (price < 150) return 'from-purple-500 to-pink-500'
    return 'from-amber-500 to-orange-500'
  }

  return (
    <div className={`group rounded-2xl border bg-white shadow-sm transition-all hover:shadow-lg hover:scale-[1.02] dark:bg-gray-800 ${
      current 
        ? 'border-indigo-300 ring-4 ring-indigo-500/20 dark:border-indigo-700 dark:ring-indigo-500/30' 
        : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`inline-flex rounded-lg bg-gradient-to-r ${getIconColor()} p-2 text-white shadow-lg`}>
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">{name}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {plan.description || 'Company subscription plan'}
            </p>
          </div>
          {current && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Check className="h-3 w-3" />
              Current
            </span>
          )}
        </div>

        <div className="mt-4">
          <span className="text-3xl font-bold text-gray-900 dark:text-white">
            {price === 0 ? 'Free' : formatMoney(price)}
          </span>
          {price > 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400"> / month</span>
          )}
        </div>

        <ul className="mt-5 space-y-2.5">
          {[...facts, ...modules.slice(0, 3)].map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
              <CheckCircle className="mt-0.5 h-4 w-4 flex-none text-emerald-500" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <button
          className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            current 
              ? 'border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'
              : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg hover:from-indigo-700 hover:to-purple-700'
          } disabled:opacity-50`}
          disabled={current || loading}
          onClick={current ? undefined : onUpgrade}
        >
          {loading ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              Processing...
            </>
          ) : current ? (
            'Current Plan'
          ) : (
            <>
              Upgrade
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================
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
      toast.success('Upgrade request created successfully! 🚀')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Upgrade request could not be started')
    } finally {
      setUpgradingPlan('')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-5">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 px-4 py-3 text-white shadow-sm">
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2 backdrop-blur-sm">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold md:text-xl">Subscription & Billing</h1>
                <p className="mt-0.5 truncate text-xs text-fuchsia-100">Loading subscription workspace...</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5">
              <div className="h-3 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
              <div className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
              <div className="h-2.5 w-56 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-14 w-32 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700"></div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 space-y-1.5">
            <div className="h-4 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
            <div className="h-2.5 w-72 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                  <div className="h-5 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                  <div className="h-8 w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (isSuperAdmin) {
    return (
      <div className="space-y-4 p-4 md:p-5">
        {/* ============================================================ */}
        {/* HERO SECTION - Super Admin */}
        {/* ============================================================ */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 px-4 py-3 text-white shadow-sm">
          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="rounded-lg bg-white/15 p-2 backdrop-blur-sm">
                  <LayoutDashboard className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-bold md:text-xl">Platform Subscriptions</h1>
                  <p className="mt-0.5 truncate text-xs text-fuchsia-100">Owner view for renting SynTask access to tenant companies.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => navigate('/super-admin/tenants')}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
                >
                  <Building2 className="h-4 w-4" />
                  Tenant Companies
                </button>
                <button 
                  onClick={() => navigate('/super-admin/plans')}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
                >
                  <Package className="h-4 w-4" />
                  Manage Plans
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard 
            label="Tenant Companies" 
            value={tenants.length} 
            icon={Building2} 
            color="indigo"
            subtitle="All tenants"
          />
          <StatCard 
            label="Active Tenants" 
            value={activeTenants.length} 
            icon={ShieldCheck} 
            color="emerald"
            subtitle="Active subscriptions"
          />
          <StatCard 
            label="Plans" 
            value={plans.length} 
            icon={Package} 
            color="blue"
            subtitle="Available plans"
          />
          <StatCard 
            label="MRR" 
            value={formatMoney(revenue?.mrr || revenue?.monthly_recurring_revenue || 0)} 
            icon={TrendingUp} 
            color="amber"
            subtitle="Monthly recurring revenue"
          />
        </div>

        {/* Controls & Review */}
        <div className="grid gap-6 xl:grid-cols-[1fr_0.5fr]">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <SectionHeader 
              icon={Settings}
              title="Rental Business Controls"
              description="Create plans, assign company access, suspend tenants, and review billing."
              action={
                <button 
                  onClick={() => navigate('/super-admin/billing')}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                  <CreditCard className="h-4 w-4" />
                  Billing
                </button>
              }
            />
            <div className="p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <OwnerAction 
                  icon={Package} 
                  title="Plan Catalog" 
                  text="Define pricing, limits, modules, trials." 
                  onClick={() => navigate('/super-admin/plans')} 
                />
                <OwnerAction 
                  icon={Building2} 
                  title="Tenant Access" 
                  text="Approve companies and assign plans." 
                  onClick={() => navigate('/super-admin/tenants')} 
                />
                <OwnerAction 
                  icon={CreditCard} 
                  title="Revenue" 
                  text="Track payments and recurring billing." 
                  onClick={() => navigate('/super-admin/billing')} 
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/40">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="font-bold text-amber-900 dark:text-amber-100">Needs Review</h2>
                  <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                    {pendingTenants.length} pending tenant{pendingTenants.length === 1 ? '' : 's'} awaiting approval.
                  </p>
                  <button 
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
                    onClick={() => navigate('/companies')}
                  >
                    Review Companies
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
      <div className="space-y-4 p-4 md:p-5">
      {/* ============================================================ */}
      {/* HERO SECTION */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 px-4 py-3 text-white shadow-sm">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2 backdrop-blur-sm">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold md:text-xl">Subscription & Billing</h1>
                <p className="mt-0.5 truncate text-xs text-fuchsia-100">
                  View your current company plan and upgrade when your team needs more capacity.
                </p>
              </div>
            </div>
            <button 
              onClick={loadData}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* CURRENT PLAN BANNER */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 to-white p-4 shadow-sm dark:border-indigo-900/50 dark:from-indigo-950/20 dark:to-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/40">
                <Crown className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Current Company Plan</p>
            </div>
            <h2 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{currentPlanName}</h2>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
              This is the active plan for {company?.name || 'your company'}.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <PlanFact label="Status" value={currentSubscription?.status || company?.status || 'Active'} />
            <PlanFact label="Billing" value={currentSubscription?.billing_cycle || 'Monthly'} />
            <PlanFact label="Next Billing" value={formatDate(currentSubscription?.next_billing_date)} />
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* UPGRADE OPTIONS */}
      {/* ============================================================ */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Upgrade Options</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Choose a larger plan when users, projects, modules, or storage need more room.
          </p>
        </div>
        {plans.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
            <Package className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No Plans Available</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Ask the platform owner to publish subscription plans.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
