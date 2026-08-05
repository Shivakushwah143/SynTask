/* eslint-disable react-refresh/only-export-components */
import { format } from 'date-fns'
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  Link2,
  Loader2,
  Mail,
  Pencil,
  PhoneCall,
  Plus,
  Repeat2,
  Trash2,
  UserRound,
  Video,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Button, EmptyState, Modal, Skeleton, inputClassName } from '../../../components/ui'
import { CRMEmptyState, CRMSection, CRMStatCard } from '../../../components/crm'
import { timeService } from '@/services/timeService'

export const ACTIVITY_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'task', label: 'Task' },
  { value: 'email', label: 'Email' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'note', label: 'Note' },
  { value: 'file', label: 'File' },
  { value: 'pipeline_change', label: 'Pipeline change' },
]

export const ACTIVITY_STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const ACTIVITY_PRIORITY_OPTIONS = [
  { value: '', label: 'Any priority' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

export const ACTIVITY_DATE_OPTIONS = [
  { value: 'all', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
]

const ACTIVITY_ICONS = {
  call: PhoneCall,
  meeting: Video,
  task: CheckCircle2,
  email: Mail,
  reminder: Bell,
  follow_up: Repeat2,
  note: FileText,
  file: FileText,
  pipeline_change: ArrowRight,
}

export function getActivityIcon(activityType) {
  return ACTIVITY_ICONS[activityType] || Clock3
}

export function getActivityLabel(activityType) {
  const option = ACTIVITY_TYPE_OPTIONS.find((item) => item.value === activityType)
  return option?.label || activityType || 'Activity'
}

export function formatActivityDate(value) {
  if (!value) return 'Soon'
  try {
    return timeService.formatPattern(value, 'MMM d, yyyy - h:mm a')
  } catch {
    return String(value)
  }
}

export function formatActivityDay(value) {
  if (!value) return 'Recent'
  try {
    return timeService.formatPattern(value, 'EEEE, MMM d, yyyy')
  } catch {
    return String(value)
  }
}

export function getActivityTone(activity) {
  if (activity.status === 'completed') return 'completed'
  if (activity.status === 'scheduled') return 'scheduled'
  if (activity.status === 'in_progress') return 'in_progress'
  if (activity.status === 'cancelled') return 'cancelled'
  if (activity.priority === 'urgent') return 'critical'
  if (activity.priority === 'high') return 'high'
  if (activity.priority === 'low') return 'low'
  return 'draft'
}

export function isTaskDueToday(task) {
  if (!task?.due_date) return false
  const date = timeService.instant(task.due_date)
  if (Number.isNaN(date.getTime())) return false
  return timeService.toZonedDateOnly(date) === timeService.toZonedDateOnly(timeService.now())
}

export function isTaskOverdue(task) {
  if (!task?.due_date) return false
  const date = timeService.instant(task.due_date)
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() < timeService.now().getTime() && String(task.status || '').toLowerCase() !== 'completed'
}

export function isTaskUpcoming(task) {
  if (!task?.due_date) return false
  const date = timeService.instant(task.due_date)
  if (Number.isNaN(date.getTime())) return false
  const nowMs = timeService.nowMs()
  const inSevenDaysMs = nowMs + 7 * 24 * 60 * 60 * 1000
  return date.getTime() > nowMs && date.getTime() <= inSevenDaysMs
}

function getPriorityTone(priority) {
  if (priority === 'urgent') return 'critical'
  return priority || 'draft'
}

export function ActivityStatRow({ summary = {} }) {
  const cards = [
    { label: 'Total', value: String(summary.total || 0), tone: 'blue' },
    { label: 'Completed', value: String(summary.completed || 0), tone: 'emerald' },
    { label: 'Scheduled', value: String(summary.scheduled || 0), tone: 'amber' },
    { label: 'Overdue', value: String(summary.overdue || 0), tone: 'slate' },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <CRMStatCard key={card.label} icon={Clock3} label={card.label} value={card.value} tone={card.tone} />
      ))}
    </div>
  )
}

