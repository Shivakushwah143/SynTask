/**
 * Content Overview — the operational command center for Content.
 *
 * Every metric, queue row, workload bucket, shoot entry, pipeline count and
 * recommendation comes from the canonical backend aggregate
 * (GET /content/overview). The frontend computes NO counters of its own —
 * each queue carries its own items from the backend so numbers and rows can
 * never disagree, and every row links to the canonical /content/:itemId.
 *
 * Layout (modeled on the Work module's overview page):
 * - Metric cards: Due Today, Overdue, Internal Review, Client Approval,
 *   Revision Required, Ready to Publish, In Production, Total
 * - Main column queues: Due Today, Overdue, Awaiting Internal Review,
 *   Awaiting Client Approval, Revision Required, Ready to Publish
 * - Sidebar: Content Pipeline (lifecycle distribution, linked to workspace
 *   tabs), Production Workload, Upcoming Shoots, AI Recommendations
 *   (deterministic signals from the backend).
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from 'react-query'
import {
  AlertTriangle, Calendar, Camera, CheckCircle2, ChevronRight, Clock, Eye,
  Layers, Lightbulb, MapPin, RotateCcw, Send, Sparkles, Users, Wand2,
} from 'lucide-react'
import { contentProductionApi } from '../api/contentProduction'
import { timeService } from '@/services/timeService'

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

// Forward canonical lifecycle order for the distribution bar + legend. Counts
// come from the backend's lifecycle_counts (same source as workspace tabs).
const STAGE_ORDER = [
  'idea', 'briefing', 'script', 'production', 'internal_review',
  'client_review', 'revision_required', 'approved', 'ready_to_publish', 'published',
]

const SEVERITY_STYLES = {
  high: 'border-l-red-500 bg-red-50/50 dark:border-[var(--color-app-border)] dark:bg-red-950/25',
  medium: 'border-l-amber-500 bg-amber-50/50 dark:border-[var(--color-app-border)] dark:bg-amber-950/25',
  low: 'border-l-cyan-500 bg-cyan-50/50 dark:border-[var(--color-app-border)] dark:bg-cyan-950/25',
}

function formatStatusLabel(status) {
  if (!status) return 'Unknown'
  return String(status).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function itemDueDate(item) {
  return item.deadline || item.due_date || null
}

// Backend-serialized rows carry `next_action` — display it verbatim; if an
// older payload omits it, fall back to the status label rather than guessing.
function rowNextAction(item) {
  return item.next_action || formatStatusLabel(item.status)
}

// ── Main Component ────────────────────────────────────────────────────────

export default function ContentOverview() {
  const { data: overviewData, isLoading, isError } = useQuery(
    ['content-overview-aggregate'],
    () => contentProductionApi.getOverview({ limit_per_queue: 8 }),
    { staleTime: 30 * 1000 }
  )

  const payload = overviewData?.data || {}
  const metrics = payload.metrics || {}
  const queues = payload.queues || {}
  const lifecycleCounts = payload.lifecycle_counts || {}
  const total = Number(metrics.total || 0)

  const distribution = useMemo(
    () => STAGE_ORDER.map((key) => ({
      key,
      count: Number(lifecycleCounts[key] || 0),
      color: STAGE_COLORS[key] || '#9CA3AF',
    })),
    [lifecycleCounts]
  )

  if (isLoading) return <LoadingSkeleton />

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-red-500" />
        <p className="mt-2 text-sm font-medium text-red-700">Failed to load content overview</p>
      </div>
    )
  }

  const isEmpty = total === 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Content Overview</h1>
        <p className="text-sm text-text-muted">What needs attention across the content pipeline — today.</p>
      </div>

      {/* Summary Cards — all backend metrics */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryCard label="Due Today" value={metrics.due_today || 0} icon={Calendar} colorClass="bg-amber-500/10 text-amber-600" linkTo="/content" />
        <SummaryCard label="Overdue" value={metrics.overdue || 0} icon={AlertTriangle} colorClass="bg-red-500/10 text-red-600" />
        <SummaryCard label="Internal Review" value={metrics.awaiting_internal_review || 0} icon={Eye} colorClass="bg-orange-500/10 text-orange-600" linkTo="/content?status=internal_review" />
        <SummaryCard label="Client Approval" value={metrics.awaiting_client_approval || 0} icon={Users} colorClass="bg-cyan-500/10 text-cyan-600" linkTo="/content?status=client_review" />
        <SummaryCard label="Revision Required" value={metrics.revision_required || 0} icon={RotateCcw} colorClass="bg-rose-500/10 text-rose-600" linkTo="/content?status=revision_required" />
        <SummaryCard label="Ready to Publish" value={metrics.ready_to_publish || 0} icon={Send} colorClass="bg-teal-500/10 text-teal-600" linkTo="/content?status=ready_to_publish" />
        <SummaryCard label="In Production" value={metrics.in_production || 0} icon={Sparkles} colorClass="bg-pink-500/10 text-pink-600" />
        <SummaryCard label="Total Content" value={total} icon={Layers} colorClass="bg-gray-500/10 text-gray-600" />
      </section>

      {isEmpty && (
        <div className="rounded-lg border border-dashed border-surface-border bg-surface-muted p-8 text-center dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)]">
          <CheckCircle2 className="mx-auto h-8 w-8 text-pink-400" />
          <p className="mt-2 text-sm font-medium text-text-primary">No content yet</p>
          <p className="mt-1 text-xs text-text-muted">
            Create your first content item in the Content workspace and its queues, workload, and pipeline will appear here.
          </p>
          <Link
            to="/content"
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-700"
          >
            Open Content Workspace <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main column — operational queues */}
        <div className="min-w-0 space-y-5">
          <QueueSection
            title="Due Today"
            queue={queues.due_today}
            viewAllLink="/content"
            renderRow={(item) => <ContentRow key={item.id} item={item} accent="border-l-amber-400 bg-amber-50/40 dark:border-l-amber-500 dark:bg-amber-950/20" />}
            emptyMessage="Nothing is due today."
          />

          <QueueSection
            title="Overdue"
            queue={queues.overdue}
            renderRow={(item) => <ContentRow key={item.id} item={item} accent="border-l-red-400 bg-red-50/40 dark:border-l-red-500 dark:bg-red-950/20" showOverdueBy />}
            emptyMessage="Nothing is overdue — the pipeline is on schedule."
          />

          <QueueSection
            title="Awaiting Internal Review"
            queue={queues.awaiting_internal_review}
            viewAllLink="/content?status=internal_review"
            renderRow={(item) => <ContentRow key={item.id} item={item} accent="border-l-orange-400 bg-orange-50/40 dark:border-l-orange-500 dark:bg-orange-950/20" showReviewer />}
            emptyMessage="Nothing is waiting for internal review."
          />

          <QueueSection
            title="Awaiting Client Approval"
            queue={queues.awaiting_client_approval}
            viewAllLink="/content?status=client_review"
            renderRow={(item) => <ContentRow key={item.id} item={item} accent="border-l-cyan-400 bg-cyan-50/40 dark:border-l-cyan-500 dark:bg-cyan-950/20" showWaiting />}
            emptyMessage="No content is currently waiting for client approval."
          />

          <QueueSection
            title="Revision Required"
            queue={queues.revision_required}
            viewAllLink="/content?status=revision_required"
            renderRow={(item) => <ContentRow key={item.id} item={item} accent="border-l-rose-400 bg-rose-50/40 dark:border-l-rose-500 dark:bg-rose-950/20" />}
            emptyMessage="No revisions are pending."
          />

          <QueueSection
            title="Ready to Publish"
            queue={queues.ready_to_publish}
            viewAllLink="/content?status=ready_to_publish"
            renderRow={(item) => <ContentRow key={item.id} item={item} accent="border-l-teal-400 bg-teal-50/40 dark:border-l-teal-500 dark:bg-teal-950/20" showPublishing />}
            emptyMessage="No content is waiting for Publishing."
          />
        </div>

        {/* Sidebar — pipeline, workload, shoots, recommendations */}
        <aside className="min-w-0 space-y-5">
          {/* Content Pipeline — same lifecycle counts as workspace tabs */}
          <section className="rounded-2xl border border-surface-border bg-surface p-4 shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
            <h3 className="text-sm font-semibold text-text-primary">Content Pipeline</h3>
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-muted dark:bg-[var(--color-app-surface-muted)]">
              {distribution.filter((e) => e.count > 0).map((entry) => (
                <div
                  key={entry.key}
                  title={`${formatStatusLabel(entry.key)}: ${entry.count}`}
                  style={{ width: `${total ? (entry.count / total) * 100 : 0}%`, backgroundColor: entry.color }}
                />
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              {distribution.map((entry) => (
                <Link
                  key={entry.key}
                  to={`/content?status=${entry.key}`}
                  className="flex items-center justify-between rounded px-1 py-0.5 text-xs text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary dark:hover:bg-[var(--color-app-surface-muted)]"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    {formatStatusLabel(entry.key)}
                  </span>
                  <span className="font-semibold text-text-primary tabular-nums">{entry.count}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Production Workload — real assignments, aggregated by backend */}
          <WorkloadSection workload={payload.production_workload || []} />

          {/* Upcoming Shoots — canonical production metadata */}
          <UpcomingShootsSection shoots={payload.upcoming_shoots || []} />

          {/* AI Recommendations — deterministic signals from backend */}
          <RecommendationsSection recommendations={payload.recommendations || []} />
        </aside>
      </div>
    </div>
  )
}

// ── Queue Section ─────────────────────────────────────────────────────────

function QueueSection({ title, queue, renderRow, viewAllLink, emptyMessage }) {
  const count = Number(queue?.count || 0)
  const items = queue?.items || []
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          {title}
          <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-text-muted tabular-nums dark:bg-[var(--color-app-surface-muted)]">{count}</span>
        </h3>
        {viewAllLink && count > 0 && (
          <Link to={viewAllLink} className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700">
            View all {count}
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {count === 0 ? (
        <p className="rounded-lg border border-dashed border-surface-border p-3 text-center text-xs text-text-muted dark:border-[var(--color-app-border)]">
          {emptyMessage}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map(renderRow)}
          {count > items.length && (
            <p className="text-center text-[11px] text-text-muted">
              + {count - items.length} more {viewAllLink ? '— use “View all” to see them in the workspace' : ''}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

// ── Production Workload ───────────────────────────────────────────────────

function WorkloadSection({ workload }) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-4 shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
      <h3 className="text-sm font-semibold text-text-primary">Production Workload</h3>
      {workload.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-surface-border p-3 text-center text-xs text-text-muted dark:border-[var(--color-app-border)]">
          No active content assignments.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {workload.map((bucket) => (
            <Link
              key={bucket.user_id || bucket.user_name || 'unassigned'}
              to={bucket.user_id ? `/content?owner_id=${bucket.user_id}` : '/content'}
              className="block rounded-lg border border-surface-border p-2.5 transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:hover:border-primary-400"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-text-primary">{bucket.user_name || 'Unassigned'}</span>
                <span className="shrink-0 text-xs font-semibold text-text-muted tabular-nums">
                  {bucket.assigned} active
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                {bucket.due_today > 0 && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{bucket.due_today} due today</span>}
                {bucket.overdue > 0 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-300">{bucket.overdue} overdue</span>}
                {bucket.in_production > 0 && <span className="rounded-full bg-pink-100 px-1.5 py-0.5 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">{bucket.in_production} in production</span>}
                {bucket.awaiting_revision > 0 && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{bucket.awaiting_revision} in revision</span>}
                {bucket.awaiting_review > 0 && <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">{bucket.awaiting_review} in review</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Upcoming Shoots ───────────────────────────────────────────────────────

function UpcomingShootsSection({ shoots }) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-4 shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <Camera className="h-4 w-4 text-pink-500" />
        Upcoming Shoots
      </h3>
      {shoots.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-surface-border p-3 text-center text-xs text-text-muted dark:border-[var(--color-app-border)]">
          No upcoming shoots are scheduled.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {shoots.map((shoot) => (
            <Link
              key={shoot.id}
              to={`/content/${shoot.id}`}
              className="block rounded-lg border border-surface-border p-2.5 transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:hover:border-primary-400"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-text-primary">{shoot.title}</span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-text-muted">
                  <Calendar className="h-3 w-3" />
                  {shoot.shoot?.date ? timeService.formatPattern(timeService.instant(shoot.shoot.date), 'MMM d') : '—'}
                  {shoot.shoot?.time && <span>· {shoot.shoot.time}</span>}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
                {shoot.shoot?.location && (
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{shoot.shoot.location}</span>
                )}
                {shoot.shoot?.team?.length > 0 && (
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{shoot.shoot.team.join(', ')}</span>
                )}
              </div>
              {shoot.shoot?.assets_required?.length > 0 && (
                <p className="mt-1 truncate text-[11px] text-text-muted">
                  <span className="font-semibold">Assets:</span> {shoot.shoot.assets_required.join(', ')}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ── AI Recommendations (deterministic backend signals) ────────────────────

function RecommendationsSection({ recommendations }) {
  return (
    <section className="rounded-2xl border border-surface-border bg-surface p-4 shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        AI Recommendations
      </h3>
      {recommendations.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-surface-border p-3 text-center text-xs text-text-muted dark:border-[var(--color-app-border)]">
          No recommendations — the pipeline looks healthy.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {recommendations.map((rec) => (
            <div
              key={rec.type}
              className={`rounded-lg border border-surface-border border-l-4 p-2.5 text-xs dark:border-[var(--color-app-border)] ${SEVERITY_STYLES[rec.severity] || 'border-l-gray-300'}`}
            >
              <p className="text-text-primary">{rec.message}</p>
              {rec.item_ids?.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {rec.item_ids.slice(0, 5).map((id) => (
                    <Link
                      key={id}
                      to={`/content/${id}`}
                      className="inline-flex items-center gap-0.5 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-text-muted transition hover:text-primary-600 dark:bg-[var(--color-app-surface-muted)]"
                    >
                      Open <Wand2 className="h-2.5 w-2.5" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Shared UI Components ──────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, colorClass, linkTo }) {
  const body = (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${colorClass}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase text-text-muted">{label}</p>
        <p className="mt-0.5 text-lg font-bold leading-tight text-text-primary tabular-nums">{value}</p>
      </div>
    </div>
  )
  const shell = 'block rounded-xl border border-surface-border bg-surface p-3 shadow-sm transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:hover:border-primary-400'
  return linkTo ? <Link to={linkTo} className={shell}>{body}</Link> : <div className={shell}>{body}</div>
}

// Compact row with content ID, client/project context, stage, owner, deadline
// and the backend-derived next action — enough to act without opening the item.
function ContentRow({ item, accent = 'border-l-gray-300 bg-surface-muted/40 dark:border-l-gray-600 dark:bg-[var(--color-app-surface-muted)]', showOverdueBy, showReviewer, showWaiting, showPublishing }) {
  const statusClass = STATUS_COLORS[item.status] || STATUS_COLORS.idea
  const dueRaw = itemDueDate(item)

  const waitingLabel = () => {
    if (showWaiting && item.client_review_at) {
      return `Waiting ${timeService.formatPattern(timeService.instant(item.client_review_at), 'MMM d')}`
    }
    if (showReviewer && item.internal_review_at) {
      return `In review since ${timeService.formatPattern(timeService.instant(item.internal_review_at), 'MMM d')}`
    }
    if (showOverdueBy && dueRaw) {
      return `Overdue since ${timeService.formatPattern(timeService.instant(dueRaw), 'MMM d')}`
    }
    if (showPublishing) {
      const pubStatus = item.publishing?.status
      if (pubStatus === 'scheduled') return 'Scheduled for publishing'
      if (pubStatus === 'failed') return 'Publishing error'
      return 'Waiting for Publishing'
    }
    return null
  }

  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border border-surface-border border-l-4 px-3 py-2.5 shadow-sm transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:hover:border-primary-400 ${accent}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {item.content_id && <span className="shrink-0 font-mono text-[11px] text-gray-400">{item.content_id}</span>}
          <Link to={`/content/${item.id}`} className="line-clamp-1 text-sm font-medium text-text-primary hover:text-primary-600">
            {item.title}
          </Link>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusClass}`}>
            {formatStatusLabel(item.status)}
          </span>
          {(item.client_name || item.project_name) && (
            <span className="truncate">{[item.client_name, item.project_name].filter(Boolean).join(' · ')}</span>
          )}
          {item.assignee_name && <span>· {item.assignee_name}</span>}
          {waitingLabel() && <span className="font-medium text-text-muted">· {waitingLabel()}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {dueRaw && (
          <span className="flex items-center justify-end gap-1 text-[11px] text-text-muted">
            <Clock className="h-3 w-3" />
            {timeService.formatPattern(timeService.instant(dueRaw), 'MMM d')}
          </span>
        )}
        <span className="mt-0.5 block text-[11px] font-semibold text-text-muted">
          {rowNextAction(item)}
        </span>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-48 animate-pulse rounded bg-surface-muted" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-muted" />)}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-muted" />)}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-surface-muted" />
      </div>
    </div>
  )
}
