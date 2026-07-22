import { useMemo, useSyncExternalStore } from 'react'
import { AlertTriangle, ArrowDownWideNarrow, Clock3, Copy, Gauge, RefreshCw, ShieldAlert } from 'lucide-react'
import { timeService } from '@/services/timeService'
import {
  clearApiPerformanceMetrics,
  getApiPerformanceMetrics,
  getApiPerformanceSummaries,
  subscribeApiPerformanceMetrics,
} from '../utils/apiPerformanceMonitor'

const formatMs = (value) => `${Number(value || 0).toFixed(1)} ms`

const formatBytes = (value) => {
  if (value == null || Number.isNaN(value)) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

const formatTime = (ts) => timeService.format(ts, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const metricTotals = (metrics) => {
  const totalCalls = metrics.length
  const failures = metrics.filter((metric) => !metric.ok).length
  const duplicates = metrics.filter((metric) => metric.duplicate).length
  const averageMs = totalCalls ? metrics.reduce((sum, metric) => sum + metric.durationMs, 0) / totalCalls : 0
  const maxMs = totalCalls ? Math.max(...metrics.map((metric) => metric.durationMs)) : 0
  return { totalCalls, failures, duplicates, averageMs, maxMs }
}

const ApiMetricRow = ({ metric }) => (
  <tr className="border-b border-border/70 last:border-b-0 dark:border-border">
    <td className="px-4 py-3">
      <div className="max-w-[32rem]">
        <div className="truncate font-medium text-text-primary dark:text-text-primary">{metric.endpoint}</div>
        <div className="mt-1 text-xs text-text-muted dark:text-text-secondary">{formatTime(metric.startTime)}</div>
      </div>
    </td>
    <td className="px-4 py-3">
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${metric.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'}`}>
        {metric.method}
      </span>
    </td>
      <td className="px-4 py-3 text-sm text-text-secondary dark:text-text-secondary">{formatMs(metric.durationMs)}</td>
      <td className="px-4 py-3 text-sm text-text-secondary dark:text-text-secondary">{metric.status ?? '-'}</td>
      <td className="px-4 py-3 text-sm text-text-secondary dark:text-text-secondary">{formatBytes(metric.responseSizeBytes)}</td>
    <td className="px-4 py-3 text-sm text-text-secondary dark:text-text-secondary">{metric.duplicate ? 'Yes' : 'No'}</td>
  </tr>
)

const SummaryCard = ({ title, value, hint, icon: Icon, tone = 'blue' }) => {
  const toneClasses = {
    blue: 'from-sky-50 to-surface text-sky-700 border-sky-200/80 dark:from-sky-950/30 dark:to-black/70 dark:text-sky-300 dark:border-sky-900/50',
    green: 'from-emerald-50 to-surface text-emerald-700 border-emerald-200/80 dark:from-emerald-950/30 dark:to-black/70 dark:text-emerald-300 dark:border-emerald-900/50',
    amber: 'from-amber-50 to-surface text-amber-700 border-amber-200/80 dark:from-amber-950/30 dark:to-black/70 dark:text-amber-300 dark:border-amber-900/50',
    rose: 'from-rose-50 to-surface text-rose-700 border-rose-200/80 dark:from-rose-950/30 dark:to-black/70 dark:text-rose-300 dark:border-rose-900/50',
  }

  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 shadow-sm ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">{title}</div>
          <div className="mt-2 text-3xl font-black tracking-tight text-text-primary dark:text-text-primary">{value}</div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface shadow-sm dark:bg-black/60">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 text-sm text-text-secondary dark:text-text-secondary">{hint}</div>
    </div>
  )
}

const ApiPerformanceDashboard = () => {
  const metrics = useSyncExternalStore(
    subscribeApiPerformanceMetrics,
    getApiPerformanceMetrics,
    getApiPerformanceMetrics,
  )

  const summaries = useMemo(() => getApiPerformanceSummaries(metrics), [metrics])
  const totals = metricTotals(metrics)
  const slowest = summaries.slice(0, 12)

  return (
    <div className="min-h-full bg-surface-muted p-4 text-text-primary dark:bg-black dark:text-text-primary sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 shadow-sm dark:border-border dark:bg-black/95 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-primary-700 dark:border-primary-900/60 dark:bg-primary-950/40 dark:text-primary-300">
              <Gauge className="h-3.5 w-3.5" />
              API Performance
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Live API performance dashboard</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-text-secondary dark:text-text-secondary">
              Tracks every Axios and wrapped fetch request in memory so you can spot slow endpoints, duplicate calls, and waterfall patterns during a session.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => clearApiPerformanceMetrics()}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-secondary transition hover:bg-surface-muted dark:border-border dark:bg-black/70 dark:text-text-secondary dark:hover:bg-white/5"
            >
              <RefreshCw className="h-4 w-4" />
              Clear metrics
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Total calls"
            value={totals.totalCalls}
            hint="All observed requests in this browser session."
            icon={ArrowDownWideNarrow}
            tone="blue"
          />
          <SummaryCard
            title="Average time"
            value={formatMs(totals.averageMs)}
            hint="Mean response time across all requests."
            icon={Clock3}
            tone="green"
          />
          <SummaryCard
            title="Max time"
            value={formatMs(totals.maxMs)}
            hint="Slowest single request recorded."
            icon={AlertTriangle}
            tone="amber"
          />
          <SummaryCard
            title="Failures / duplicates"
            value={`${totals.failures} / ${totals.duplicates}`}
            hint="Failures and duplicate request detections."
            icon={ShieldAlert}
            tone="rose"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm dark:border-border dark:bg-black/95">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Slowest endpoints</h2>
                <p className="text-sm text-text-muted dark:text-text-secondary">Sorted by max response time first.</p>
              </div>
            </div>
            <div className="viewport-scroll-x max-h-[520px] overflow-y-auto">
              <table className="w-full border-separate border-spacing-0">
                <thead className="sticky top-0 bg-surface dark:bg-black/95">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                    <th className="px-3 py-3">Endpoint</th>
                    <th className="px-3 py-3">Method</th>
                    <th className="px-3 py-3">Calls</th>
                    <th className="px-3 py-3">Avg</th>
                    <th className="px-3 py-3">Max</th>
                    <th className="px-3 py-3">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {slowest.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-sm text-text-muted dark:text-text-secondary">
                        No API metrics yet. Open a page or trigger an action to start collecting data.
                      </td>
                    </tr>
                  ) : (
                    slowest.map((summary) => (
                      <tr key={`${summary.method}-${summary.endpoint}-${summary.source}`} className="border-b border-border/70 last:border-b-0 dark:border-border">
                        <td className="px-3 py-4">
                          <div className="max-w-[24rem]">
                            <div className="truncate text-sm font-medium text-text-primary dark:text-text-primary">{summary.endpoint}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-text-muted">{summary.source}</div>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm font-semibold">{summary.method}</td>
                        <td className="px-3 py-4 text-sm">{summary.callCount}</td>
                        <td className="px-3 py-4 text-sm">{formatMs(summary.averageMs)}</td>
                        <td className="px-3 py-4 text-sm font-semibold text-text-primary dark:text-text-primary">{formatMs(summary.maxMs)}</td>
                        <td className="px-3 py-4 text-sm">
                          <span className={summary.failureCount > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-300'}>
                            {summary.failureCount}
                          </span>
                          <span className="text-text-muted"> / </span>
                          <span className={summary.duplicateCount > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-text-muted'}>
                            {summary.duplicateCount}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6 shadow-sm dark:border-border dark:bg-black/95">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Recent requests</h2>
                <p className="text-sm text-text-muted dark:text-text-secondary">Most recent in-memory entries, newest first.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-text-secondary dark:bg-black/70 dark:text-text-secondary">
                <Copy className="h-3.5 w-3.5" />
                {metrics.length} rows
              </div>
            </div>

            <div className="viewport-scroll-x max-h-[520px] overflow-y-auto rounded-2xl border border-border dark:border-border">
              <table className="w-full border-separate border-spacing-0">
                <thead className="sticky top-0 bg-surface dark:bg-black/95">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                    <th className="px-4 py-3">Endpoint</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Dup</th>
                  </tr>
                </thead>
                <tbody>
                  {[...metrics].reverse().map((metric) => (
                    <ApiMetricRow key={metric.id} metric={metric} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ApiPerformanceDashboard
