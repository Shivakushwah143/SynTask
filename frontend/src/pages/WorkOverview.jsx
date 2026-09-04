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
} from 'lucide-react'
import { timeTrackingApi } from '../api/timeTracking'
import { useAuthStore } from '../store/authStore'
import { normalizeRole } from '../utils/roles'

// ── Status/Priority Colors ─────────────────────────────────────────────────

const STATUS_COLORS = {
  todo: 'bg-gray-100 text-gray-700',
  assigned: 'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-yellow-100 text-yellow-700',
  revision_required: 'bg-red-100 text-red-700',
  approved: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const PRIORITY_COLORS = {
  critical: 'text-red-600',
  high: 'text-orange-600',
  medium: 'text-amber-600',
  low: 'text-emerald-600',
}

const WORKLOAD_COLORS = {
  normal: 'bg-emerald-100 text-emerald-700',
  high: 'bg-orange-100 text-orange-700',
  overloaded: 'bg-red-100 text-red-700',
}

const SEVERITY_COLORS = {
  high: 'border-l-red-500 bg-red-50/50',
  medium: 'border-l-amber-500 bg-amber-50/50',
  low: 'border-l-blue-500 bg-blue-50/50',
}

// ── Helper Components ──────────────────────────────────────────────────────

function SummaryCard({ label, value, icon: Icon, color = 'text-primary-600', link }) {
  const content = (
    <div className="rounded-lg border border-surface-border bg-surface p-3 shadow-sm transition hover:border-primary-300">
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface px-3 py-2.5 shadow-sm transition hover:border-primary-300">
      <div className="min-w-0 flex-1">
        <Link to={actionHref || `/tasks/${task.id}`} className="text-sm font-medium text-text-primary hover:text-primary-600 line-clamp-1">
          {task.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-600'}`}>
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
    <div className="rounded-lg border border-dashed border-surface-border bg-surface-muted p-6 text-center">
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
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[nextAction.status] || 'bg-gray-100 text-gray-600'}`}>
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
      className={`block rounded-lg border border-surface-border border-l-4 p-3 shadow-sm transition hover:border-primary-300 ${SEVERITY_COLORS[item.severity] || 'border-l-gray-300'}`}
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
    <div className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface px-3 py-2.5 shadow-sm">
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
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${WORKLOAD_COLORS[member.workload_level] || 'bg-gray-100 text-gray-600'}`}>
        {member.workload_level}
      </span>
    </div>
  )
}

// ── Employee Work Overview ─────────────────────────────────────────────────

function EmployeeWorkOverview({ data }) {
  const summary = data.summary || {}
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

      {/* Needs Attention */}
      {data.needs_attention?.length > 0 && (
        <section>
          <SectionHeader title="Needs Attention" count={data.needs_attention.length} />
          <div className="space-y-2">
            {data.needs_attention.map((task) => (
              <TaskRow key={task.id} task={task} actionLabel="Open" actionHref={`/tasks/${task.id}`} />
            ))}
          </div>
        </section>
      )}

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
      {!data.next_action && (!data.needs_attention?.length) && (!(data.assigned_today || data.today)?.length) && (
        <EmptyState message="You&apos;re clear for now. Check upcoming work or take a break." />
      )}
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

      {/* Management Attention */}
      {data.management_attention?.length > 0 && (
        <section>
          <SectionHeader title="Management Attention" count={data.management_attention.length} />
          <div className="space-y-2">
            {data.management_attention.map((item, i) => (
              <AttentionItem key={`${item.type}-${i}`} item={item} />
            ))}
          </div>
        </section>
      )}

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
                className="block rounded-lg border border-surface-border border-l-4 border-l-red-500 bg-red-50/50 p-3 shadow-sm transition hover:border-primary-300"
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
              <div key={ext.id} className="rounded-lg border border-surface-border bg-surface p-3 shadow-sm">
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
      refetchOnWindowFocus: true,
      staleTime: 30000,
    }
  )

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

  if (isEmployee) {
    return <EmployeeWorkOverview data={data} />
  }

  return <ManagerWorkOverview data={data} />
}
