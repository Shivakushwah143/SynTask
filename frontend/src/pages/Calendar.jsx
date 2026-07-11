import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock3, LayoutGrid, List, Plus, Search, Sparkles, Columns3 } from 'lucide-react'
import toast from 'react-hot-toast'
import { contentCalendarApi } from '../api/contentCalendar'
import { projectsApi } from '../api/projects'
import { Badge, Button, EmptyState, FormField, Modal, PageHeader, Skeleton } from '../components/ui'
import { CRMSection, CRMStatCard } from '../components/crm'
import { asArray, formatDateTime } from './phase4Utils'

const QUERY_KEY = 'content-calendar'
const VIEWS = ['calendar', 'board', 'list', 'timeline', 'agenda']
const VIEW_LABELS = {
  calendar: 'Calendar',
  board: 'Board',
  list: 'List',
  timeline: 'Timeline',
  agenda: 'Agenda',
}

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
  const [month, setMonth] = useState(new Date())
  const [selected, setSelected] = useState(new Date())
  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [detailItem, setDetailItem] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
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
  const today = new Date()
  const visibleItems = useMemo(() => {
    if (view === 'timeline' || view === 'agenda') return filteredItems
    if (view === 'calendar') return filteredItems.filter((item) => item.publish_date || item.due_date)
    if (view === 'board') return filteredItems
    return filteredItems
  }, [filteredItems, view])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [month])

  const groupedByDay = useMemo(() => {
    const map = new Map()
    visibleItems.forEach((item) => {
      const timestamp = item.publish_date || item.due_date || item.shoot_date || item.created_at
      if (!timestamp) return
      const key = format(parseISO(String(timestamp)), 'yyyy-MM-dd')
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(item)
    })
    return Array.from(map.entries()).map(([date, dayItems]) => ({ date, items: dayItems }))
  }, [visibleItems])

  const activeItems = useMemo(() => visibleItems.filter((item) => !['published'].includes(String(item.status))), [visibleItems])

  const openEditor = (item) => {
    setDetailItem(item)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Calendar"
        description="Delivery hub for project-linked content planning, shoots, reviews, and publishing."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              New item
            </Button>
            {VIEWS.map((item) => (
              <Button key={item} variant={view === item ? 'primary' : 'secondary'} size="sm" onClick={() => setView(item)}>
                {item === 'calendar' ? <LayoutGrid className="h-4 w-4" /> : item === 'board' ? <Columns3 className="h-4 w-4" /> : <List className="h-4 w-4" />}
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
            <Button variant="ghost" size="sm" onClick={() => { const now = new Date(); setMonth(now); setSelected(now) }}>Today</Button>
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
            <select className="input" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">All projects</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <CRMSection title={`${VIEW_LABELS[view]} View`} description="Project-linked content items with lifecycle and shoot planning.">
          {calendarQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 w-full rounded-3xl" />)}
            </div>
          ) : !visibleItems.length ? (
            <EmptyState title="No content items" description="Create the first item to start planning delivery work." action={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create item</Button>} icon={CalendarIcon} />
          ) : view === 'calendar' ? (
            <MonthCalendar days={days} items={visibleItems} selected={selected} setSelected={setSelected} month={month} onOpen={openEditor} />
          ) : view === 'board' ? (
            <BoardView items={activeItems} onOpen={openEditor} />
          ) : view === 'list' ? (
            <ListView items={visibleItems} onOpen={openEditor} />
          ) : view === 'timeline' ? (
            <TimelineView groups={groupedByDay} onOpen={openEditor} />
          ) : (
            <AgendaView items={visibleItems} selected={selected} onSelect={setSelected} onOpen={openEditor} />
          )}
        </CRMSection>

        <div className="space-y-6">
          <CRMSection title="Deliverables" description="Monthly planning snapshots and delivery totals.">
            <div className="space-y-3">
              <DeliverableRow label="Completed" value={deliverables.completed || 0} tone="emerald" />
              <DeliverableRow label="Remaining" value={deliverables.remaining || 0} tone="blue" />
              <DeliverableRow label="Delayed" value={deliverables.delayed || 0} tone="amber" />
              <DeliverableRow label="Upcoming" value={deliverables.upcoming || 0} tone="slate" />
            </div>
          </CRMSection>

          <CRMSection title="Today" description="Items due, shooting, or publishing today.">
            {visibleItems.filter((item) => isSameDay(parseAnyDate(item.publish_date || item.due_date || item.shoot_date), today)).length ? (
              <div className="space-y-3">
                {visibleItems.filter((item) => isSameDay(parseAnyDate(item.publish_date || item.due_date || item.shoot_date), today)).slice(0, 6).map((item) => <ContentCard key={item.id} item={item} compact onOpen={openEditor} />)}
              </div>
            ) : (
              <EmptyState icon={Clock3} title="Nothing today" description="No content items are scheduled for today." />
            )}
          </CRMSection>
        </div>
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
            due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
            publish_date: form.publish_date ? new Date(form.publish_date).toISOString() : null,
            shoot_date: form.shoot_date ? new Date(form.shoot_date).toISOString() : null,
          })
        }} className="space-y-4">
          <FormField label="Project" required>
            <select className="input" value={form.project_id || projectId} onChange={(event) => setForm((state) => ({ ...state, project_id: event.target.value }))}>
              <option value="">Select project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
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

      <Modal isOpen={Boolean(detailItem)} onClose={() => setDetailItem(null)} title="Content item">
        {detailItem ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{detailItem.title}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detailItem.notes || 'No notes.'}</p>
              </div>
              <Badge label={String(detailItem.status).replace(/_/g, ' ')} colorKey={STATUS_TONES[detailItem.status] || 'draft'} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" value={TYPE_LABELS[detailItem.content_type] || detailItem.content_type} />
              <Field label="Project" value={detailItem.project_id} />
              <Field label="Platform" value={detailItem.platform || '-'} />
              <Field label="Assignee" value={detailItem.assignee_name || detailItem.assignee_id || '-'} />
              <Field label="Due date" value={formatDateTime(detailItem.due_date)} />
              <Field label="Publish date" value={formatDateTime(detailItem.publish_date)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {(detailItem.tags || []).map((tag) => <Badge key={tag} label={tag} colorKey="draft" />)}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => deleteMutation.mutate(detailItem.id)} loading={deleteMutation.isLoading}>Delete</Button>
              <Button variant="primary" onClick={() => updateMutation.mutate({ id: detailItem.id, payload: { status: nextStatus(detailItem.status) } })} loading={updateMutation.isLoading}>Advance status</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}

function parseAnyDate(value) {
  if (!value) return new Date()
  return new Date(value)
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
              key={day.toISOString()}
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

function TimelineView({ groups, onOpen }) {
  return (
    <div className="space-y-4">
      {groups.length ? groups.map((group) => (
        <div key={group.date} className="space-y-3">
          <div className="sticky top-0 rounded-2xl bg-surface-muted px-4 py-2 text-sm font-semibold text-text-secondary dark:bg-black dark:text-gray-200">
            {format(parseISO(group.date), 'EEEE, MMM d')}
          </div>
          {group.items.map((item) => <ContentCard key={item.id} item={item} onOpen={onOpen} />)}
        </div>
      )) : <EmptyState title="No timeline items" description="Switch filters or create new content items." />}
    </div>
  )
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
