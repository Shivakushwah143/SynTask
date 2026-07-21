/* eslint-disable react-refresh/only-export-components */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isAfter, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock3, LayoutGrid, List, Plus, Search, Sparkles, Columns3, Bell, CheckSquare, Video, CalendarRange } from 'lucide-react'
import toast from 'react-hot-toast'
import { calendarApi } from '../api/calendar'
import { contentCalendarApi } from '../api/contentCalendar'
import { projectsApi } from '../api/projects'
import { Badge, Button, CreatableSelectField, EmptyState, FormField, Modal, PageHeader, Skeleton } from '../components/ui'
import { QuickCreateProjectModal } from '../components/relatedRecords/QuickCreateModals'
import { CRMSection, CRMStatCard } from '../components/crm'
import { asArray, formatDateTime } from './phase4Utils'
import { timeService } from '@/services/timeService'

const QUERY_KEY = 'content-calendar'
const VIEWS = ['calendar', 'week_timeline', 'board', 'list', 'agenda']
const VIEW_LABELS = {
  calendar: 'Month',
  week_timeline: 'Week Timeline',
  board: 'Board',
  list: 'List',
  agenda: 'Agenda',
}

const TIMELINE_START_HOUR = 6
const TIMELINE_END_HOUR = 20
const HOUR_HEIGHT = 60
const HOURS = Array.from({ length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 }, (_, index) => TIMELINE_START_HOUR + index)

const STATUS_TONES = {
  draft: 'draft',
  planned: 'scheduled',
  shoot_scheduled: 'scheduled',
  shot: 'completed',
  editing: 'scheduled',
  internal_review: 'draft',
  client_review: 'draft',
  approved: 'completed',
  scheduled: 'scheduled',
  published: 'completed',
}

const TYPE_LABELS = {
  reel: 'Reel',
  static_post: 'Static Post',
  carousel: 'Carousel',
  story: 'Story',
  blog: 'Blog',
  youtube: 'YouTube',
  email_campaign: 'Email Campaign',
  shoot_day: 'Shoot Day',
  custom: 'Custom',
}