export function ActivityFilters({
  searchValue,
  onSearchChange,
  typeValue,
  onTypeChange,
  ownerValue,
  onOwnerChange,
  statusValue,
  onStatusChange,
  priorityValue,
  onPriorityChange,
  dateValue,
  onDateChange,
  ownerOptions = [],
}) {
  return (
    <CRMSection title="Filters" description="Search and segment the activity hub.">
      <div className="grid gap-3 xl:grid-cols-2">
        <label className="relative block">
          <span className="sr-only">Search activities</span>
          <input
            className="input input-sm pl-4"
            placeholder="Search by title, entity, owner or description"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <select className="input input-sm" value={typeValue} onChange={(event) => onTypeChange(event.target.value)}>
            {ACTIVITY_TYPE_OPTIONS.map((option) => (
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select className="input input-sm" value={ownerValue} onChange={(event) => onOwnerChange(event.target.value)}>
            <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All owners</option>
            {ownerOptions.map((option) => (
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select className="input input-sm" value={statusValue} onChange={(event) => onStatusChange(event.target.value)}>
            {ACTIVITY_STATUS_OPTIONS.map((option) => (
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={option.value || 'status-all'} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select className="input input-sm" value={priorityValue} onChange={(event) => onPriorityChange(event.target.value)}>
            {ACTIVITY_PRIORITY_OPTIONS.map((option) => (
              <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={option.value || 'priority-all'} value={option.value}>{option.label}</option>
            ))}
          </select>
          <select className="input input-sm" value={dateValue} onChange={(event) => onDateChange(event.target.value)}>
            {ACTIVITY_DATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
    </CRMSection>
  )
}

export function ActivityComposer({
  form,
  onChange,
  onSubmit,
  isSubmitting = false,
  isEditing = false,
  entitySummary,
  entityOptions = [],
}) {
  return (
    <CRMSection
      title={isEditing ? 'Edit activity' : 'Log activity'}
      description="Capture calls, meetings, tasks, emails, reminders and follow-ups without leaving the CRM."
      actions={entitySummary ? <Badge label={entitySummary} colorKey="draft" /> : null}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Activity type</span>
          <select className={inputClassName} value={form.activity_type} onChange={(event) => onChange('activity_type', event.target.value)}>
            {ACTIVITY_TYPE_OPTIONS.filter((option) => option.value).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Entity type</span>
          <select className={inputClassName} value={form.entity_type} onChange={(event) => onChange('entity_type', event.target.value)}>
            <option value="lead">Lead</option>
            <option value="company">Company</option>
            <option value="contact">Contact</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Entity</span>
          <input
            className={inputClassName}
            list="crm-activity-entity-options"
            placeholder="Lead, company or contact identifier"
            value={form.entity_id}
            onChange={(event) => onChange('entity_id', event.target.value)}
          />
          <datalist id="crm-activity-entity-options">
            {entityOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </datalist>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Owner</span>
          <input
            className={inputClassName}
            placeholder="Optional owner user id"
            value={form.owner_id}
            onChange={(event) => onChange('owner_id', event.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Title</span>
          <input
            className={inputClassName}
            placeholder="Follow-up call"
            value={form.title}
            onChange={(event) => onChange('title', event.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Status</span>
          <select className={inputClassName} value={form.status} onChange={(event) => onChange('status', event.target.value)}>
            {ACTIVITY_STATUS_OPTIONS.filter((option) => option.value).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Description</span>
          <textarea
            className={`${inputClassName} min-h-28`}
            placeholder="Capture the context for this activity..."
            value={form.description}
            onChange={(event) => onChange('description', event.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Priority</span>
          <select className={inputClassName} value={form.priority} onChange={(event) => onChange('priority', event.target.value)}>
            {ACTIVITY_PRIORITY_OPTIONS.filter((option) => option.value).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Due date</span>
          <input className={inputClassName} type="datetime-local" value={form.due_date} onChange={(event) => onChange('due_date', event.target.value)} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Scheduled for</span>
          <input className={inputClassName} type="datetime-local" value={form.scheduled_at} onChange={(event) => onChange('scheduled_at', event.target.value)} />
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Metadata JSON</span>
          <textarea
            className={`${inputClassName} min-h-24 font-mono text-sm`}
            placeholder='{"channel":"phone"}'
            value={form.metadata}
            onChange={(event) => onChange('metadata', event.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="primary" onClick={onSubmit} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {isEditing ? 'Save activity' : 'Create activity'}
        </Button>
      </div>
    </CRMSection>
  )
}

export function ActivityCard({ activity, onEdit, onDelete, onComplete, onSnooze }) {
  const Icon = getActivityIcon(activity.activity_type)
  const isDirect = activity.source === 'direct'
  const canSnooze = activity.activity_type === 'follow_up' || activity.activity_type === 'reminder' || activity.activity_type === 'task'
  const entityHref = activity.entity_type === 'lead'
    ? `/crm/leads/${activity.entity_id}`
    : activity.entity_type === 'company'
      ? `/crm/companies/${activity.entity_id}`
      : '/crm/contacts'

  return (
    <article className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-4">
        <div className="mt-1 rounded-2xl border border-surface-border/80 bg-gradient-to-br from-primary-50 to-white p-3 text-primary-600 dark:border-gray-800 dark:from-primary-950/50 dark:to-gray-900 dark:text-primary-300">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{activity.title}</h3>
            <Badge label={getActivityLabel(activity.activity_type)} colorKey="draft" />
            <Badge label={activity.status || 'draft'} colorKey={getActivityTone(activity)} />
            {activity.priority ? <Badge label={activity.priority} colorKey={getPriorityTone(activity.priority)} /> : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{activity.description || 'No description provided.'}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              {activity.owner_name || 'Unassigned'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" />
              {formatActivityDate(activity.timestamp)}
            </span>
            <Link className="inline-flex items-center gap-1.5 font-medium text-primary-700 hover:underline dark:text-primary-300" to={entityHref}>
              <Link2 className="h-3.5 w-3.5" />
              {activity.entity_label || activity.entity_id}
            </Link>
          </div>
          {activity.due_date || activity.scheduled_at || activity.completed_at ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {activity.due_date ? <Badge label={`Due ${formatActivityDate(activity.due_date)}`} colorKey="draft" /> : null}
              {activity.scheduled_at ? <Badge label={`Scheduled ${formatActivityDate(activity.scheduled_at)}`} colorKey="draft" /> : null}
              {activity.completed_at ? <Badge label={`Completed ${formatActivityDate(activity.completed_at)}`} colorKey="completed" /> : null}
            </div>
          ) : null}
          {activity.metadata && Object.keys(activity.metadata).length ? (
            <pre className="mt-4 overflow-x-auto rounded-2xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-950 dark:text-gray-300">
              {JSON.stringify(activity.metadata, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>

      {isDirect ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => onComplete?.(activity)}>
            <CheckCircle2 className="h-4 w-4" />
            Complete
          </Button>
          {canSnooze ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => onSnooze?.(activity)}>
              <Clock3 className="h-4 w-4" />
              Snooze 1 day
            </Button>
          ) : null}
          <Button type="button" variant="secondary" size="sm" onClick={() => onEdit?.(activity)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onDelete?.(activity)}>
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      ) : null}
    </article>
  )
}

export function ActivityFeed({
  groupedByDay = [],
  isLoading = false,
  errorMessage = '',
  onRetry,
  onEdit,
  onDelete,
  onComplete,
  onSnooze,
  emptyTitle = 'No activities yet',
  emptyDescription = 'Create the first CRM activity to start building the workspace timeline.',
}) {
  if (isLoading) {
    return (
      <CRMSection title="Activity feed" description="Loading CRM activities.">
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="rounded-3xl border border-surface-border/80 p-4 dark:border-gray-800">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-3 h-4 w-3/4" />
              <Skeleton className="mt-3 h-20 w-full" />
            </div>
          ))}
        </div>
      </CRMSection>
    )
  }

  if (errorMessage) {
    return (
      <CRMSection title="Activity feed" description="Could not load activities.">
        <EmptyState
          icon={FileText}
          title="Activities unavailable"
          description={errorMessage}
          action={(
            <Button type="button" variant="primary" onClick={onRetry}>
              Retry
            </Button>
          )}
        />
      </CRMSection>
    )
  }

  if (!groupedByDay.length) {
    return (
      <CRMSection title="Activity feed" description="Nothing matched the current filters.">
        <CRMEmptyState
          icon={Clock3}
          title={emptyTitle}
          description={emptyDescription}
        />
      </CRMSection>
    )
  }

  return (
    <CRMSection title="Activity feed" description="Chronological CRM activity grouped by day.">
      <div className="space-y-6">
        {groupedByDay.map((group) => (
          <section key={group.date} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
              <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">
                {formatActivityDay(group.date)}
              </h3>
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            </div>
            <div className="space-y-3">
              {group.items.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onComplete={onComplete}
                  onSnooze={onSnooze}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </CRMSection>
  )
}

export function ActivitySidePanel({ summary = {}, ownerOptions = [], activeEntity, quickLinks = [] }) {
  return (
    <div className="space-y-6">
      <CRMSection title="Summary" description="Live counts from the CRM activity hub.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {[
            ['Calls', summary.call || 0],
            ['Meetings', summary.meeting || 0],
            ['Tasks', summary.task || 0],
            ['Emails', summary.email || 0],
            ['Follow-ups', summary.follow_up || 0],
            ['Notes', summary.note || 0],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-surface-border/80 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{label}</p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{value}</p>
            </article>
          ))}
        </div>
      </CRMSection>

      <CRMSection title="Context" description="Current activity focus.">
        <div className="space-y-3">
          <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Entity</p>
            <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              {activeEntity?.entity_label || 'Company-wide activity stream'}
            </p>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {activeEntity?.entity_type ? `${activeEntity.entity_type} ${activeEntity.entity_id}` : 'Showing everything accessible in the tenant.'}
            </p>
          </article>
          <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Owners</p>
            <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{ownerOptions.length}</p>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">Owners are derived from the current result set.</p>
          </article>
        </div>
      </CRMSection>

      <CRMSection title="Quick links" description="Jump back to the related CRM surface.">
        <div className="grid gap-2">
          {quickLinks.map((link) => (
            <Link key={link.to} className="btn btn-secondary justify-between" to={link.to}>
              <span>{link.label}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ))}
        </div>
      </CRMSection>
    </div>
  )
}

export function TaskQueuePanel({
  myTasks = [],
  overdueTasks = [],
  todayTasks = [],
  upcomingTasks = [],
  isLoading = false,
  errorMessage = '',
  onRetry,
  onComplete,
  onReopen,
}) {
  const renderTaskList = (title, tasks) => (
    <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <Badge label={String(tasks.length)} colorKey="draft" />
      </div>
      <div className="mt-3 space-y-2">
        {tasks.length ? tasks.slice(0, 5).map((task) => (
          <div key={task.id} className="rounded-xl border border-surface-border/80 p-3 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{task.title || 'Untitled task'}</p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              {task.owner_name || 'Unassigned'} · {formatActivityDate(task.due_date || task.updated_at || task.created_at)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge label={task.status || 'todo'} colorKey={task.status === 'completed' ? 'completed' : 'scheduled'} />
              {task.priority ? <Badge label={task.priority} colorKey={getPriorityTone(task.priority)} /> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {task.status === 'completed' ? (
                <Button size="sm" variant="secondary" onClick={() => onReopen?.(task)}>Reopen</Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => onComplete?.(task)}>Complete</Button>
              )}
            </div>
          </div>
        )) : (
          <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">No tasks in this section.</p>
        )}
      </div>
    </article>
  )

  if (isLoading) {
    return (
      <CRMSection title="My Tasks" description="Loading scheduled work.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-3xl" />
          <Skeleton className="h-48 w-full rounded-3xl" />
        </div>
      </CRMSection>
    )
  }

  if (errorMessage) {
    return (
      <CRMSection title="My Tasks" description="Could not load scheduled work.">
        <EmptyState
          icon={FileText}
          title="Tasks unavailable"
          description={errorMessage}
          action={(
            <Button type="button" variant="primary" onClick={onRetry}>
              Retry
            </Button>
          )}
        />
      </CRMSection>
    )
  }

  return (
    <CRMSection title="My Tasks" description="Your next actions, overdue work and upcoming follow-ups.">
      <div className="grid gap-4 xl:grid-cols-2">
        {renderTaskList('Overdue', overdueTasks)}
        {renderTaskList('Today', todayTasks)}
        {renderTaskList('Upcoming', upcomingTasks)}
        {renderTaskList('All assigned tasks', myTasks)}
      </div>
    </CRMSection>
  )
}

export function ActivityDeleteState({ isOpen, onClose, onConfirm, activity, loading }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete activity" size="md">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
          Delete <span className="font-semibold text-gray-900 dark:text-gray-100">{activity?.title || 'this activity'}</span>? This keeps the CRM workspace clean and removes the record from the activity hub.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="ghost" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  )
}
