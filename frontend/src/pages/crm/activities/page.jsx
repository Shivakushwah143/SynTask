import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { tasksAPI } from '../../../api/tasks'
import { CRMContent, CRMPage, CRMPageTitle } from '../../../components/crm'
import { Button, EmptyState, Modal } from '../../../components/ui'
import { useAuthStore } from '../../../store/authStore'
import { timeService } from '@/services/timeService'
import {
  ActivityComposer,
  ActivityDeleteState,
  ActivityFeed,
  ActivityFilters,
  ActivitySidePanel,
  ActivityStatRow,
  TaskQueuePanel,
  isTaskDueToday,
  isTaskOverdue,
  isTaskUpcoming,
} from './components'

const INITIAL_FORM = {
  activity_type: 'task',
  entity_type: 'lead',
  entity_id: '',
  title: '',
  description: '',
  owner_id: '',
  due_date: '',
  scheduled_at: '',
  status: 'draft',
  priority: 'medium',
  metadata: '',
}

const DATE_RANGE_TO_QUERY = {
  all: null,
  today: 0,
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

function toDateTimeLocal(value) {
  if (!value) return ''
  return timeService.toZonedDateTimeInput(value)
}

function parseMetadata(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return {}
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    throw new Error('Metadata must be valid JSON.')
  }
}

function buildDateRange(range) {
  const days = DATE_RANGE_TO_QUERY[range]
  if (days === null || typeof days === 'undefined') {
    return {}
  }
  const end = timeService.now()
  const start = timeService.now()
  start.setDate(start.getDate() - days)
  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  return {
    date_from: timeService.toUtcISOString(start),
    date_to: timeService.toUtcISOString(end),
  }
}