export default function Calendar() {
  const queryClient = useQueryClient()
  const [view, setView] = useState('calendar')
  const [month, setMonth] = useState(timeService.now())
  const [selected, setSelected] = useState(timeService.now())
  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [detailItem, setDetailItem] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showQuickProjectModal, setShowQuickProjectModal] = useState(false)
  const [form, setForm] = useState({
    title: '',
    project_id: '',
    content_type: 'custom',
    platform: '',
    due_date: '',
    publish_date: '',
    priority: 'medium',
    notes: '',
    tags: '',
    shoot_date: '',
    location: '',
    photographer: '',
    assets_required: '',
  })

  const calendarQuery = useQuery([QUERY_KEY, projectId], () => contentCalendarApi.getCalendar(projectId ? { project_id: projectId } : {}), {
    staleTime: 60 * 1000,
  })
  const weekDays = useMemo(() => getWeekDays(selected), [selected])
  const weekStart = weekDays[0]
  const weekEnd = weekDays[6]
  const workspaceEventsQuery = useQuery(
    ['workspace-calendar-events', format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd')],
    () => calendarApi.getEvents({ start_date: format(weekStart, 'yyyy-MM-dd'), end_date: format(weekEnd, 'yyyy-MM-dd') }),
    { staleTime: 60 * 1000 },
  )
  const projectsQuery = useQuery(['content-calendar-projects'], () => projectsApi.getProjects({ limit: 200 }), {
    staleTime: 5 * 60 * 1000,
  })

  const createMutation = useMutation((payload) => contentCalendarApi.createItem(payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QUERY_KEY], { exact: false })
      toast.success('Content item created')
      setShowCreate(false)
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Could not create content item'),
  })

  const updateMutation = useMutation(({ id, payload }) => contentCalendarApi.updateItem(id, payload), {
    onSuccess: () => {
      queryClient.invalidateQueries([QUERY_KEY], { exact: false })
      toast.success('Content item updated')
      setDetailItem(null)
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Could not update content item'),
  })

  const deleteMutation = useMutation((id) => contentCalendarApi.deleteItem(id), {
    onSuccess: () => {
      queryClient.invalidateQueries([QUERY_KEY], { exact: false })
      toast.success('Content item deleted')
      setDetailItem(null)
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Could not delete content item'),
  })

  const items = asArray(calendarQuery.data, ['items'])
  const projects = asArray(projectsQuery.data, ['projects'])
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesProject = !projectId || item.project_id === projectId
      const matchesStatus = !statusFilter || item.status === statusFilter
      const matchesType = !typeFilter || item.content_type === typeFilter
      const matchesQuery = !query || [item.title, item.notes, item.platform, item.tags?.join(',')].some((value) => String(value || '').toLowerCase().includes(query))
      return matchesProject && matchesStatus && matchesType && matchesQuery
    })
  }, [items, projectId, search, statusFilter, typeFilter])

  const deliverables = calendarQuery.data?.deliverables || { completed: 0, remaining: 0, delayed: 0, upcoming: 0, monthly_targets: [] }
  const today = useMemo(() => timeService.now(), [])
  const visibleItems = useMemo(() => {
    if (view === 'week_timeline' || view === 'agenda') return filteredItems
    if (view === 'calendar') return filteredItems.filter((item) => item.publish_date || item.due_date)
    if (view === 'board') return filteredItems
    return filteredItems
  }, [filteredItems, view])
  const workspaceEvents = useMemo(() => normalizeWorkspaceEvents(workspaceEventsQuery.data?.events || []), [workspaceEventsQuery.data])
  const timelineEvents = useMemo(() => {
    const contentEvents = visibleItems.map(normalizeContentEvent).filter(Boolean)
    return [...workspaceEvents, ...contentEvents]
  }, [visibleItems, workspaceEvents])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [month])

  const activeItems = useMemo(() => visibleItems.filter((item) => !['published'].includes(String(item.status))), [visibleItems])
  const todayEvents = useMemo(() => timelineEvents.filter((event) => isSameDay(getEventDate(event), today)).sort(sortByDate), [timelineEvents, today])
  const upcomingEvents = useMemo(() => timelineEvents.filter((event) => isAfter(getEventDate(event), today)).sort(sortByDate).slice(0, 8), [timelineEvents, today])
  const reminders = useMemo(() => timelineEvents.filter((event) => ['high', 'urgent', 'critical'].includes(String(event.priority || '').toLowerCase()) || String(event.type) === 'meeting').sort(sortByDate).slice(0, 5), [timelineEvents])

  const openEditor = (item) => {
    setDetailItem(item.original || item)
  }

  const openTimelineEvent = (event) => {
    if (event.original?.content_type) {
      setDetailItem(event.original)
      return
    }
    setDetailItem(event)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Calendar"
        description="Month planning plus week timeline for meetings, tasks, and delivery events."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New item
            </Button>
            {VIEWS.map((item) => (
              <Button key={item} variant={view === item ? 'primary' : 'secondary'} size="sm" onClick={() => setView(item)}>
                {item === 'calendar' ? <LayoutGrid className="h-4 w-4" /> : item === 'week_timeline' ? <CalendarRange className="h-4 w-4" /> : item === 'board' ? <Columns3 className="h-4 w-4" /> : <List className="h-4 w-4" />}
                {VIEW_LABELS[item]}
              </Button>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setMonth(addMonths(month, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-32 text-center text-sm font-semibold text-gray-800 dark:text-gray-100">{format(month, 'MMMM yyyy')}</div>
            <Button variant="secondary" size="sm" onClick={() => setMonth(addMonths(month, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { const now = timeService.now(); setMonth(now); setSelected(now) }}>Today</Button>
          </div>
        )}
      />

      <CRMSection title="Controls" description="Search, filter, and focus the delivery hub without leaving the workspace.">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input className="input pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search content, notes, tags" />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Project</span>
            <CreatableSelectField value={projectId} onChange={setProjectId} className="input" createLabel="Create project" onCreate={() => setShowQuickProjectModal(true)}>
              <option value="">All projects</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </CreatableSelectField>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Status</span>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              {['draft', 'planned', 'shoot_scheduled', 'shot', 'editing', 'internal_review', 'client_review', 'approved', 'scheduled', 'published'].map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Type</span>
            <select className="input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">All types</option>
              {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </CRMSection>

      <section className="grid gap-4 md:grid-cols-4">
        <CRMStatCard icon={CalendarIcon} label="Completed" value={String(deliverables.completed || 0)} tone="emerald" />
        <CRMStatCard icon={Clock3} label="Remaining" value={String(deliverables.remaining || 0)} tone="blue" />
        <CRMStatCard icon={Search} label="Delayed" value={String(deliverables.delayed || 0)} tone="amber" />
        <CRMStatCard icon={Sparkles} label="Upcoming" value={String(deliverables.upcoming || 0)} tone="slate" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <CRMSection title={`${VIEW_LABELS[view]} View`} description="Project-linked content items with lifecycle and shoot planning.">
          {calendarQuery.isLoading || (view === 'week_timeline' && workspaceEventsQuery.isLoading) ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 w-full rounded-3xl" />)}
            </div>
          ) : !visibleItems.length && view !== 'week_timeline' ? (
            <EmptyState title="No content items" description="Create the first item to start planning delivery work." action={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create item</Button>} icon={CalendarIcon} />
          ) : view === 'calendar' ? (
            <MonthCalendar days={days} items={visibleItems} selected={selected} setSelected={setSelected} month={month} onOpen={openEditor} />
          ) : view === 'board' ? (
            <BoardView items={activeItems} onOpen={openEditor} />
          ) : view === 'list' ? (
            <ListView items={visibleItems} onOpen={openEditor} />
          ) : view === 'week_timeline' ? (
            <WeekTimelineView days={weekDays} events={timelineEvents} onOpen={openTimelineEvent} />
          ) : (
            <AgendaView items={visibleItems} selected={selected} onSelect={setSelected} onOpen={openEditor} />
          )}
        </CRMSection>

        <CalendarSidebar
          todayEvents={todayEvents}
          upcomingEvents={upcomingEvents}
          reminders={reminders}
          deliverables={deliverables}
          onOpen={openTimelineEvent}
        />
      </section>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        Reuses projects, tasks, meetings, files, activities, timeline, event bus, and knowledge ingestion.
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create content item">
        <form onSubmit={(event) => {
          event.preventDefault()
          createMutation.mutate({
            ...form,
            project_id: form.project_id || projectId,
            tags: String(form.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
            assets_required: String(form.assets_required || '').split(',').map((item) => item.trim()).filter(Boolean),
            file_ids: [],
            file_urls: [],
            due_date: form.due_date ? timeService.toUtcISOString(form.due_date) : null,
            publish_date: form.publish_date ? timeService.toUtcISOString(form.publish_date) : null,
            shoot_date: form.shoot_date ? timeService.toUtcISOString(form.shoot_date) : null,
          })
        }} className="space-y-4">
          <FormField label="Project" required>
            <CreatableSelectField value={form.project_id || projectId} onChange={(value) => setForm((state) => ({ ...state, project_id: value }))} className="input" createLabel="Create project" onCreate={() => setShowQuickProjectModal(true)}>
              <option value="">Select project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </CreatableSelectField>
          </FormField>
          <FormField label="Title" required>
            <input className="input" value={form.title} onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type">
              <select className="input" value={form.content_type} onChange={(event) => setForm((state) => ({ ...state, content_type: event.target.value }))}>
                {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </FormField>
            <FormField label="Platform">
              <input className="input" value={form.platform} onChange={(event) => setForm((state) => ({ ...state, platform: event.target.value }))} />
            </FormField>
            <FormField label="Due date">
              <input type="datetime-local" className="input" value={form.due_date} onChange={(event) => setForm((state) => ({ ...state, due_date: event.target.value }))} />
            </FormField>
            <FormField label="Publish date">
              <input type="datetime-local" className="input" value={form.publish_date} onChange={(event) => setForm((state) => ({ ...state, publish_date: event.target.value }))} />
            </FormField>
            <FormField label="Shoot date">
              <input type="datetime-local" className="input" value={form.shoot_date} onChange={(event) => setForm((state) => ({ ...state, shoot_date: event.target.value }))} />
            </FormField>
            <FormField label="Priority">
              <select className="input" value={form.priority} onChange={(event) => setForm((state) => ({ ...state, priority: event.target.value }))}>
                {['low', 'medium', 'high', 'urgent'].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Tags">
            <input className="input" value={form.tags} onChange={(event) => setForm((state) => ({ ...state, tags: event.target.value }))} placeholder="comma separated tags" />
          </FormField>
          <FormField label="Notes">
            <textarea className="input min-h-24" value={form.notes} onChange={(event) => setForm((state) => ({ ...state, notes: event.target.value }))} />
          </FormField>
          <FormField label="Assets required">
            <input className="input" value={form.assets_required} onChange={(event) => setForm((state) => ({ ...state, assets_required: event.target.value }))} placeholder="comma separated assets" />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={createMutation.isLoading}>Create</Button>
          </div>
        </form>
      </Modal>

      <QuickCreateProjectModal
        isOpen={showQuickProjectModal}
        onClose={() => setShowQuickProjectModal(false)}
        existing={projects}
        onCreated={async (created) => {
          await projectsQuery.refetch()
          setProjectId(created.id)
          setForm((state) => ({ ...state, project_id: created.id }))
        }}
      />

      <Modal isOpen={Boolean(detailItem)} onClose={() => setDetailItem(null)} title="Calendar item">
        {detailItem ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{detailItem.title}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detailItem.notes || detailItem.description || 'No notes.'}</p>
              </div>
              <Badge label={String(detailItem.status || detailItem.type).replace(/_/g, ' ')} colorKey={STATUS_TONES[detailItem.status] || detailItem.type || 'draft'} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" value={TYPE_LABELS[detailItem.content_type] || detailItem.content_type || detailItem.type} />
              <Field label="Project" value={detailItem.project_name || detailItem.project_id} />
              <Field label="Platform" value={detailItem.platform || '-'} />
              <Field label="Owner" value={detailItem.assignee_name || detailItem.assignee || detailItem.host || detailItem.assignee_id || '-'} />
              <Field label="Due date" value={formatDateTime(detailItem.due_date || detailItem.start_at || detailItem.start)} />
              <Field label="Publish date" value={formatDateTime(detailItem.publish_date)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {(detailItem.tags || []).map((tag) => <Badge key={tag} label={tag} colorKey="draft" />)}
            </div>
            {detailItem.content_type ? <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => deleteMutation.mutate(detailItem.id)} loading={deleteMutation.isLoading}>Delete</Button>
              <Button variant="primary" onClick={() => updateMutation.mutate({ id: detailItem.id, payload: { status: nextStatus(detailItem.status) } })} loading={updateMutation.isLoading}>Advance status</Button>
            </div> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

export function getWeekDays(value) {
  const start = timeService.instant(value)
  const day = start.getDay()
  const diff = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function getEventDate(event) {
  if (event.start_at) return timeService.instant(event.start_at)
  if (event.due_date) return timeService.instant(event.due_date)
  if (event.publish_date) return timeService.instant(event.publish_date)
  if (event.shoot_date) return timeService.instant(event.shoot_date)
  if (event.start && event.time) return timeService.instant(`${event.start}T${event.time.length === 5 ? `${event.time}:00` : event.time}`)
  if (event.start) return timeService.instant(event.start)
  if (event.created_at) return timeService.instant(event.created_at)
  return timeService.now()
}

export function getEventStyle(event) {
  const date = getEventDate(event)
  const minutes = Math.max(0, ((date.getHours() - TIMELINE_START_HOUR) * 60) + date.getMinutes())
  const duration = Number(event.duration_minutes || event.duration || 60)
  return {
    top: `${minutes}px`,
    height: `${Math.max(34, duration)}px`,
  }
}

function sortByDate(a, b) {
  return getEventDate(a) - getEventDate(b)
}

function normalizeWorkspaceEvents(events) {
  return events.map((event) => ({
    ...event,
    start_at: event.due_date || (event.start && event.time ? `${event.start}T${event.time.length === 5 ? `${event.time}:00` : event.time}` : event.start),
    duration_minutes: event.duration || (event.type === 'task' ? 45 : 60),
    label: event.type === 'meeting' ? 'Meeting' : 'Task',
    original: event,
  }))
}

function normalizeContentEvent(item) {
  const date = item.publish_date || item.due_date || item.shoot_date || item.created_at
  if (!date) return null
  return {
    id: `content_${item.id}`,
    type: 'content',
    title: item.title,
    start_at: date,
    duration_minutes: 60,
    status: item.status,
    priority: item.priority,
    label: TYPE_LABELS[item.content_type] || 'Content',
    original: item,
  }
}

function parseAnyDate(value) {
  if (!value) return timeService.now()
  return timeService.instant(value)
}

function nextStatus(status) {
  const flow = ['draft', 'planned', 'shoot_scheduled', 'shot', 'editing', 'internal_review', 'client_review', 'approved', 'scheduled', 'published']
  const index = Math.max(flow.indexOf(String(status)), 0)
  return flow[Math.min(index + 1, flow.length - 1)]
}

function Field({ label, value }) {
  return (
    <div className="rounded-2xl border border-surface-border/80 bg-surface/95 p-4 dark:border-gray-800 dark:bg-black">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{value || '-'}</p>
    </div>
  )
}

function DeliverableRow({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-surface-border/80 bg-surface/95 px-4 py-3 dark:border-gray-800 dark:bg-black">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      <Badge label={String(value)} colorKey={tone} />
    </div>
  )
}

function ContentCard({ item, compact = false, onOpen }) {
  const paddingClass = compact ? 'p-3' : 'p-4'
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`w-full rounded-3xl border border-surface-border/80 bg-surface/95 ${paddingClass} text-left shadow-sm transition-colors hover:bg-surface-muted dark:border-gray-800 dark:bg-black dark:hover:bg-gray-800`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.platform || 'No platform'}</p>
        </div>
        <Badge label={String(item.status).replace(/_/g, ' ')} colorKey={STATUS_TONES[item.status] || 'draft'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge label={TYPE_LABELS[item.content_type] || item.content_type} colorKey="draft" />
        {item.publish_date ? <Badge label={formatDateTime(item.publish_date)} colorKey="scheduled" /> : null}
      </div>
    </button>
  )
}

function MonthCalendar({ days, items, selected, setSelected, month, onOpen }) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-surface-border bg-surface-muted text-xs font-semibold uppercase text-text-muted dark:border-gray-800 dark:bg-black dark:text-gray-400">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="p-3 text-center">{day}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayItems = items.filter((item) => isSameDay(parseAnyDate(item.publish_date || item.due_date || item.shoot_date), day))
          const selectedDay = isSameDay(day, selected)
          const outsideMonth = !isSameMonth(day, month)
          return (
            <button
              key={timeService.toUtcISOString(day)}
              type="button"
              onClick={() => setSelected(day)}
              className={`min-h-28 border-b border-r border-surface-border p-2 text-left transition-colors hover:bg-surface-muted dark:border-gray-800 dark:hover:bg-gray-800 ${selectedDay ? 'bg-primary-50 ring-2 ring-inset ring-primary-500 dark:bg-primary-950/40' : ''} ${outsideMonth ? 'bg-surface-muted/70 text-text-muted dark:bg-black/60 dark:text-gray-600' : 'text-text-primary dark:text-gray-100'}`}
            >
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full text-sm font-medium">{format(day, 'd')}</span>
              <div className="mt-2 space-y-1">
                {dayItems.slice(0, 3).map((item) => (
                  <div key={item.id} onClick={(event) => { event.stopPropagation(); onOpen(item) }} className="truncate rounded-lg bg-primary-50 px-2 py-1 text-xs text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
                    {item.title}
                  </div>
                ))}
                {dayItems.length > 3 ? <span className="text-xs text-gray-500 dark:text-gray-400">+{dayItems.length - 3} more</span> : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BoardView({ items, onOpen }) {
  const columns = ['draft', 'planned', 'shoot_scheduled', 'editing', 'internal_review', 'client_review', 'approved', 'scheduled', 'published']
  return (
    <div className="grid gap-4 overflow-x-auto xl:grid-cols-3">
      {columns.map((status) => {
        const columnItems = items.filter((item) => item.status === status)
        return (
          <section key={status} className="rounded-3xl border border-surface-border/80 bg-surface/95 p-4 dark:border-gray-800 dark:bg-black">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{status.replace(/_/g, ' ')}</h3>
              <Badge label={String(columnItems.length)} colorKey="draft" />
            </div>
            <div className="mt-4 space-y-3">
              {columnItems.length ? columnItems.map((item) => <ContentCard key={item.id} item={item} onOpen={onOpen} />) : <EmptyState title="No items" description="Nothing scheduled in this column." />}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ListView({ items, onOpen }) {
  return (
    <div className="space-y-3">
      {items.length ? items.map((item) => <ContentCard key={item.id} item={item} onOpen={onOpen} />) : <EmptyState title="No items" description="No content items match the current filters." />}
    </div>
  )
}

function CalendarSidebar({ todayEvents, upcomingEvents, reminders, deliverables, onOpen }) {
  return (
    <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
      <SidebarPanel title="Today's Schedule" icon={Clock3}>
        <ScheduleList items={todayEvents.slice(0, 6)} emptyTitle="No events today" onOpen={onOpen} />
      </SidebarPanel>
      <SidebarPanel title="Upcoming Events" icon={CalendarIcon}>
        <ScheduleList items={upcomingEvents} emptyTitle="No upcoming events" onOpen={onOpen} />
      </SidebarPanel>
      <SidebarPanel title="Reminders" icon={Bell}>
        <ScheduleList items={reminders} emptyTitle="No reminders" onOpen={onOpen} />
      </SidebarPanel>
      <SidebarPanel title="Deliverables" icon={Sparkles}>
        <div className="space-y-3">
          <DeliverableRow label="Completed" value={deliverables.completed || 0} tone="emerald" />
          <DeliverableRow label="Remaining" value={deliverables.remaining || 0} tone="blue" />
          <DeliverableRow label="Delayed" value={deliverables.delayed || 0} tone="amber" />
          <DeliverableRow label="Upcoming" value={deliverables.upcoming || 0} tone="slate" />
        </div>
      </SidebarPanel>
    </aside>
  )
}

function SidebarPanel({ title, icon: Icon, children }) {
  return (
    <section className="rounded-3xl border border-surface-border/80 bg-surface/95 p-4 shadow-sm dark:border-gray-800 dark:bg-black">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-200">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-text-primary dark:text-gray-100">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function ScheduleList({ items, emptyTitle, onOpen }) {
  if (!items.length) return <EmptyState icon={Clock3} title={emptyTitle} description="Schedule cards appear here when work is dated." />
  return (
    <div className="space-y-2">
      {items.map((item) => <TimelineEventCard key={`${item.type}-${item.id}`} event={item} onOpen={onOpen} compact />)}
    </div>
  )
}

function WeekTimelineView({ days, events, onOpen }) {
  const timedEvents = events.filter((event) => {
    const date = getEventDate(event)
    return days.some((day) => isSameDay(day, date))
  })

  return (
    <div className="overflow-hidden rounded-3xl border border-surface-border/80 bg-surface/95 dark:border-gray-800 dark:bg-black">
      <div className="grid min-w-[820px] grid-cols-[72px_repeat(7,minmax(96px,1fr))] border-b border-surface-border bg-surface-muted dark:border-gray-800 dark:bg-gray-950">
        <div className="p-3 text-xs font-semibold uppercase text-text-muted">Time</div>
        {days.map((day) => (
          <div key={timeService.toUtcISOString(day)} className={`border-l border-surface-border p-3 text-center dark:border-gray-800 ${isSameDay(day, timeService.now()) ? 'bg-primary-50/70 dark:bg-primary-950/30' : ''}`}>
            <p className="text-xs font-semibold uppercase text-text-muted">{format(day, 'EEE')}</p>
            <p className="mt-1 text-lg font-semibold text-text-primary dark:text-gray-100">{format(day, 'd')}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[820px] grid-cols-[72px_repeat(7,minmax(96px,1fr))]">
          <div className="bg-surface-muted/70 dark:bg-gray-950">
            {HOURS.map((hour) => (
              <div key={hour} className="h-[60px] border-b border-surface-border px-2 py-1 text-right text-xs text-text-muted dark:border-gray-800">
                {format(timeService.instant(2026, 0, 1, hour), 'ha')}
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div key={timeService.toUtcISOString(day)} className="relative border-l border-surface-border dark:border-gray-800" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
              {HOURS.map((hour) => <div key={hour} className="h-[60px] border-b border-surface-border dark:border-gray-800" />)}
              {timedEvents.filter((event) => isSameDay(getEventDate(event), day)).map((event) => (
                <button
                  key={`${event.type}-${event.id}`}
                  type="button"
                  onClick={() => onOpen(event)}
                  className={`absolute left-1 right-1 overflow-hidden rounded-xl border px-2 py-1 text-left text-xs shadow-sm transition hover:brightness-95 ${eventToneClass(event)}`}
                  style={getEventStyle(event)}
                  title={event.title}
                >
                  <span className="block truncate font-semibold">{event.title}</span>
                  <span className="mt-0.5 block truncate opacity-80">{format(getEventDate(event), 'h:mm a')} · {event.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      {!timedEvents.length ? <div className="p-6"><EmptyState title="No week events" description="Meetings, tasks, and content dates appear here by time." /></div> : null}
    </div>
  )
}

function TimelineEventCard({ event, onOpen, compact = false }) {
  const Icon = event.type === 'meeting' ? Video : event.type === 'task' ? CheckSquare : CalendarIcon
  return (
    <button type="button" onClick={() => onOpen(event)} className={`w-full rounded-2xl border border-surface-border/80 bg-surface-muted/70 text-left transition hover:bg-surface-muted dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-900 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-xl ${eventIconClass(event)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-text-primary dark:text-gray-100">{event.title}</span>
          <span className="mt-1 block text-xs text-text-muted dark:text-gray-400">{format(getEventDate(event), 'MMM d, h:mm a')}</span>
        </span>
      </div>
    </button>
  )
}

function eventToneClass(event) {
  if (event.type === 'meeting') return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/70 dark:text-blue-100'
  if (event.type === 'task') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-100'
  return 'border-primary-200 bg-primary-50 text-primary-800 dark:border-primary-900 dark:bg-primary-950/70 dark:text-primary-100'
}

function eventIconClass(event) {
  if (event.type === 'meeting') return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
  if (event.type === 'task') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
  return 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-200'
}

function AgendaView({ items, selected, onSelect, onOpen }) {
  const agenda = [...items].sort((a, b) => parseAnyDate(a.publish_date || a.due_date) - parseAnyDate(b.publish_date || b.due_date))
  return (
    <div className="space-y-4">
      {agenda.length ? agenda.map((item) => {
        const date = parseAnyDate(item.publish_date || item.due_date || item.shoot_date)
        const active = isSameDay(date, selected)
        return (
          <button key={item.id} type="button" onClick={() => { onSelect(date); onOpen(item) }} className={`flex w-full items-start justify-between gap-3 rounded-3xl border border-surface-border/80 bg-surface/95 p-4 text-left shadow-sm transition-colors hover:bg-surface-muted dark:border-gray-800 dark:bg-black dark:hover:bg-gray-800 ${active ? 'bg-primary-50/60 dark:bg-primary-950/30' : ''}`}>
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(date)}</p>
            </div>
            <Badge label={String(item.status).replace(/_/g, ' ')} colorKey={STATUS_TONES[item.status] || 'draft'} />
          </button>
        )
      }) : <EmptyState title="No agenda items" description="Switch to calendar or board view." />}
    </div>
  )
}
