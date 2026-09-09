/**
 * Content Overview — modeled on the Work module's overview page.
 *
 * Operational view of the content lifecycle:
 * - Overall progress: weighted pipeline progress + per-stage distribution
 * - Today: due today, overdue, upcoming deadlines, items awaiting review
 * - Needs Attention sidebar: overdue / revision / review-waiting items
 *
 * All data comes from the existing workspace aggregate (GET /content) — no
 * new backend surface.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import {
  AlertTriangle, Calendar, CheckCircle2, ChevronRight, Clock, Eye,
  Layers, RotateCcw, Send, Sparkles, Users,
} from 'lucide-react'
import { contentProductionApi } from '../api/contentProduction'
import { timeService } from '@/services/timeService'

// ── Lifecycle colors (mirrors the Content workspace pipeline) ──────────────

const STAGE_COLORS = {
  idea: '#A855F7',
  briefing: '#3B82F6',
  script: '#6366F1',
  production: '#F59E0B',
  internal_review: '#F97316',
  client_review: '#06B6D4',
  revision_required: '#EF4444',
  approved: '#10B981',
  ready_to_publish: '#14B8A6',
  published: '#2FB47C',
  // Legacy
  draft: '#9CA3AF',
  planned: '#3B82F6',
  scheduled: '#14B8A6',
}

const STATUS_COLORS = {
  idea: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  briefing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  script: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  production: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  internal_review: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  client_review: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  revision_required: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  ready_to_publish: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  // Legacy
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  planned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  scheduled: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
}

// Forward lifecycle order for the distribution bar + legend.
const STAGE_ORDER = [
  'idea', 'briefing', 'script', 'production', 'internal_review',
  'client_review', 'revision_required', 'approved', 'ready_to_publish', 'published',
]

// Pipeline position of each stage — used for the weighted overall progress.
const STAGE_WEIGHT = {
  idea: 0, briefing: 1, script: 2, production: 3, internal_review: 4,
  client_review: 5, revision_required: 3, approved: 6, ready_to_publish: 7, published: 8,
  draft: 0, planned: 1, scheduled: 7,
}
const MAX_WEIGHT = 8

const SEVERITY_STYLES = {
  high: 'border-l-red-500 bg-red-50/50 dark:border-[var(--color-app-border)] dark:bg-red-950/25',
  medium: 'border-l-amber-500 bg-amber-50/50 dark:border-[var(--color-app-border)] dark:bg-amber-950/25',
  low: 'border-l-cyan-500 bg-cyan-50/50 dark:border-[var(--color-app-border)] dark:bg-cyan-950/25',
}

function formatStatusLabel(status) {
  if (!status) return 'Unknown'
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function itemDueDate(item) {
  return item.due_date || item.deadline || null
}

function isSameDay(a, b) {
  return a.toDateString() === b.toDateString()
}

// ── Main Component ────────────────────────────────────────────────────────

export default function ContentOverview() {
  const { data: workspaceData, isLoading, isError } = useQuery(
    ['content-overview'],
    () => contentProductionApi.getWorkspace({}),
    { staleTime: 30 * 1000 }
  )

  const items = useMemo(() => workspaceData?.data?.items || [], [workspaceData])
  const lifecycleCounts = useMemo(() => workspaceData?.data?.lifecycle_counts || {}, [workspaceData])
  const overview = useMemo(() => workspaceData?.data?.overview || {}, [workspaceData])
  const total = Number(overview.total || items.length || 0)

  const {
    dueToday, overdueItems, upcoming, awaitingReview, attention,
    progressPct, distribution,
  } = useMemo(() => {
    const now = timeService.now()
    const due = []
    const overdue = []
    const upcomingList = []
    const awaiting = []
    const revision = []
    let progressSum = 0

    for (const item of items) {
      const dueRaw = itemDueDate(item)
      const weight = STAGE_WEIGHT[item.status] ?? 0
      progressSum += weight
      if (item.completed && item.status === 'published') continue

      const status = item.status || 'idea'
      if (status === 'internal_review' || status === 'client_review') awaiting.push(item)
      if (status === 'revision_required') revision.push(item)

      if (dueRaw) {
        const dueDate = timeService.instant(dueRaw)
        if (Number.isNaN(dueDate.getTime())) continue
        if (isSameDay(dueDate, now)) {
          due.push(item)
        } else if (dueDate < now) {
          overdue.push(item)
        } else {
          const diffDays = (dueDate.getTime() - now.getTime()) / 86_400_000
          if (diffDays <= 7) upcomingList.push(item)
        }
      }
    }

    const progressPct = total ? Math.min(100, Math.round((progressSum / (total * MAX_WEIGHT)) * 100)) : 0
    const distribution = STAGE_ORDER.map((key) => ({
      key,
      count: Number(lifecycleCounts[key] || 0),
      color: STAGE_COLORS[key] || '#9CA3AF',
    })).filter((entry) => entry.count > 0)

    const attention = [
      ...overdue.map((item) => ({ item, severity: 'high', reason: 'Overdue' })),
      ...revision.map((item) => ({ item, severity: 'medium', reason: 'Revision required' })),
      ...awaiting.map((item) => ({ item, severity: 'low', reason: 'Awaiting review' })),
    ].slice(0, 8)

    return { dueToday: due, overdueItems: overdue, upcoming: upcomingList, awaitingReview: awaiting, attention, progressPct, distribution }
  }, [items, lifecycleCounts, total])

  if (isLoading) return <LoadingSkeleton />

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-red-500" />
        <p className="mt-2 text-sm font-medium text-red-700">Failed to load content overview</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Content Overview</h1>
        <p className="text-sm text-text-muted">Progress across the content lifecycle and what needs attention today.</p>
      </div>

      {/* Summary Cards */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryCard label="Total" value={total} icon={Layers} colorClass="bg-gray-500/10 text-gray-600" />
        <SummaryCard label="Due Today" value={overview.due_today || 0} icon={Calendar} colorClass="bg-amber-500/10 text-amber-600" />
        <SummaryCard label="Overdue" value={overview.overdue || 0} icon={AlertTriangle} colorClass="bg-red-500/10 text-red-600" />
        <SummaryCard label="In Production" value={overview.in_production || 0} icon={Sparkles} colorClass="bg-pink-500/10 text-pink-600" />
      </section>
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryCard label="Internal Review" value={overview.awaiting_internal_review || 0} icon={Eye} colorClass="bg-orange-500/10 text-orange-600" />
        <SummaryCard label="Client Review" value={overview.awaiting_client_approval || 0} icon={Users} colorClass="bg-cyan-500/10 text-cyan-600" />
        <SummaryCard label="Ready to Publish" value={overview.ready_to_publish || 0} icon={Send} colorClass="bg-teal-500/10 text-teal-600" />
        <SummaryCard label="Revision" value={overview.revision_required || 0} icon={RotateCcw} colorClass="bg-rose-500/10 text-rose-600" />
      </section>

      {/* Overall Progress */}
      <section className="rounded-2xl border border-surface-border bg-surface p-4 shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Overall Progress</h3>
          <span className="text-lg font-bold text-text-primary">{progressPct}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted dark:bg-[var(--color-app-surface-muted)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-500 transition-all"
            style={{ width: `${progressPct}%` }}
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full">
          {distribution.map((entry) => (
            <div
              key={entry.key}
              title={`${formatStatusLabel(entry.key)}: ${entry.count}`}
              style={{ width: `${total ? (entry.count / total) * 100 : 0}%`, backgroundColor: entry.color }}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {distribution.map((entry) => (
            <Link
              key={entry.key}
              to={`/content?status=${entry.key}`}
              className="flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-primary"
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span>{formatStatusLabel(entry.key)}</span>
              <span className="font-semibold text-text-primary">{entry.count}</span>
            </Link>
          ))}
          {distribution.length === 0 && <span className="text-xs text-text-muted">No content items yet — create one in the Content workspace.</span>}
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Main column — today + queues */}
        <div className="min-w-0 space-y-5">
          {dueToday.length > 0 && (
            <section>
              <SectionHeader title="Due Today" count={dueToday.length} />
              <div className="space-y-2">
                {dueToday.map((item) => <ContentRow key={item.id} item={item} accent="border-l-amber-400 bg-amber-50/40 dark:border-l-amber-500 dark:bg-amber-950/20" />)}
              </div>
            </section>
          )}

          {overdueItems.length > 0 && (
            <section>
              <SectionHeader title="Overdue" count={overdueItems.length} />
              <div className="space-y-2">
                {overdueItems.map((item) => <ContentRow key={item.id} item={item} accent="border-l-red-400 bg-red-50/40 dark:border-l-red-500 dark:bg-red-950/20" />)}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <SectionHeader title="Upcoming Deadlines" count={upcoming.length} />
              <div className="space-y-2">
                {upcoming.map((item) => <ContentRow key={item.id} item={item} />)}
              </div>
            </section>
          )}

          {awaitingReview.length > 0 && (
            <section>
              <SectionHeader title="Awaiting Review" count={awaitingReview.length} viewAllLink="/content?status=internal_review" />
              <div className="space-y-2">
                {awaitingReview.map((item) => <ContentRow key={item.id} item={item} accent="border-l-cyan-400 bg-cyan-50/40 dark:border-l-cyan-500 dark:bg-cyan-950/20" />)}
              </div>
            </section>
          )}

          {dueToday.length === 0 && overdueItems.length === 0 && upcoming.length === 0 && awaitingReview.length === 0 && (
            <div className="rounded-lg border border-dashed border-surface-border bg-surface-muted p-6 text-center dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)]">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-2 text-sm font-medium text-text-primary">Nothing due right now</p>
              <p className="mt-1 text-xs text-text-muted">Due dates and review queues will appear here as content moves through the lifecycle.</p>
            </div>
          )}
        </div>

        {/* Needs Attention */}
        <aside className="min-w-0 rounded-2xl border border-surface-border bg-surface p-3 shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Needs Attention</h3>
            {attention.length > 0 && (
              <Link to="/content" className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700">
                View all
                <ChevronRight className="h-3 w-3" />
              </Link>
            )}
          </div>
          <div className="space-y-2">
            {attention.length === 0 ? (
              <p className="rounded-lg border border-dashed border-surface-border p-4 text-center text-xs text-text-muted dark:border-[var(--color-app-border)]">
                No attention items — everything is on track.
              </p>
            ) : (
              attention.map(({ item, severity, reason }) => (
                <Link
                  key={`${severity}-${item.id}`}
                  to={`/content/${item.id}`}
                  className={`block rounded-lg border border-surface-border border-l-4 p-3 shadow-sm transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:hover:border-primary-400 ${SEVERITY_STYLES[severity] || 'border-l-gray-300'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text-primary">{item.title}</p>
                      <p className="mt-0.5 text-xs text-text-muted">{reason}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                      {formatStatusLabel(item.status)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

// ── Shared UI Components ──────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, colorClass }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-3 shadow-sm transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:hover:border-primary-400">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colorClass}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase text-text-muted">{label}</p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-text-primary">{value}</p>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, count, viewAllLink }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {viewAllLink && count > 0 && (
        <Link to={viewAllLink} className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700">
          View all {count}
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}

// Compact row (mirrors Work's TaskRow) with an optional status-colored left accent.
function ContentRow({ item, accent = 'border-l-gray-300 bg-surface-muted/40 dark:border-l-gray-600 dark:bg-[var(--color-app-surface-muted)]' }) {
  const statusClass = STATUS_COLORS[item.status] || STATUS_COLORS.idea
  const dueRaw = itemDueDate(item)
  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border border-surface-border border-l-4 px-3 py-2.5 shadow-sm transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:hover:border-primary-400 ${accent}`}>
      <div className="min-w-0 flex-1">
        <Link to={`/content/${item.id}`} className="line-clamp-1 text-sm font-medium text-text-primary hover:text-primary-600">
          {item.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusClass}`}>
            {formatStatusLabel(item.status)}
          </span>
          <span className="font-medium text-text-muted">{item.priority}</span>
          {item.platform && <span>· {item.platform}</span>}
          {item.assignee_name && <span>· → {item.assignee_name}</span>}
        </div>
      </div>
      {dueRaw && (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-text-muted">
          <Clock className="h-3 w-3" />
          Due {timeService.formatPattern(timeService.instant(dueRaw), 'MMM d')}
        </span>
      )}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-48 animate-pulse rounded bg-surface-muted" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-muted" />)}
      </div>
      <div className="h-32 animate-pulse rounded-lg bg-surface-muted" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-muted" />)}
      </div>
    </div>
  )
}