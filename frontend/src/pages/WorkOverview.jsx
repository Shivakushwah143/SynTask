/**
 * Work Overview — Phase 3
 *
 * Role-aware operational control center:
 * - Employee: My Work (what should I work on now?)
 * - Manager/Lead: Team Work (what needs my attention?)
 * - Admin/Super Admin: Business Work (company execution attention)
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Flame,
  GitPullRequest,
  Layers,
  Lock,
  Pause,
  Play,
  Square,
  TrendingUp,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  UserRound,
} from 'lucide-react'
import { timeTrackingApi } from '../api/timeTracking'
import { timeService } from '../services/timeService'
import { useAuthStore } from '../store/authStore'
import { normalizeRole } from '../utils/roles'

// ── Status/Priority Colors ─────────────────────────────────────────────────

const STATUS_COLORS = {
  todo: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  assigned: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200',
  in_review: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-200',
  revision_required: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-200',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200',
  completed: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-200',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

const PRIORITY_COLORS = {
  critical: 'text-red-600',
  high: 'text-orange-600',
  medium: 'text-amber-600',
  low: 'text-emerald-600',
}

const WORKLOAD_COLORS = {
  normal: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-200',
  overloaded: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-200',
}

const SEVERITY_COLORS = {
  high: 'border-l-red-500 bg-red-50/50 dark:border-[var(--color-app-border)] dark:bg-red-950/25',
  medium: 'border-l-amber-500 bg-amber-50/50 dark:border-[var(--color-app-border)] dark:bg-amber-950/25',
  low: 'border-l-blue-500 bg-blue-50/50 dark:border-[var(--color-app-border)] dark:bg-blue-950/25',
}

// ── Helper Components ──────────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, color = 'text-primary-600', link }) {
  const content = (
    <div className="rounded-lg border border-surface-border bg-surface p-3 shadow-sm transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:hover:border-primary-400">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 ${color}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-text-muted">{label}</p>
          <p className="mt-0.5 text-lg font-bold leading-tight text-text-primary">{value}</p>
        </div>
      </div>
    </div>
  )
  if (link) {
    return <Link to={link} className="block">{content}</Link>
  }
  return content
}

function TaskRow({ task, actionLabel, actionHref, showAssignee = false }) {
  const dueInfo = task.due_date
    ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface px-3 py-2.5 shadow-sm transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] dark:hover:border-primary-400">
      <div className="min-w-0 flex-1">
        <Link to={actionHref || `/tasks/${task.id}`} className="text-sm font-medium text-text-primary hover:text-primary-600 line-clamp-1">
          {task.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
            {(task.status || '').replace(/_/g, ' ')}
          </span>
          <span className={`font-medium ${PRIORITY_COLORS[task.priority] || 'text-gray-500'}`}>
            {task.priority}
          </span>
          {dueInfo && <span>Due {dueInfo}</span>}
          {showAssignee && task.assigned_to_name && <span className="text-text-muted">→ {task.assigned_to_name}</span>}
        </div>
      </div>
      {actionLabel && (
        <Link
          to={actionHref || `/tasks/${task.id}`}
          className="shrink-0 rounded-md bg-primary-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-600"
        >
          {actionLabel}
        </Link>
      )}
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

function EmptyState({ message }) {
  return (
    <div className="rounded-lg border border-dashed border-surface-border bg-surface-muted p-6 text-center dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)]">
      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
      <p className="mt-2 text-sm font-medium text-text-primary">{message}</p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-48 animate-pulse rounded bg-surface-muted" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-muted" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-lg bg-surface-muted" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-muted" />
        ))}
      </div>
    </div>
  )
}

// ── Next Action Card ───────────────────────────────────────────────────────

function NextActionCard({ nextAction }) {
  if (!nextAction) return null

  return (
    <section className="rounded-lg border-2 border-primary-200 bg-primary-50/50 p-4 shadow-sm dark:border-primary-700/50 dark:bg-primary-900/10">
      <div className="mb-2 flex items-center gap-2">
        <Flame className="h-4 w-4 text-primary-600" />
        <h3 className="text-sm font-semibold text-primary-700 dark:text-primary-300">Next Action</h3>
      </div>
      <Link to={`/tasks/${nextAction.task_id}`} className="group block">
        <p className="text-base font-bold text-text-primary group-hover:text-primary-600">{nextAction.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[nextAction.status] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
            {(nextAction.status || '').replace(/_/g, ' ')}
          </span>
          <span className={`font-medium ${PRIORITY_COLORS[nextAction.priority] || 'text-gray-500'}`}>
            {nextAction.priority} Priority
          </span>
          {nextAction.due_date && (
            <span>Due {new Date(nextAction.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          )}
        </div>
        {nextAction.reason && (
          <p className="mt-1.5 text-xs text-text-muted">Reason: {nextAction.reason}</p>
        )}
      </Link>
      <Link
        to={`/tasks/${nextAction.task_id}`}
        className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600"
      >
        {nextAction.action_label}
        <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  )
}

// ── Management Attention Item ──────────────────────────────────────────────

function AttentionItem({ item }) {
  const route = item.task_id ? `/tasks/${item.task_id}` : item.project_id ? `/projects/${item.project_id}` : '#'
  return (
    <Link
      to={route}
      className={`block rounded-lg border border-surface-border border-l-4 p-3 shadow-sm transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:hover:border-primary-400 ${SEVERITY_COLORS[item.severity] || 'border-l-gray-300 dark:bg-[var(--color-app-surface-muted)]'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary line-clamp-1">{item.title}</p>
          <p className="mt-0.5 text-xs text-text-muted">{item.reason}</p>
        </div>
        <span className="shrink-0 text-[10px] font-medium uppercase text-text-muted">{item.type?.replace(/_/g, ' ')}</span>
      </div>
    </Link>
  )
}

// ── Workload Row ───────────────────────────────────────────────────────────

function WorkloadRow({ member }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface px-3 py-2.5 shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{member.user_name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          <span>{member.active} active</span>
          {member.in_progress > 0 && <span>{member.in_progress} in progress</span>}
          {member.overdue > 0 && <span className="font-medium text-red-600">{member.overdue} overdue</span>}
          {member.due_today > 0 && <span>{member.due_today} due today</span>}
          {member.blocked > 0 && <span className="font-medium text-orange-600">{member.blocked} blocked</span>}
        </div>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${WORKLOAD_COLORS[member.workload_level] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
        {member.workload_level}
      </span>
    </div>
  )
}

// ── Employee Work Overview ─────────────────────────────────────────────────

function EmployeeWorkOverview({ data }) {
  const summary = data.summary || {}
  const needsAttentionTasks = data.needs_attention || []
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good Morning'
    if (hour < 17) return 'Good Afternoon'
    return 'Good Evening'
  }, [])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">{greeting}</h1>
        <p className="text-sm text-text-muted">Here&apos;s what needs your attention today.</p>
      </div>

      {/* Active Timer */}
      <ActiveTimerBar />

      {/* Summary Cards */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryCard label="Overdue" value={summary.overdue || 0} icon={AlertTriangle} color="text-red-600" link="/tasks?attention=overdue" />
        <SummaryCard label="Critical" value={summary.critical || 0} icon={Flame} color="text-orange-600" link="/tasks?attention=critical" />
        <SummaryCard label="Due Today" value={summary.due_today || 0} icon={Calendar} color="text-amber-600" link="/tasks?attention=due_today" />
        <SummaryCard label="In Progress" value={summary.in_progress || 0} icon={Layers} color="text-blue-600" link="/tasks?status=in_progress" />
      </section>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryCard label="Revision Required" value={summary.revision_required || 0} icon={GitPullRequest} color="text-red-600" link="/tasks?status=revision_required" />
        <SummaryCard label="Waiting for Review" value={summary.waiting_for_review || 0} icon={Eye} color="text-yellow-600" link="/tasks?status=in_review" />
        <SummaryCard label="Blocked" value={summary.blocked || 0} icon={Lock} color="text-orange-600" link="/tasks?attention=blocked" />
        <SummaryCard label="Upcoming" value={summary.upcoming || 0} icon={CalendarClock} color="text-emerald-600" />
      </section>

      {/* Main column keeps the current top-to-bottom sequence: Today's Tasks,
          Upcoming, Next Action, Waiting/Blocked, Reviews for You. */}
      <div className={needsAttentionTasks.length > 0 ? 'grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]' : ''}>
        <div className="min-w-0 space-y-5">
          {/* Today's Tasks - assigned today */}
          {(data.assigned_today || data.today)?.length > 0 && (
            <section>
              <SectionHeader title="Today's Tasks" count={(data.assigned_today || data.today).length} />
              <div className="space-y-2">
                {(data.assigned_today || data.today).map((task) => (
                  <TaskRow key={task.id} task={task} actionLabel="Open" actionHref={`/tasks/${task.id}`} />
                ))}
              </div>
            </section>
          )}

          {/* Upcoming deadlines - due in the next 7 days */}
          {data.upcoming?.length > 0 && (
            <section>
              <SectionHeader title="Upcoming Deadlines" count={data.upcoming.length} />
              <div className="space-y-2">
                {data.upcoming.map((task) => (
                  <TaskRow key={task.id} task={task} actionLabel="Open" actionHref={`/tasks/${task.id}`} />
                ))}
              </div>
            </section>
          )}

          {/* Next Action */}
          <NextActionCard nextAction={data.next_action} />

          {/* Waiting / Blocked */}
          {data.waiting_for_review?.length > 0 && (
            <section>
              <SectionHeader title="Waiting / Blocked" count={data.waiting_for_review.length} />
              <div className="space-y-2">
                {data.waiting_for_review.map((task) => (
                  <TaskRow key={task.id} task={task} actionLabel="View" actionHref={`/tasks/${task.id}`} />
                ))}
              </div>
            </section>
          )}

          {/* Reviews for You */}
          {data.reviews_for_me?.length > 0 && (
            <section>
              <SectionHeader title="Reviews for You" count={data.reviews_for_me.length} viewAllLink="/tasks?status=in_review" />
              <div className="space-y-2">
                {data.reviews_for_me.map((task) => (
                  <TaskRow key={task.id} task={task} actionLabel="Review" actionHref={`/tasks/${task.id}`} />
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {!data.next_action && (!(data.assigned_today || data.today)?.length) && (
            <EmptyState message="You&apos;re clear for now. Check upcoming work or take a break." />
          )}
        </div>

        {/* Needs Attention - compact right side panel */}
        {needsAttentionTasks.length > 0 && (
          <aside className="min-w-0 rounded-xl border border-red-200/70 bg-white/70 p-3 shadow-sm dark:border-red-900/40 dark:bg-gray-900/60 lg:sticky lg:top-4">
            <SectionHeader title="Needs Attention" count={needsAttentionTasks.length} />
            <div className="max-h-[440px] space-y-2 overflow-y-auto pr-1">
              {needsAttentionTasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

// ── Manager Work Overview ──────────────────────────────────────────────────

function ManagerWorkOverview({ data }) {
  const summary = data.summary || {}

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Team Work</h1>
        <p className="text-sm text-text-muted">What requires your team&apos;s attention right now.</p>
      </div>

      {/* Summary Cards */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryCard label="Active Work" value={summary.active || 0} icon={Layers} color="text-blue-600" link="/tasks" />
        <SummaryCard label="Overdue" value={summary.overdue || 0} icon={AlertTriangle} color="text-red-600" link="/tasks?attention=overdue" />
        <SummaryCard label="Critical" value={summary.critical || 0} icon={Flame} color="text-orange-600" link="/tasks?attention=critical" />
        <SummaryCard label="Due Today" value={summary.due_today || 0} icon={Calendar} color="text-amber-600" link="/tasks?attention=due_today" />
      </section>
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryCard label="Blocked" value={summary.blocked || 0} icon={Lock} color="text-orange-600" link="/tasks?attention=blocked" />
        <SummaryCard label="Awaiting Review" value={summary.awaiting_review || 0} icon={Eye} color="text-yellow-600" />
        <SummaryCard label="Revision Required" value={summary.revision_required || 0} icon={GitPullRequest} color="text-red-600" link="/tasks?status=revision_required" />
        <SummaryCard label="At-Risk Projects" value={summary.at_risk_projects || 0} icon={TrendingUp} color="text-red-600" link="/projects" />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Main column - existing top-to-bottom order preserved */}
        <div className="space-y-5">
          {/* My Review Queue */}
          {data.my_reviews?.length > 0 && (
        <section>
          <SectionHeader title="My Review Queue" count={data.my_reviews.length} viewAllLink="/tasks?status=in_review" />
          <div className="space-y-2">
            {data.my_reviews.map((task) => (
              <TaskRow key={task.id} task={task} actionLabel="Review" actionHref={`/tasks/${task.id}`} />
            ))}
          </div>
        </section>
      )}

      {/* Team Workload */}
      {data.team_workload?.length > 0 && (
        <section>
          <SectionHeader title="Team Workload" count={data.team_workload.length} />
          <div className="space-y-2">
            {data.team_workload.map((member) => (
              <WorkloadRow key={member.user_id} member={member} />
            ))}
          </div>
        </section>
      )}

      {/* Overdue / Blocked */}
      {data.overdue_tasks?.length > 0 && (
        <section>
          <SectionHeader title="Overdue Tasks" count={data.overdue_tasks.length} viewAllLink="/tasks?attention=overdue" />
          <div className="space-y-2">
            {data.overdue_tasks.map((task) => (
              <TaskRow key={task.id} task={task} actionLabel="Open" actionHref={`/tasks/${task.id}`} showAssignee />
            ))}
          </div>
        </section>
      )}

      {data.blocked_tasks?.length > 0 && (
        <section>
          <SectionHeader title="Blocked Tasks" count={data.blocked_tasks.length} />
          <div className="space-y-2">
            {data.blocked_tasks.map((task) => (
              <TaskRow key={task.id} task={task} actionLabel="Open" actionHref={`/tasks/${task.id}`} showAssignee />
            ))}
          </div>
        </section>
      )}

      {/* At-Risk Projects */}
      {data.at_risk_projects?.length > 0 && (
        <section>
          <SectionHeader title="At-Risk Projects" count={data.at_risk_projects.length} viewAllLink="/projects" />
          <div className="space-y-2">
            {data.at_risk_projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.project_id}/board`}
                className="block rounded-lg border border-surface-border border-l-4 border-l-red-500 bg-red-50/50 p-3 shadow-sm transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:bg-red-950/25 dark:hover:border-primary-400"
              >
                <p className="text-sm font-medium text-text-primary">{project.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                  <span>{project.completion_percentage}% complete</span>
                  <span>{project.overdue_task_count} overdue tasks</span>
                  <span>{project.total_open_tasks} open tasks</span>
                </div>
                {project.reasons?.length > 0 && (
                  <p className="mt-1 text-xs text-red-600">{project.reasons[0]}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Pending Extensions */}
      {data.pending_extensions?.length > 0 && (
        <section>
          <SectionHeader title="Pending Extensions" count={data.pending_extensions.length} />
          <div className="space-y-2">
            {data.pending_extensions.map((ext) => (
              <div key={ext.id} className="rounded-lg border border-surface-border bg-surface p-3 shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{ext.task_title}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {ext.employee_name} • Requested: {ext.requested_due_date ? new Date(ext.requested_due_date).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                  <Link to={`/tasks/${ext.task_id}`} className="shrink-0 rounded-md bg-primary-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-600">
                    Review
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

          {/* Empty State */}
          {(!data.management_attention?.length) && (!data.my_reviews?.length) && (!data.team_workload?.length) && (
            <EmptyState message="No operational issues detected. Team is running smoothly." />
          )}
        </div>

        {/* Management Attention - compact right side panel */}
        {data.management_attention?.length > 0 && (
          <aside className="rounded-2xl border border-surface-border bg-surface p-3 shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto">
            <SectionHeader title="Management Attention" count={data.management_attention.length} />
            <div className="space-y-2">
              {data.management_attention.map((item, i) => (
                <AttentionItem key={`${item.type}-${i}`} item={item} />
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

// ── Active Timer Bar ──────────────────────────────────────────────────────

function ActiveTimerBar() {
  const queryClient = useQueryClient()
  const [elapsed, setElapsed] = useState(0)

  const { data: timerData, isLoading } = useQuery(
    ['activeTimer'],
    async () => {
      const response = await timeTrackingApi.getActive()
      return response.data?.active_timer || null
    },
    { refetchOnWindowFocus: true, staleTime: 10000 }
  )

  const session = timerData
  const isRunning = session && session.status === 'running'
  const isPaused = session && session.status === 'paused'
  const isActive = isRunning || isPaused

  // Elapsed timer tick — use backend's elapsed_seconds and accumulate on tick
  useEffect(() => {
    if (!isActive) return
    // Start from the server-computed elapsed_seconds
    const baseSeconds = session?.elapsed_seconds || 0
    setElapsed(baseSeconds)
    if (!isRunning) return // paused: don't tick
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [isActive, isRunning, session?.elapsed_seconds])

  const formatElapsed = useCallback((totalSeconds) => {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }, [])

  const handlePause = useCallback(async () => {
    try {
      await timeTrackingApi.pause()
      toast.success('Timer paused')
      queryClient.invalidateQueries(['activeTimer'])
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to pause timer')
    }
  }, [queryClient])

  const handleResume = useCallback(async () => {
    try {
      await timeTrackingApi.resume()
      toast.success('Timer resumed')
      queryClient.invalidateQueries(['activeTimer'])
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to resume timer')
    }
  }, [queryClient])

  const handleStop = useCallback(async () => {
    try {
      await timeTrackingApi.stop()
      toast.success('Timer stopped')
      queryClient.invalidateQueries(['activeTimer'])
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to stop timer')
    }
  }, [queryClient])

  if (isLoading || !isActive) return null

  return (
    <section className="rounded-lg border border-primary-200 bg-primary-50/80 p-3 shadow-sm dark:border-primary-700/50 dark:bg-primary-900/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isRunning ? 'bg-emerald-100 text-emerald-600 animate-pulse' : 'bg-amber-100 text-amber-600'}`}>
            <Clock className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-text-muted">Active Timer</p>
            <p className="mt-0.5 truncate text-sm font-medium text-text-primary">
              {session.task_title || session.task_id || 'Working'}
              <span className="ml-2 text-text-muted">({isRunning ? 'Running' : 'Paused'})</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold tabular-nums text-text-primary">
            {formatElapsed(elapsed)}
          </span>
          <div className="flex gap-1">
            {isRunning && (
              <button
                type="button"
                onClick={handlePause}
                className="rounded-md bg-amber-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                aria-label="Pause timer"
              >
                <Pause className="h-3.5 w-3.5" />
              </button>
            )}
            {isPaused && (
              <button
                type="button"
                onClick={handleResume}
                className="rounded-md bg-emerald-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
                aria-label="Resume timer"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleStop}
              className="rounded-md bg-red-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-600"
              aria-label="Stop timer"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

const MONITORING_CONTROL_CLASS = 'h-10 w-full rounded-lg border border-surface-border bg-surface px-2.5 text-sm text-text-primary focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]'

const PERIOD_MODES = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['last_7_days', 'Last 7 days'],
  ['last_30_days', 'Last 30 days'],
  ['last_1_year', 'Last 1 year'],
  ['custom', 'Custom range'],
]

// Trailing windows counted back from today and inclusive of today, so "Last 7
// days" covers today plus the previous six dates.
const PERIOD_WINDOW_DAYS_BACK = { last_7_days: 6, last_30_days: 29, last_1_year: 364 }

const isRangePeriod = (mode) => mode !== 'today' && mode !== 'yesterday'

// Monitoring sends a calendar day, so resolve it in the supervisor's timezone
// instead of slicing a UTC instant (which drifts by a day near midnight).
const zonedDay = (value) => timeService.toZonedDateTimeInput(value).slice(0, 10)

function monitoringParams(filters) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
  return params.toString()
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

const attendanceStyle = {
  working: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
  on_break: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
  checked_out: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300',
  not_checked_in: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200',
  absent: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/30 dark:text-red-300',
}

// Due-date supervision buckets for an expanded employee's task list.
// A task is "near" when it is due within DUE_SOON_DAYS days (today included).
// Tone classes use solid accent bars and 100/50 tints: the app theme remaps
// many pastel utilities to the neutral surface palette, solid 500 shades and
// amber/red 50-100 shades render as authored in both light and dark mode.
const DUE_SOON_DAYS = 3
const CLOSED_TASK_STATUSES = new Set(['completed', 'cancelled'])

const DUE_TONES = {
  passed: { row: 'bg-red-50/60 dark:bg-red-950/25', bar: 'bg-red-500', badge: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200' },
  near: { row: 'bg-amber-50/60 dark:bg-amber-950/25', bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200' },
  far: { row: 'bg-surface dark:bg-[var(--color-app-surface)]', bar: 'bg-emerald-500', badge: 'bg-surface-muted text-text-muted dark:bg-[var(--color-app-surface-muted)]' },
  none: { row: 'bg-surface dark:bg-[var(--color-app-surface)]', bar: 'bg-slate-300 dark:bg-slate-600', badge: 'bg-surface-muted text-text-muted dark:bg-[var(--color-app-surface-muted)]' },
}

const _dayCount = (days) => `${days} day${Math.abs(days) === 1 ? '' : 's'}`

/**
 * Bucket a task due date as passed, near (<= DUE_SOON_DAYS), or far.
 * Closed tasks stay neutral — their due date is historical, not a risk.
 */
function dueDateState(dueDate, status) {
  if (!dueDate) return { tone: 'none', label: 'No due date' }
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return { tone: 'none', label: 'No due date' }
  const formatted = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (CLOSED_TASK_STATUSES.has(String(status || '').toLowerCase())) return { tone: 'none', label: `Closed · was due ${formatted}` }
  const dayStart = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round((dayStart(due) - dayStart(new Date())) / 86400000)
  if (days < 0) return { tone: 'passed', label: `Due date passed · ${_dayCount(days)} ago` }
  if (days === 0) return { tone: 'near', label: 'Due date near · today' }
  if (days <= DUE_SOON_DAYS) return { tone: 'near', label: `Due date near · in ${_dayCount(days)}` }
  return { tone: 'far', label: `Due date far · ${formatted}` }
}

// State the exact task scope, so a period-filtered list is never ambiguous.
function workScopeLabel(detail) {
  const start = detail.period?.start_date
  const end = detail.period?.end_date
  const window = !start || start === end ? `due ${start}` : `due ${start} – ${end}`
  const undated = detail.work?.scope?.undated_open || 0
  return `Tasks ${window}, plus overdue work.${undated ? ` ${undated} open task${undated === 1 ? '' : 's'} without a due date not shown.` : ''}`
}

function MonitoringTaskRow({ task }) {
  const state = dueDateState(task.due_date, task.status)
  const tone = DUE_TONES[state.tone] || DUE_TONES.none
  return <Link to={`/tasks/${task.task_id}`} className={`flex items-center gap-3 rounded-lg border border-surface-border px-3 py-2.5 transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:hover:border-primary-400 ${tone.row}`}><span className={`h-8 w-1 shrink-0 rounded-full ${tone.bar}`} aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-text-primary">{task.title}</p><p className="mt-0.5 text-xs text-text-muted">{task.project_name || 'No project'} · {task.status.replace(/_/g, ' ')}</p></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.badge}`}>{state.label}</span></Link>
}

function MonitoringStat({ label, value, tone = 'text-text-primary' }) {
  return <div className="min-w-[92px] rounded-lg bg-surface-muted px-3 py-2 dark:bg-[var(--color-app-surface-muted)]"><p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</p><p className={`mt-0.5 text-lg font-bold tabular-nums ${tone}`}>{value}</p></div>
}

function MonitoringDetails({ employee, filters }) {
  const [tab, setTab] = useState('work')
  const [timelinePage, setTimelinePage] = useState(1)
  const period = filters.date ? { date: filters.date } : { start_date: filters.start_date, end_date: filters.end_date }
  const query = monitoringParams(period)
  const detailQuery = useQuery(['workMonitoringDetail', employee.user_id, query], async () => {
    const response = await fetch(`/api/v1/work/overview/monitoring/employees/${employee.user_id}?${query}`, { credentials: 'include' })
    if (!response.ok) throw new Error('Unable to load employee monitoring')
    return response.json()
  }, { staleTime: 30000 })
  const timelineQuery = useQuery(['workMonitoringTimeline', employee.user_id, query, timelinePage], async () => {
    const response = await fetch(`/api/v1/work/overview/monitoring/employees/${employee.user_id}/timeline?${query}&page=${timelinePage}`, { credentials: 'include' })
    if (!response.ok) throw new Error('Unable to load activity')
    return response.json()
  }, { enabled: tab === 'activity', staleTime: 30000 })
  if (detailQuery.isLoading) return <div className="border-t border-surface-border bg-surface-muted/50 px-5 py-6 text-sm text-text-muted dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)]">Loading employee monitoring…</div>
  if (detailQuery.error) return <div className="border-t border-surface-border px-5 py-5 text-sm text-red-600">Employee detail is temporarily unavailable. <button type="button" className="underline" onClick={() => detailQuery.refetch()}>Retry</button></div>
  const detail = detailQuery.data
  const tabs = [['work', 'Work'], ['attendance', 'Attendance'], ['time', 'Time'], ['daily', 'Daily Update'], ['activity', 'Activity']]
  return <div className="border-t border-surface-border bg-slate-50/70 px-4 py-4 dark:border-[var(--color-app-border)] dark:bg-slate-950/25 sm:px-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-text-primary">{employee.identity.name}</p><p className="text-xs text-text-muted">{detail.period.start_date === detail.period.end_date ? detail.period.start_date : `${detail.period.start_date} – ${detail.period.end_date}`}</p></div></div>
    <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Employee monitoring sections">{tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary-500 ${tab === id ? 'bg-primary-600 text-white' : 'text-text-muted hover:bg-surface hover:text-text-primary'}`}>{label}</button>)}</div>
    {tab === 'attendance' && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(detail.attendance).filter(([key]) => !['mode', 'breaks'].includes(key)).map(([key, value]) => <div key={key} className="rounded-lg bg-surface p-3 text-sm dark:bg-[var(--color-app-surface)]"><p className="text-[10px] font-semibold uppercase text-text-muted">{key.replace(/_/g, ' ')}</p><p className="mt-1 font-medium capitalize text-text-primary">{key.includes('seconds') ? formatDuration(value) : value === null ? '—' : String(value).replace(/_/g, ' ')}</p></div>)}</div>}
    {tab === 'work' && <div className="space-y-2"><p className="text-xs text-text-muted">{workScopeLabel(detail)}</p>{detail.work.tasks.length ? detail.work.tasks.map(task => <MonitoringTaskRow key={task.task_id} task={task} />) : <p className="text-sm text-text-muted">No tasks are due in this period and nothing is overdue.</p>}</div>}
    {tab === 'time' && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(detail.time_tracking).filter(([key]) => key !== 'distribution').map(([key, value]) => <div key={key} className="rounded-lg bg-surface p-3 dark:bg-[var(--color-app-surface)]"><p className="text-[10px] font-semibold uppercase text-text-muted">{key.replace(/_/g, ' ')}</p><p className="mt-1 text-sm font-semibold text-text-primary">{formatDuration(value)}</p></div>)}</div>}
    {tab === 'daily' && <div className="rounded-lg bg-surface p-4 dark:bg-[var(--color-app-surface)]"><p className="text-sm font-semibold capitalize text-text-primary">Daily update: {detail.daily_update.status}</p>{detail.daily_update.worked_on?.length ? <div className="mt-2 space-y-1 text-sm text-text-muted">{detail.daily_update.worked_on.map(item => <p key={item}>{item}</p>)}</div> : <p className="mt-2 text-sm text-text-muted">No daily update was submitted for this period.</p>}</div>}
    {tab === 'activity' && <div className="space-y-2">{timelineQuery.isLoading ? <p className="text-sm text-text-muted">Loading activity…</p> : timelineQuery.data?.events?.length ? timelineQuery.data.events.map(event => <div key={event.event_id} className="rounded-lg bg-surface px-3 py-2.5 dark:bg-[var(--color-app-surface)]"><p className="text-sm font-medium text-text-primary">{event.title}</p><p className="mt-0.5 text-xs text-text-muted">{event.timestamp ? new Date(event.timestamp).toLocaleString() : ''}{event.description ? ` · ${event.description}` : ''}</p></div>) : <p className="text-sm text-text-muted">No recorded work activity for this period.</p>}</div>}
  </div>
}

function SupervisoryWorkOverview() {
  const [filters, setFilters] = useState({ date: 'today', start_date: '', end_date: '', department_id: '', designation: '', employee_id: '', manager_id: '', attendance_status: '', work_status: '', task_health: '', project_id: '', search: '' })
  const [periodMode, setPeriodMode] = useState('today')
  const [expanded, setExpanded] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const filterQuery = monitoringParams(filters)
  const optionsQuery = useQuery(['workMonitoringFilters'], async () => { const response = await fetch('/api/v1/work/overview/monitoring/filters', { credentials: 'include' }); if (!response.ok) throw new Error('Unable to load monitoring filters'); return response.json() }, { staleTime: 300000 })
  const overviewQuery = useQuery(['workMonitoringOverview', filterQuery], async () => { const response = await fetch(`/api/v1/work/overview/monitoring?${filterQuery}`, { credentials: 'include' }); if (!response.ok) throw new Error('Unable to load work overview'); return response.json() }, { staleTime: 30000, refetchInterval: filters.date === 'today' ? 45000 : false })
  const update = (key, value) => setFilters(current => ({ ...current, [key]: value }))
  // The backend takes either a single day or a start/end range, never both, so
  // switching modes clears the other one. A cleared range field falls back to
  // its partner, which keeps the range valid without a blocking validation step.
  // Editing either bound makes the window a custom range, so the Period label
  // never claims a preset that no longer matches the dates on screen.
  const updateRange = (key, value) => setFilters(current => {
    setPeriodMode('custom')
    const partner = key === 'start_date' ? current.end_date : current.start_date
    const next = { ...current, date: '', [key]: value || partner || zonedDay(timeService.now()) }
    if (next.start_date > next.end_date) {
      if (key === 'start_date') next.end_date = next.start_date
      else next.start_date = next.end_date
    }
    return next
  })
  const changePeriod = (mode) => {
    setPeriodMode(mode)
    const now = timeService.now()
    const daysBack = PERIOD_WINDOW_DAYS_BACK[mode]
    if (mode === 'custom' || daysBack !== undefined) {
      const today = zonedDay(now)
      const start = daysBack === undefined
        ? zonedDay(timeService.addDays(now, -6))
        : zonedDay(timeService.addDays(now, -daysBack))
      const keepExisting = mode === 'custom'
      setFilters(current => ({ ...current, date: '', start_date: keepExisting ? current.start_date || start : start, end_date: keepExisting ? current.end_date || today : today }))
      return
    }
    setFilters(current => ({ ...current, date: mode === 'today' ? 'today' : zonedDay(timeService.addDays(now, -1)), start_date: '', end_date: '' }))
  }
  const reset = () => { setPeriodMode('today'); setFilters({ date: 'today', start_date: '', end_date: '', department_id: '', designation: '', employee_id: '', manager_id: '', attendance_status: '', work_status: '', task_health: '', project_id: '', search: '' }) }
  const options = optionsQuery.data || {}
  const select = (label, key, items = []) => <label className="min-w-[130px] flex-1 text-xs font-medium text-text-muted sm:flex-none"><span className="sr-only">{label}</span><select value={filters[key]} onChange={event => update(key, event.target.value)} className={MONITORING_CONTROL_CLASS}><option value="">{label}: All</option>{items.map(item => <option key={item.id || item} value={item.id || item}>{item.name || item.replace?.(/_/g, ' ') || item}</option>)}</select></label>
  const periodControl = <><label className="min-w-[130px] flex-1 text-xs font-medium text-text-muted sm:flex-none"><span className="sr-only">Period</span><select value={periodMode} onChange={event => changePeriod(event.target.value)} className={MONITORING_CONTROL_CLASS}>{PERIOD_MODES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>{isRangePeriod(periodMode) && <><label className="min-w-[150px] flex-1 text-xs font-medium text-text-muted sm:flex-none"><span className="sr-only">From date</span><input type="date" value={filters.start_date} max={filters.end_date || undefined} onChange={event => updateRange('start_date', event.target.value)} className={MONITORING_CONTROL_CLASS} aria-label="From date" /></label><label className="min-w-[150px] flex-1 text-xs font-medium text-text-muted sm:flex-none"><span className="sr-only">To date</span><input type="date" value={filters.end_date} min={filters.start_date || undefined} onChange={event => updateRange('end_date', event.target.value)} className={MONITORING_CONTROL_CLASS} aria-label="To date" /></label></>}</>
  if (overviewQuery.isLoading) return <LoadingSkeleton />
  if (overviewQuery.error) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700"><AlertTriangle className="mx-auto mb-2 h-5 w-5" />Unable to load Work Overview. <button type="button" className="underline" onClick={() => overviewQuery.refetch()}>Retry</button></div>
  const data = overviewQuery.data
  return <main className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight text-text-primary">Work Overview</h1><p className="mt-1 text-sm text-text-muted">Monitor authorized employees, attendance, current work, and operational evidence.</p></div><button type="button" onClick={() => overviewQuery.refetch()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-surface-border bg-surface px-3 text-sm font-medium text-text-primary transition hover:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]"><RefreshCw className="h-4 w-4" />Refresh</button></header>
    <section className="rounded-xl border border-surface-border bg-surface p-3 shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]"><div className="flex flex-wrap gap-2">{optionsQuery.isError && <p className="flex w-full items-center gap-1.5 text-xs font-medium text-red-600"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />Filter options are unavailable, so only Period can be selected. <button type="button" className="underline" onClick={() => optionsQuery.refetch()}>Retry</button></p>}{periodControl}{select('Department', 'department_id', options.departments)}{select('Employee', 'employee_id', options.employees)}{select('Attendance', 'attendance_status', options.attendance_statuses)}{select('Work status', 'work_status', options.work_statuses)}{select('Task health', 'task_health', options.task_health_options)}<label className="relative min-w-[190px] flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-text-muted" /><input value={filters.search} onChange={event => update('search', event.target.value)} placeholder="Search employee or code" className="h-10 w-full rounded-lg border border-surface-border bg-surface pl-9 pr-3 text-sm text-text-primary focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]" /></label><button type="button" onClick={reset} className="h-10 px-2 text-sm font-medium text-primary-600 hover:text-primary-700">Reset</button></div></section>
    <section aria-label="Monitoring summary" className="flex gap-2 overflow-x-auto pb-1"><MonitoringStat label="Employees" value={data.summary.total_employees} /><MonitoringStat label="Working" value={data.summary.working} tone="text-emerald-700 dark:text-emerald-300" /><MonitoringStat label="On break" value={data.summary.on_break} tone="text-amber-700 dark:text-amber-300" /><MonitoringStat label="Not checked in" value={data.summary.not_checked_in} /><MonitoringStat label="Overdue work" value={data.summary.employees_with_overdue_work} tone="text-red-700 dark:text-red-300" /><MonitoringStat label="EOD missing" value={data.summary.eod_missing} tone="text-amber-700 dark:text-amber-300" /></section>
    {data.departments.length ? data.departments.map(group => { const isCollapsed = collapsed[group.department.name]; return <section key={group.department.name} className="overflow-hidden rounded-xl border border-surface-border bg-surface shadow-sm dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]"><button type="button" onClick={() => setCollapsed(current => ({ ...current, [group.department.name]: !isCollapsed }))} className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-surface-border bg-surface-muted/55 px-4 py-3 text-left transition hover:bg-surface-muted dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface-muted)]" aria-expanded={!isCollapsed}><div><p className="text-sm font-bold text-text-primary">{group.department.name}</p><p className="mt-0.5 text-xs text-text-muted">{group.summary.total_employees} employees · {group.summary.working} working · {group.summary.employees_with_overdue_work} overdue</p></div>{isCollapsed ? <ChevronDown className="h-5 w-5 text-text-muted" /> : <ChevronUp className="h-5 w-5 text-text-muted" />}</button>{!isCollapsed && <div>{group.employees.map(employee => <div key={employee.user_id}><div className="grid gap-3 px-4 py-3 transition hover:bg-surface-muted/50 md:grid-cols-[minmax(180px,1.1fr)_140px_minmax(160px,1fr)_minmax(170px,1fr)_auto] md:items-center"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300"><UserRound className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold text-text-primary">{employee.identity.name}</p><p className="truncate text-xs text-text-muted">{employee.identity.designation}{employee.identity.employee_code ? ` · ${employee.identity.employee_code}` : ''}</p></div></div><div><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${attendanceStyle[employee.attendance.status] || attendanceStyle.not_checked_in}`}>{employee.attendance.status.replace(/_/g, ' ')}</span><p className="mt-1 text-xs text-text-muted">{formatDuration(employee.attendance.worked_seconds)} worked</p></div><div className="min-w-0"><p className="truncate text-sm text-text-primary">{employee.current_work.task_title || 'No active work detected'}</p><p className="truncate text-xs text-text-muted">{employee.current_work.project_name || 'No current project'}</p></div><div className="flex flex-wrap gap-1.5 text-xs"><span className="rounded bg-blue-50 px-1.5 py-1 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">{employee.workload.active} active</span>{employee.workload.overdue > 0 && <span className="rounded bg-red-50 px-1.5 py-1 text-red-700 dark:bg-red-950/30 dark:text-red-300">{employee.workload.overdue} overdue</span>}{employee.attention.slice(0, 1).map(item => <span key={item.type} className="rounded bg-amber-50 px-1.5 py-1 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{item.label}</span>)}</div><button type="button" onClick={() => setExpanded(current => current === employee.user_id ? null : employee.user_id)} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-surface-border px-2.5 text-xs font-semibold text-text-primary hover:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-[var(--color-app-border)]" aria-expanded={expanded === employee.user_id}>{expanded === employee.user_id ? 'Collapse' : 'Expand'} {expanded === employee.user_id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button></div>{expanded === employee.user_id && <MonitoringDetails employee={employee} filters={filters} />}</div>)}</div>}</section> }) : <EmptyState message="No employees match the selected monitoring filters." />}
  </main>
}

export default function WorkOverview() {
  const { user } = useAuthStore()
  const userRole = normalizeRole(user?.role)
  const isEmployee = userRole === 'employee'

  const { data, isLoading, error } = useQuery(
    ['workOverview'],
    async () => {
      const response = await fetch('/api/v1/work/overview', {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to load work overview')
      return response.json()
    },
    {
      enabled: isEmployee,
      refetchOnWindowFocus: true,
      staleTime: 30000,
    }
  )

  if (!isEmployee) return <SupervisoryWorkOverview />
  if (isLoading) return <LoadingSkeleton />
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-red-500" />
        <p className="mt-2 text-sm font-medium text-red-700">Failed to load work overview</p>
        <p className="mt-1 text-xs text-red-600">{error.message}</p>
      </div>
    )
  }

  if (!data) return <EmptyState message="No data available." />

  return <EmployeeWorkOverview data={data} />
}
