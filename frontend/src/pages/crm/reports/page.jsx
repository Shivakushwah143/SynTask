import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { Download, FileText, Filter, LineChart, TrendingUp, Users, Calendar, DollarSign, Award, Target, BarChart3, PieChart, Briefcase, Building2, Activity, Clock, Zap, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { crmApi } from '../../../api/crm'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, Skeleton } from '../../../components/ui'
import { formatCurrency } from '../pipeline/utils'
import { timeService } from '@/services/timeService'

// Stat Card Component
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
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800" title={subtitle}>
      <div className={`shrink-0 rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <div className="flex items-baseline gap-1.5">
          <p className="text-lg font-bold leading-tight text-gray-900 dark:text-white">{value}</p>
          {subtitle && <span className="truncate text-[10px] font-medium text-gray-400 dark:text-gray-500">{subtitle}</span>}
        </div>
      </div>
    </div>
  )
}

// Report Card Component for breakdowns
const ReportCard = ({ title, items, icon: Icon, color = 'indigo', emptyMessage }) => {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg bg-${color}-100 p-2 dark:bg-${color}-900/30`}>
            <Icon className={`h-5 w-5 text-${color}-600 dark:text-${color}-400`} />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{items.length} records</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {items.length ? items.map((item, index) => (
          <div 
            key={item.label || index} 
            className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 transition hover:bg-gray-100 dark:bg-gray-900/50 dark:hover:bg-gray-800"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {index + 1}
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</span>
            </div>
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{item.value}</span>
          </div>
        )) : (
          <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {emptyMessage || 'No data available'}
          </div>
        )}
      </div>
    </div>
  )
}