export default function CRMActivitiesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.user)
  const [searchParams, setSearchParams] = useSearchParams()
  const [editingActivity, setEditingActivity] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState(INITIAL_FORM)

  const searchValue = searchParams.get('search') || ''
  const typeValue = searchParams.get('type') || ''
  const ownerValue = searchParams.get('owner') || ''
  const statusValue = searchParams.get('status') || ''
  const priorityValue = searchParams.get('priority') || ''
  const dateValue = searchParams.get('date') || 'all'
  const entityTypeValue = searchParams.get('entity_type') || ''
  const entityIdValue = searchParams.get('entity_id') || ''

  useEffect(() => {
    setForm((state) => ({
      ...state,
      entity_type: entityTypeValue || 'lead',
      entity_id: entityIdValue || '',
    }))
  }, [entityIdValue, entityTypeValue])

  const params = useMemo(() => ({
    search: searchValue || undefined,
    activity_type: typeValue || undefined,
    owner_id: ownerValue || undefined,
    status: statusValue || undefined,
    priority: priorityValue || undefined,
    entity_type: entityTypeValue || undefined,
    entity_id: entityIdValue || undefined,
    ...buildDateRange(dateValue),
  }), [dateValue, entityIdValue, entityTypeValue, ownerValue, priorityValue, searchValue, statusValue, typeValue])

  const activitiesQuery = useQuery(['crm-activities', params], () => crmApi.getActivities(params), {
    retry: false,
    staleTime: 60 * 1000,
    keepPreviousData: true,
  })

  const myTasksQuery = useQuery(
    ['crm-my-tasks', currentUser?.id],
    async () => {
      if (!currentUser?.id) return { tasks: [] }
      return tasksAPI.listTasks({ assigned_to: currentUser.id, limit: 200 })
    },
    {
      retry: false,
      staleTime: 30 * 1000,
      keepPreviousData: true,
      enabled: Boolean(currentUser?.id),
    }
  )

  const activities = useMemo(
    () => (Array.isArray(activitiesQuery.data?.activities) ? activitiesQuery.data.activities : []),
    [activitiesQuery.data]
  )
  const groupedByDay = useMemo(
    () => (Array.isArray(activitiesQuery.data?.grouped_by_day) ? activitiesQuery.data.grouped_by_day : []),
    [activitiesQuery.data]
  )
  const summary = useMemo(() => activitiesQuery.data?.summary || {}, [activitiesQuery.data])
  const activeEntity = useMemo(() => activitiesQuery.data?.filters || {}, [activitiesQuery.data])
  const activityError = activitiesQuery.error?.response?.data?.detail || 'Activities could not be loaded.'
  const myTasks = useMemo(() => (Array.isArray(myTasksQuery.data?.tasks) ? myTasksQuery.data.tasks : []), [myTasksQuery.data])
  const overdueTasks = useMemo(() => myTasks.filter((task) => isTaskOverdue(task)), [myTasks])
  const todayTasks = useMemo(() => myTasks.filter((task) => isTaskDueToday(task)), [myTasks])
  const upcomingTasks = useMemo(() => myTasks.filter((task) => isTaskUpcoming(task)), [myTasks])
  const taskError = myTasksQuery.error?.response?.data?.detail || 'Tasks could not be loaded.'

  const ownerOptions = useMemo(() => {
    const owners = new Map()
    for (const item of activities) {
      if (!item?.owner_id || owners.has(item.owner_id)) continue
      owners.set(item.owner_id, item.owner_name || item.owner_id)
    }
    return Array.from(owners, ([value, label]) => ({ value, label }))
  }, [activities])

  const entityOptions = useMemo(() => {
    return activities
      .filter((item) => item?.entity_id && item?.entity_label)
      .slice(0, 50)
      .map((item) => ({ value: item.entity_id, label: `${item.entity_label} (${item.entity_type})` }))
  }, [activities])

  const resetForm = useCallback(() => {
    setEditingActivity(null)
    setForm((state) => ({
      ...INITIAL_FORM,
      entity_type: entityTypeValue || state.entity_type || 'lead',
      entity_id: entityIdValue || state.entity_id || '',
    }))
  }, [entityIdValue, entityTypeValue])

  const mutateActivity = useMutation(
    ({ mode, payload, activityId }) => {
      if (mode === 'update') return crmApi.updateActivity(activityId, payload)
      return crmApi.createActivity(payload)
    },
    {
      onSuccess: (response) => {
        toast.success(response?.data?.message || (editingActivity ? 'Activity updated' : 'Activity created'))
        resetForm()
        queryClient.invalidateQueries(['crm-activities'])
      },
    }
  )

  const completeMutation = useMutation(
    (activityId) => crmApi.updateActivity(activityId, { status: 'completed', complete: true }),
    {
      onSuccess: () => {
        toast.success('Activity completed')
        queryClient.invalidateQueries(['crm-activities'])
      },
    }
  )

  const deleteMutation = useMutation(
    (activityId) => crmApi.deleteActivity(activityId),
    {
      onSuccess: () => {
        toast.success('Activity deleted')
        setDeleteTarget(null)
        queryClient.invalidateQueries(['crm-activities'])
      },
    }
  )

  const snoozeMutation = useMutation(
    ({ activityId, snoozeUntil }) => crmApi.updateActivity(activityId, { snooze_until: snoozeUntil, status: 'scheduled' }),
    {
      onSuccess: () => {
        toast.success('Activity snoozed')
        queryClient.invalidateQueries(['crm-activities'])
      },
    }
  )

  const completeTaskMutation = useMutation(
    (taskId) => tasksAPI.updateTaskStatus(taskId, 'completed'),
    {
      onSuccess: () => {
        toast.success('Task completed')
        queryClient.invalidateQueries(['crm-my-tasks'])
      },
    }
  )

  const reopenTaskMutation = useMutation(
    (taskId) => tasksAPI.updateTaskStatus(taskId, 'todo'),
    {
      onSuccess: () => {
        toast.success('Task reopened')
        queryClient.invalidateQueries(['crm-my-tasks'])
      },
    }
  )

  const applyFilter = useCallback((key, value) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const handleFormChange = useCallback((key, value) => {
    setForm((state) => ({ ...state, [key]: value }))
  }, [])

  const handleSubmit = useCallback(() => {
    try {
      const payload = {
        activity_type: form.activity_type,
        entity_type: form.entity_type,
        entity_id: form.entity_id.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        owner_id: form.owner_id.trim() || null,
        status: form.status,
        priority: form.priority,
        due_date: form.due_date ? timeService.toUtcISOString(form.due_date) : null,
        scheduled_at: form.scheduled_at ? timeService.toUtcISOString(form.scheduled_at) : null,
        metadata: parseMetadata(form.metadata),
      }

      if (!payload.entity_id) {
        toast.error('Entity id is required')
        return
      }
      if (!payload.title) {
        toast.error('Title is required')
        return
      }

      if (editingActivity) {
        mutateActivity.mutate({ mode: 'update', activityId: editingActivity.id, payload })
      } else {
        mutateActivity.mutate({ mode: 'create', payload })
      }
    } catch (error) {
      toast.error(error.message || 'Unable to save activity')
    }
  }, [editingActivity, form, mutateActivity])

  const beginEdit = useCallback((activity) => {
    setEditingActivity(activity)
    setForm({
      activity_type: activity.activity_type || 'task',
      entity_type: activity.entity_type || 'lead',
      entity_id: activity.entity_id || '',
      title: activity.title || '',
      description: activity.description || '',
      owner_id: activity.owner_id || '',
      due_date: toDateTimeLocal(activity.due_date),
      scheduled_at: toDateTimeLocal(activity.scheduled_at),
      status: activity.status || 'draft',
      priority: activity.priority || 'medium',
      metadata: activity.metadata ? JSON.stringify(activity.metadata, null, 2) : '',
    })
  }, [])

  const clearEditing = useCallback(() => {
    setEditingActivity(null)
    resetForm()
  }, [resetForm])

  const quickLinks = useMemo(() => {
    const links = [
      { to: '/crm/pipeline', label: 'Open pipeline' },
      { to: '/crm/leads', label: 'Open leads' },
      { to: '/crm/companies', label: 'Open companies' },
      { to: '/crm/contacts', label: 'Open contacts' },
    ]

    if (entityTypeValue === 'lead' && entityIdValue) {
      links.unshift({ to: `/crm/leads/${entityIdValue}`, label: 'Open lead workspace' })
    } else if (entityTypeValue === 'company' && entityIdValue) {
      links.unshift({ to: `/crm/companies/${entityIdValue}`, label: 'Open company workspace' })
    }
    return links
  }, [entityIdValue, entityTypeValue])

  const filteredEntitySummary = useMemo(() => {
    if (!activeEntity?.entity_type) return 'Company-wide activity stream'
    return `${activeEntity.entity_type} ${activeEntity.entity_id || ''}`.trim()
  }, [activeEntity])

  const errorStatus = activitiesQuery.error?.response?.status

  if (errorStatus === 403) {
    return (
      <CRMPage>
        <CRMPageTitle
          eyebrow="CRM"
          title="Activities"
          description="Access is controlled by the Sales module permission."
          actions={(
            <Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>
              Back to pipeline
            </Button>
          )}
        />
        <EmptyState
          title="Access denied"
          description="You do not have permission to view CRM activities."
        />
      </CRMPage>
    )
  }

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM"
        title="Activities Hub"
        description="Central activity stream for calls, meetings, tasks, emails, reminders and follow-ups."
        actions={(
          <>
            <Button variant="secondary" onClick={() => activitiesQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>
              Go to pipeline
            </Button>
          </>
        )}
      />

      <ActivityStatRow summary={summary} />

      <ActivityComposer
        form={form}
        onChange={handleFormChange}
        onSubmit={handleSubmit}
        isSubmitting={mutateActivity.isLoading}
        isEditing={Boolean(editingActivity)}
        entitySummary={filteredEntitySummary}
        entityOptions={entityOptions}
      />

      <ActivityFilters
        searchValue={searchValue}
        onSearchChange={(value) => applyFilter('search', value)}
        typeValue={typeValue}
        onTypeChange={(value) => applyFilter('type', value)}
        ownerValue={ownerValue}
        onOwnerChange={(value) => applyFilter('owner', value)}
        statusValue={statusValue}
        onStatusChange={(value) => applyFilter('status', value)}
        priorityValue={priorityValue}
        onPriorityChange={(value) => applyFilter('priority', value)}
        dateValue={dateValue}
        onDateChange={(value) => applyFilter('date', value)}
        ownerOptions={ownerOptions}
      />

      <CRMContent
        aside={(
          <ActivitySidePanel
            summary={summary}
            ownerOptions={ownerOptions}
            activeEntity={activeEntity}
            quickLinks={quickLinks}
          />
        )}
      >
        <TaskQueuePanel
          myTasks={myTasks}
          overdueTasks={overdueTasks}
          todayTasks={todayTasks}
          upcomingTasks={upcomingTasks}
          isLoading={myTasksQuery.isLoading}
          errorMessage={myTasksQuery.isError ? taskError : ''}
          onRetry={() => myTasksQuery.refetch()}
          onComplete={(task) => completeTaskMutation.mutate(task.id)}
          onReopen={(task) => reopenTaskMutation.mutate(task.id)}
        />

        <ActivityFeed
          groupedByDay={groupedByDay}
          isLoading={activitiesQuery.isLoading}
          errorMessage={activitiesQuery.isError ? activityError : ''}
          onRetry={() => activitiesQuery.refetch()}
          onEdit={beginEdit}
          onDelete={setDeleteTarget}
          onComplete={(activity) => completeMutation.mutate(activity.id)}
          onSnooze={(activity) => {
            const next = timeService.now()
            next.setDate(next.getDate() + 1)
            snoozeMutation.mutate({ activityId: activity.id, snoozeUntil: timeService.toUtcISOString(next) })
          }}
          emptyTitle="No matching activities"
          emptyDescription="Create or filter CRM activities to populate this hub."
        />
      </CRMContent>

      <Modal
        isOpen={Boolean(editingActivity)}
        onClose={clearEditing}
        title="Edit activity"
        size="xl"
      >
        {editingActivity ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Update the selected activity and keep the CRM feed in sync.
            </p>
            <ActivityComposer
              form={form}
              onChange={handleFormChange}
              onSubmit={handleSubmit}
              isSubmitting={mutateActivity.isLoading}
              isEditing
              entitySummary={filteredEntitySummary}
              entityOptions={entityOptions}
            />
          </div>
        ) : null}
      </Modal>

      <ActivityDeleteState
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMutation.mutate(deleteTarget?.id)}
        activity={deleteTarget}
        loading={deleteMutation.isLoading}
      />
    </CRMPage>
  )
}
