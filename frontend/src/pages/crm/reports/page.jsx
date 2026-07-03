import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { Download, FileText, Filter, LineChart, TrendingUp, Users } from 'lucide-react'
import { format } from 'date-fns'
import { crmApi } from '../../../api/crm'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, Skeleton } from '../../../components/ui'

const formatCurrency = (value, currency = 'INR') => {
  const numericValue = Number(value || 0)
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(numericValue)
  } catch {
    return `Rs ${numericValue.toLocaleString('en-IN')}`
  }
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
  const revenueBySource = useMemo(() => (Array.isArray(analytics?.analytics?.revenue_by_source) ? analytics.analytics.revenue_by_source : []), [analytics])
  const revenueByIndustry = useMemo(() => (Array.isArray(analytics?.analytics?.revenue_by_industry) ? analytics.analytics.revenue_by_industry : []), [analytics])
  const stageConversion = useMemo(() => (Array.isArray(kpis?.stage_conversion) ? kpis.stage_conversion : []), [kpis])
  const stageBreakdown = useMemo(() => (Array.isArray(pipeline?.deals_by_stage) ? pipeline.deals_by_stage : []), [pipeline])

  const filteredWindow = useMemo(() => {
    if (!startDate && !endDate) return 'All time'
    const parts = []
    if (startDate) parts.push(format(new Date(startDate), 'MMM d, yyyy'))
    if (endDate) parts.push(format(new Date(endDate), 'MMM d, yyyy'))
    return parts.join(' - ')
  }, [endDate, startDate])

  const exportRows = useMemo(() => {
    const rows = [
      ['Report', 'Value'],
      ['Total Revenue', revenue.total_revenue ?? 0],
      ['Monthly Revenue', revenue.monthly_revenue ?? 0],
      ['Quarterly Revenue', revenue.quarterly_revenue ?? 0],
      ['Yearly Revenue', revenue.yearly_revenue ?? 0],
      ['Won Revenue', revenue.won_revenue ?? 0],
      ['Lost Revenue', revenue.lost_revenue ?? 0],
      ['Forecast Revenue', revenue.forecast_revenue ?? 0],
      ['Weighted Pipeline Value', revenue.weighted_pipeline_value ?? 0],
      ['Total Deals', kpis.total_deals ?? 0],
      ['Won Deals', kpis.won_deals ?? 0],
      ['Lost Deals', kpis.lost_deals ?? 0],
      ['Active Deals', kpis.active_deals ?? 0],
      ['Win Rate', `${kpis.win_rate ?? 0}%`],
      ['Loss Rate', `${kpis.loss_rate ?? 0}%`],
      ['Average Deal Size', kpis.average_deal_size ?? 0],
      ['Average Sales Cycle', kpis.average_sales_cycle ?? 0],
      ['Stage Conversion', stageConversion.map((item) => `${item.from} -> ${item.to}: ${item.conversion_percent}%`).join(' | ')],
    ]
    return rows
  }, [kpis, revenue, stageConversion])

  const onExport = () => {
    downloadCsv(exportRows, `crm-reports-${Date.now()}.csv`)
  }

  const loading = dashboardQuery.isLoading

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM Reports"
        title="Reports"
        description="Sales reporting built from the existing CRM dashboard analytics."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onExport}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        )}
      />

      <CRMSection title="Date Filters" description="Filters shape the reporting window without changing backend analytics.">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Start date</span>
            <input type="date" className="input" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Start date filter" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">End date</span>
            <input type="date" className="input" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label="End date filter" />
          </label>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={() => { setStartDate(''); setEndDate('') }}>
              <Filter className="h-4 w-4" />
              Clear
            </Button>
            <Badge label={filteredWindow} colorKey="draft" />
          </div>
        </div>
      </CRMSection>

      <CRMSection title="Revenue Report" description="Revenue derived from the CRM dashboard aggregation.">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="rounded-2xl border border-surface-border/80 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/60">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="mt-3 h-8 w-28" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <CRMStatCard icon={TrendingUp} label="Total Revenue" value={formatCurrency(revenue.total_revenue ?? 0, currency)} tone="blue" />
            <CRMStatCard icon={TrendingUp} label="Monthly Revenue" value={formatCurrency(revenue.monthly_revenue ?? 0, currency)} tone="emerald" />
            <CRMStatCard icon={TrendingUp} label="Quarterly Revenue" value={formatCurrency(revenue.quarterly_revenue ?? 0, currency)} tone="amber" />
            <CRMStatCard icon={TrendingUp} label="Yearly Revenue" value={formatCurrency(revenue.yearly_revenue ?? 0, currency)} tone="slate" />
          </div>
        )}
      </CRMSection>

      <CRMSection title="Pipeline Report" description="Pipeline value, forecast, and stage breakdown from live CRM data.">
        {loading ? (
          <Skeleton className="h-48 w-full rounded-3xl" />
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="space-y-3">
              <CRMStatCard icon={LineChart} label="Forecast Revenue" value={formatCurrency(revenue.forecast_revenue ?? 0, currency)} tone="amber" />
              <CRMStatCard icon={LineChart} label="Weighted Pipeline" value={formatCurrency(revenue.weighted_pipeline_value ?? 0, currency)} tone="slate" />
              <CRMStatCard icon={LineChart} label="Pipeline Value" value={formatCurrency(pipeline.pipeline_value ?? 0, currency)} tone="blue" />
            </section>
            <section className="space-y-3">
              {stageBreakdown.length ? stageBreakdown.map((stage) => (
                <article key={stage.stage} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{stage.stage}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{stage.count} deals</p>
                    </div>
                    <Badge label={formatCurrency(stage.value || 0, currency)} colorKey="draft" />
                  </div>
                </article>
              )) : (
                <CRMEmptyState icon={LineChart} title="No pipeline data" description="Pipeline reporting will appear as the CRM board gains live deals." />
              )}
            </section>
          </div>
        )}
      </CRMSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <CRMSection title="Deal Conversion" description="Conversion and sales performance metrics.">
          {loading ? (
            <Skeleton className="h-64 w-full rounded-3xl" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <MiniStat label="Total Deals" value={kpis.total_deals ?? 0} />
              <MiniStat label="Won Deals" value={kpis.won_deals ?? 0} />
              <MiniStat label="Lost Deals" value={kpis.lost_deals ?? 0} />
              <MiniStat label="Win Rate" value={`${kpis.win_rate ?? 0}%`} />
              <MiniStat label="Loss Rate" value={`${kpis.loss_rate ?? 0}%`} />
              <MiniStat label="Avg Deal Size" value={formatCurrency(kpis.average_deal_size ?? 0, currency)} />
            </div>
          )}
        </CRMSection>

        <CRMSection title="Sales Performance" description="Average sales cycle and team performance.">
          {loading ? (
            <Skeleton className="h-64 w-full rounded-3xl" />
          ) : (
            <div className="space-y-3">
              <MiniStat label="Average Sales Cycle" value={`${kpis.average_sales_cycle ?? 0} days`} />
              <MiniStat label="Stage Conversion" value={`${stageConversion.length} transitions`} />
              <MiniStat label="Forecast Revenue" value={formatCurrency(revenue.forecast_revenue ?? 0, currency)} />
            </div>
          )}
        </CRMSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <CRMSection title="Team Leaderboard" description="Salesperson performance from CRM deal outcomes.">
          {loading ? (
            <Skeleton className="h-64 w-full rounded-3xl" />
          ) : leaderboards.length ? (
            <div className="space-y-3">
              {leaderboards.map((row, index) => (
                <article key={row.salesperson} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">#{index + 1}</p>
                      <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{row.salesperson}</h3>
                    </div>
                    <Badge label={formatCurrency(row.revenue || 0, currency)} colorKey="draft" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Badge label={`Closed ${row.deals_closed || 0}`} colorKey="draft" />
                    <Badge label={`Win ${row.win_rate || 0}%`} colorKey="draft" />
                    <Badge label={`Avg ${formatCurrency(row.average_deal_value || 0, currency)}`} colorKey="draft" />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <CRMEmptyState icon={Users} title="No leaderboard data" description="Closed deals will populate this report." />
          )}
        </CRMSection>

        <CRMSection title="Stage Conversion" description="Stage-to-stage conversion percentages.">
          {loading ? (
            <Skeleton className="h-64 w-full rounded-3xl" />
          ) : stageConversion.length ? (
            <div className="space-y-3">
              {stageConversion.map((item) => (
                <article key={`${item.from}-${item.to}`} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.from} → {item.to}</p>
                    <Badge label={`${item.conversion_percent}%`} colorKey="draft" />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <CRMEmptyState icon={LineChart} title="No stage conversion data" description="Stage movement data will appear as deals progress." />
          )}
        </CRMSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <CRMSection title="Revenue by Client" description="Closed revenue by customer.">
          {revenueByClient.length ? revenueByClient.map((row) => (
            <ReportRow key={row.client} label={row.client} value={formatCurrency(row.revenue || 0, currency)} />
          )) : <CRMEmptyState icon={Users} title="No client revenue" description="Won deals will appear here." />}
        </CRMSection>

        <CRMSection title="Revenue by Service" description="Revenue grouped by service line.">
          {revenueByService.length ? revenueByService.map((row) => (
            <ReportRow key={row.service} label={row.service} value={formatCurrency(row.revenue || 0, currency)} />
          )) : <CRMEmptyState icon={TrendingUp} title="No service revenue" description="Service-level revenue will appear here." />}
        </CRMSection>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <CRMSection title="Revenue by Lead Source" description="Closed revenue grouped by source.">
          {revenueBySource.length ? revenueBySource.map((row) => (
            <ReportRow key={row.source} label={row.source} value={formatCurrency(row.revenue || 0, currency)} />
          )) : <CRMEmptyState icon={FileText} title="No source revenue" description="Lead source reporting will populate with CRM data." />}
        </CRMSection>

        <CRMSection title="Revenue by Industry" description="Closed revenue grouped by industry.">
          {revenueByIndustry.length ? revenueByIndustry.map((row) => (
            <ReportRow key={row.industry} label={row.industry} value={formatCurrency(row.revenue || 0, currency)} />
          )) : <CRMEmptyState icon={TrendingUp} title="No industry revenue" description="Industry-level reporting will populate with CRM data." />}
        </CRMSection>
      </div>

      <CRMSection title="Export" description="CSV export of the current report snapshot.">
        <div className="flex flex-wrap items-center gap-3">
          <Badge label={`Rows ${exportRows.length - 1}`} colorKey="draft" />
          <Button variant="primary" onClick={onExport}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </CRMSection>
    </CRMPage>
  )
}

function MiniStat({ label, value }) {
  return (
    <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </article>
  )
}

function ReportRow({ label, value }) {
  return (
    <article className="flex items-center justify-between rounded-2xl border border-surface-border/80 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
      <span className="text-sm text-gray-500 dark:text-gray-400">{value}</span>
    </article>
  )
}