const toCsvValue = (value) => {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

const downloadCsv = (rows, filename) => {
  const csv = rows.map((row) => row.map(toCsvValue).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function CRMReportsPage() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const dashboardQuery = useQuery('crm-reports-dashboard', crmApi.getDashboard, {
    staleTime: 5 * 60 * 1000,
  })

  const dashboard = useMemo(() => dashboardQuery.data || {}, [dashboardQuery.data])
  const analytics = useMemo(() => dashboard?.analytics || {}, [dashboard])
  const currency = dashboard?.sales?.meta?.currency || 'INR'
  const revenue = useMemo(() => analytics?.revenue || {}, [analytics])
  const kpis = useMemo(() => analytics?.kpis || {}, [analytics])
  const leaderboards = useMemo(() => (Array.isArray(analytics?.leaderboards) ? analytics.leaderboards : []), [analytics])
  const pipeline = useMemo(() => analytics?.pipeline || {}, [analytics])
  const revenueByClient = useMemo(() => (Array.isArray(analytics?.analytics?.revenue_by_client) ? analytics.analytics.revenue_by_client : []), [analytics])
  const revenueByService = useMemo(() => (Array.isArray(analytics?.analytics?.revenue_by_service) ? analytics.analytics.revenue_by_service : []), [analytics])
  const revenueBySource = useMemo(() => (Array.isArray(analytics?.analytics?.revenue_by_lead_source) ? analytics.analytics.revenue_by_lead_source : []), [analytics])
  const revenueByIndustry = useMemo(() => (Array.isArray(analytics?.analytics?.revenue_by_industry) ? analytics.analytics.revenue_by_industry : []), [analytics])
  const stageConversion = useMemo(() => (Array.isArray(kpis?.stage_conversion) ? kpis.stage_conversion : []), [kpis])
  const stageBreakdown = useMemo(() => (Array.isArray(pipeline?.deals_by_stage) ? pipeline.deals_by_stage : []), [pipeline])

  const filteredWindow = useMemo(() => {
    if (!startDate && !endDate) return 'All time'
    const parts = []
    if (startDate) parts.push(timeService.formatDateOnly(startDate))
    if (endDate) parts.push(timeService.formatDateOnly(endDate))
    return parts.join(' - ')
  }, [endDate, startDate])

  // Calculate totals
  const totalRevenue = revenue.total_revenue ?? 0
  const monthlyRevenue = revenue.monthly_revenue ?? 0
  const forecastRevenue = revenue.forecast_revenue ?? 0
  const weightedPipeline = revenue.weighted_pipeline_value ?? 0
  const totalDeals = kpis.total_deals ?? 0
  const wonDeals = kpis.won_deals ?? 0
  const winRate = kpis.win_rate ?? 0
  const avgDealSize = kpis.average_deal_size ?? 0

  const exportRows = useMemo(() => {
    const rows = [
      ['Report', 'Value'],
      ['Total Revenue', totalRevenue],
      ['Monthly Revenue', monthlyRevenue],
      ['Quarterly Revenue', revenue.quarterly_revenue ?? 0],
      ['Yearly Revenue', revenue.yearly_revenue ?? 0],
      ['Won Revenue', revenue.won_revenue ?? 0],
      ['Lost Revenue', revenue.lost_revenue ?? 0],
      ['Forecast Revenue', forecastRevenue],
      ['Weighted Pipeline Value', weightedPipeline],
      ['Total Deals', totalDeals],
      ['Won Deals', wonDeals],
      ['Lost Deals', kpis.lost_deals ?? 0],
      ['Active Deals', kpis.active_deals ?? 0],
      ['Win Rate', `${winRate}%`],
      ['Loss Rate', `${kpis.loss_rate ?? 0}%`],
      ['Average Deal Size', avgDealSize],
      ['Average Sales Cycle', `${kpis.average_sales_cycle ?? 0} days`],
      ['Stage Conversion', stageConversion.map((item) => `${item.from} -> ${item.to}: ${item.conversion_percent}%`).join(' | ')],
    ]
    return rows
  }, [kpis, revenue, stageConversion, totalRevenue, monthlyRevenue, forecastRevenue, weightedPipeline, totalDeals, wonDeals, winRate, avgDealSize])

  const onExport = () => {
    downloadCsv(exportRows, `crm-reports-${timeService.now().getTime()}.csv`)
  }

  const loading = dashboardQuery.isLoading

  return (
    <CRMPage>
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-blue-600 to-indigo-600 px-4 py-3.5 text-white shadow-lg md:px-5 mb-5">
        <div className="absolute right-0 top-0 -mr-10 -mt-10 h-40 w-40 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-10 -mb-10 h-32 w-32 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">CRM Reports</p>
              <h1 className="text-lg font-bold md:text-xl">Reports</h1>
              <p className="truncate text-xs text-indigo-100 md:text-sm">Sales reporting built from the existing CRM dashboard analytics.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onExport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue, currency)}
          icon={DollarSign}
          color="indigo"
          subtitle="All time revenue"
        />
        <StatCard
          label="Monthly Revenue"
          value={formatCurrency(monthlyRevenue, currency)}
          icon={TrendingUp}
          color="emerald"
          subtitle="This month"
        />
        <StatCard
          label="Forecast Revenue"
          value={formatCurrency(forecastRevenue, currency)}
          icon={Target}
          color="amber"
          subtitle="Expected revenue"
        />
        <StatCard
          label="Win Rate"
          value={`${winRate}%`}
          icon={Award}
          color="blue"
          subtitle={`${wonDeals} won deals`}
        />
      </div>

      {/* Date Filters */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 mb-5">
        <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50/50 to-white px-4 py-3 dark:border-gray-700 dark:from-blue-950/20 dark:to-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-1.5 dark:bg-blue-900/30">
              <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Date Filters</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Filters shape the reporting window without changing backend analytics.</p>
            </div>
          </div>
        </div>
        <div className="p-3 sm:p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Start Date</span>
              <input 
                type="date" 
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" 
                value={startDate} 
                onChange={(event) => setStartDate(event.target.value)} 
                aria-label="Start date filter" 
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">End Date</span>
              <input 
                type="date" 
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" 
                value={endDate} 
                onChange={(event) => setEndDate(event.target.value)} 
                aria-label="End date filter" 
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => { setStartDate(''); setEndDate('') }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Filter className="h-4 w-4" />
                Clear
              </button>
              <Badge label={filteredWindow} colorKey="draft" />
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Report */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 mb-6">
        <div className="border-b border-gray-200 bg-gradient-to-r from-emerald-50/50 to-white p-4 dark:border-gray-700 dark:from-emerald-950/20 dark:to-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
              <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Revenue Report</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Revenue derived from the CRM dashboard aggregation.</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="mt-3 h-8 w-28" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Revenue</p>
                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(revenue.total_revenue ?? 0, currency)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Monthly</p>
                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(revenue.monthly_revenue ?? 0, currency)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Quarterly</p>
                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(revenue.quarterly_revenue ?? 0, currency)}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Yearly</p>
                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(revenue.yearly_revenue ?? 0, currency)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Report */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 mb-6">
        <div className="border-b border-gray-200 bg-gradient-to-r from-amber-50/50 to-white p-4 dark:border-gray-700 dark:from-amber-950/20 dark:to-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
              <PieChart className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Pipeline Report</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pipeline value, forecast, and stage breakdown from live CRM data.</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          {loading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Forecast Revenue</p>
                  <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">{formatCurrency(revenue.forecast_revenue ?? 0, currency)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Weighted Pipeline</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(revenue.weighted_pipeline_value ?? 0, currency)}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Pipeline Value</p>
                  <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(pipeline.pipeline_value ?? 0, currency)}</p>
                </div>
              </div>
              <div className="space-y-3">
                {stageBreakdown.length ? stageBreakdown.map((stage) => (
                  <div key={stage.stage} className="rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-900/50 dark:hover:border-indigo-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{stage.stage}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{stage.count} deals</p>
                      </div>
                      <Badge label={formatCurrency(stage.value || 0, currency)} colorKey="draft" />
                    </div>
                  </div>
                )) : (
                  <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No pipeline data available</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deal Conversion & Sales Performance */}
      <div className="grid gap-6 xl:grid-cols-2 mb-6">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 bg-gradient-to-r from-purple-50/50 to-white p-4 dark:border-gray-700 dark:from-purple-950/20 dark:to-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Deal Conversion</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Conversion and sales performance metrics</p>
              </div>
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Deals</p>
                  <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{kpis.total_deals ?? 0}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Won Deals</p>
                  <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{kpis.won_deals ?? 0}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Lost Deals</p>
                  <p className="mt-1 text-lg font-bold text-rose-600 dark:text-rose-400">{kpis.lost_deals ?? 0}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Win Rate</p>
                  <p className="mt-1 text-lg font-bold text-blue-600 dark:text-blue-400">{kpis.win_rate ?? 0}%</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Loss Rate</p>
                  <p className="mt-1 text-lg font-bold text-gray-600 dark:text-gray-400">{kpis.loss_rate ?? 0}%</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Avg Deal Size</p>
                  <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(kpis.average_deal_size ?? 0, currency)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 bg-gradient-to-r from-rose-50/50 to-white p-4 dark:border-gray-700 dark:from-rose-950/20 dark:to-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-rose-100 p-2 dark:bg-rose-900/30">
                <Clock className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Sales Performance</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Average sales cycle and team performance</p>
              </div>
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Average Sales Cycle</p>
                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{kpis.average_sales_cycle ?? 0} days</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Stage Transitions</p>
                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{stageConversion.length}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Forecast Revenue</p>
                  <p className="mt-1 text-xl font-bold text-amber-600 dark:text-amber-400">{formatCurrency(revenue.forecast_revenue ?? 0, currency)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Team Leaderboard & Stage Conversion */}
      <div className="grid gap-6 xl:grid-cols-2 mb-6">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Team Leaderboard</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Salesperson performance from CRM deal outcomes</p>
              </div>
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : leaderboards.length ? (
              <div className="space-y-3">
                {leaderboards.map((row, index) => (
                  <div key={row.salesperson} className={`rounded-xl border p-4 transition hover:shadow-md ${
                    index === 0 ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20' :
                    'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/50'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${
                          index === 0 ? 'bg-amber-500 text-white' :
                          index === 1 ? 'bg-gray-400 text-white' :
                          index === 2 ? 'bg-orange-600 text-white' :
                          'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{row.salesperson}</h3>
                          <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span>Closed {row.deals_closed || 0}</span>
                            <span>•</span>
                            <span>Win {row.win_rate || 0}%</span>
                            <span>•</span>
                            <span>Avg {formatCurrency(row.average_deal_value || 0, currency)}</span>
                          </div>
                        </div>
                      </div>
                      <Badge label={formatCurrency(row.revenue || 0, currency)} colorKey={index === 0 ? 'emerald' : 'draft'} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No leaderboard data available</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 bg-gradient-to-r from-teal-50/50 to-white p-4 dark:border-gray-700 dark:from-teal-950/20 dark:to-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-teal-100 p-2 dark:bg-teal-900/30">
                <Zap className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Stage Conversion</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Stage-to-stage conversion percentages</p>
              </div>
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : stageConversion.length ? (
              <div className="space-y-3">
                {stageConversion.map((item) => (
                  <div key={`${item.from}-${item.to}`} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.from} → {item.to}</p>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" 
                          style={{ width: `${Math.min(item.conversion_percent, 100)}%` }}
                        />
                      </div>
                      <Badge label={`${item.conversion_percent}%`} colorKey="draft" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No stage conversion data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Revenue Breakdowns */}
      <div className="grid gap-6 xl:grid-cols-2 mb-6">
        <ReportCard 
          title="Revenue by Client" 
          items={revenueByClient.map(r => ({ label: r.client, value: formatCurrency(r.revenue || 0, currency) }))}
          icon={Users}
          color="blue"
          emptyMessage="No client revenue data available"
        />
        <ReportCard 
          title="Revenue by Service" 
          items={revenueByService.map(r => ({ label: r.service, value: formatCurrency(r.revenue || 0, currency) }))}
          icon={Briefcase}
          color="emerald"
          emptyMessage="No service revenue data available"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2 mb-6">
        <ReportCard 
          title="Revenue by Lead Source" 
          items={revenueBySource.map(r => ({ label: r.source, value: formatCurrency(r.revenue || 0, currency) }))}
          icon={Sparkles}
          color="amber"
          emptyMessage="No lead source revenue data available"
        />
        <ReportCard 
          title="Revenue by Industry" 
          items={revenueByIndustry.map(r => ({ label: r.industry, value: formatCurrency(r.revenue || 0, currency) }))}
          icon={Building2}
          color="purple"
          emptyMessage="No industry revenue data available"
        />
      </div>

      {/* Export Section */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50/50 to-white p-4 dark:border-gray-700 dark:from-gray-950/20 dark:to-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
              <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Export</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">CSV export of the current report snapshot</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge label={`${exportRows.length - 1} rows`} colorKey="draft" />
            <button
              onClick={onExport}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </CRMPage>
  )
}
