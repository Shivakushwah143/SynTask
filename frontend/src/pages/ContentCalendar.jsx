import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  parseISO,
  isValid
} from 'date-fns'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Search,
  Plus,
  Trash2,
  Copy,
  Pencil,
  Paperclip,
  User,
  Bell,
  Layers,
  Sparkles,
  Columns,
  X
} from 'lucide-react'
import toast from 'react-hot-toast'
import { contentCalendarApi } from '../api/contentCalendar'
import { projectsApi } from '../api/projects'
import { useAuthStore } from '../store/authStore'
import { Badge, Button, FormField, Modal, Skeleton } from '../components/ui'
import { asArray } from './phase4Utils'
import { timeService } from '@/services/timeService'

const PLATFORMS = ['Instagram', 'YouTube', 'LinkedIn', 'Facebook', 'Twitter/X', 'Pinterest', 'Email', 'Blog', 'Other']
const CATEGORIES = ['Marketing Campaign', 'Instagram Reel / Post', 'YouTube Video', 'Product Launch', 'LinkedIn Article', 'Festival Campaign', 'Office Event', 'Training Session', 'Promotion', 'Other']
const REMINDERS = [
  { value: '15_min_before', label: '15 Minutes Before' },
  { value: '1_hour_before', label: '1 Hour Before' },
  { value: '12_hours_before', label: '12 Hours Before' },
  { value: '1_day_before', label: '1 Day Before' },
  { value: 'none', label: 'No Reminder' }
]
const COLORS = [
  { value: '#3B82F6', label: 'Blue' },
  { value: '#EF4444', label: 'Red' },
  { value: '#10B981', label: 'Green' },
  { value: '#F59E0B', label: 'Yellow/Orange' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink' },
  { value: '#6B7280', label: 'Gray' }
]

export default function ContentCalendar() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const companyId = user?.company_id

  // Views & Dates
  const [view, setView] = useState('month') // 'month' | 'week' | 'day'
  const [currentDate, setCurrentDate] = useState(timeService.now())
  const [selectedDate, setSelectedDate] = useState(timeService.now())
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Edit/Create Modal States
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null) // null for create
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Marketing Campaign',
    platform: 'Instagram',
    priority: 'medium',
    status: 'draft',
    start_date: '',
    end_date: '',
    time: '12:00',
    assigned_person: '',
    reminder: 'none',
    color: '#3B82F6',
    attachment: '',
    project_id: ''
  })

  // Queries
  const { data: calendarData, isLoading, isError } = useQuery(
    ['content-calendar-items'],
    () => contentCalendarApi.getCalendar(),
    { staleTime: 30 * 1000 }
  )

  const { data: projectsData } = useQuery(
    ['content-projects'],
    () => projectsApi.getProjects({ limit: 100 }),
    { staleTime: 5 * 60 * 1000 }
  )

  const items = asArray(calendarData, ['items'])
  const projects = asArray(projectsData, ['projects'])

  // Mutations
  const createMutation = useMutation(
    (payload) => contentCalendarApi.createItem(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['content-calendar-items'])
        toast.success('Event scheduled successfully')
        setShowEditModal(false)
      },
      onError: (err) => toast.error(err?.response?.data?.detail || 'Could not schedule event')
    }
  )

  const updateMutation = useMutation(
    ({ id, payload }) => contentCalendarApi.updateItem(id, payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['content-calendar-items'])
        toast.success('Event updated successfully')
        setShowEditModal(false)
      },
      onError: (err) => toast.error(err?.response?.data?.detail || 'Could not update event')
    }
  )

  const deleteMutation = useMutation(
    (id) => contentCalendarApi.deleteItem(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['content-calendar-items'])
        toast.success('Event removed')
        setShowEditModal(false)
      },
      onError: (err) => toast.error(err?.response?.data?.detail || 'Could not remove event')
    }
  )

  // Filters & Search
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim()
    return items.filter((item) => {
      const matchesSearch = !q ||
        (item.title || '').toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q)
      
      const matchesPlatform = !platformFilter || item.platform === platformFilter
      const matchesStatus = !statusFilter || item.status === statusFilter
      return matchesSearch && matchesPlatform && matchesStatus
    })
  }, [items, search, platformFilter, statusFilter])

  // Month View Days
  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  // Week View Days
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    const end = endOfWeek(currentDate, { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [currentDate])

  // Safe date helper
  const parseEventDate = (dateStr) => {
    if (!dateStr) return null
    const parsed = parseISO(dateStr)
    return isValid(parsed) ? parsed : null
  }

  const handlePrev = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, -1))
    else if (view === 'week') setCurrentDate(addWeeks(currentDate, -1))
    else setCurrentDate(addDays(currentDate, -1))
  }

  const handleNext = () => {
    if (view === 'month') setCurrentDate(addMonths(currentDate, 1))
    else if (view === 'week') setCurrentDate(addWeeks(currentDate, 1))
    else setCurrentDate(addDays(currentDate, 1))
  }

  const handleToday = () => {
    const now = timeService.now()
    setCurrentDate(now)
    setSelectedDate(now)
  }

  // Open Create Form
  const handleOpenCreate = (date = timeService.now()) => {
    setEditingItem(null)
    setForm({
      title: '',
      description: '',
      category: 'Marketing Campaign',
      platform: 'Instagram',
      priority: 'medium',
      status: 'draft',
      start_date: format(date, 'yyyy-MM-dd'),
      end_date: format(date, 'yyyy-MM-dd'),
      time: '12:00',
      assigned_person: user ? `${user.first_name} ${user.last_name}` : '',
      reminder: 'none',
      color: '#3B82F6',
      attachment: '',
      project_id: projects[0]?.id || ''
    })
    setShowEditModal(true)
  }

  // Open Edit Form
  const handleOpenEdit = (item) => {
    setEditingItem(item)
    setForm({
      title: item.title || '',
      description: item.description || item.notes || '',
      category: item.category || 'Marketing Campaign',
      platform: item.platform || 'Instagram',
      priority: item.priority || 'medium',
      status: item.status || 'draft',
      start_date: item.start_date ? format(timeService.instant(item.start_date), 'yyyy-MM-dd') : item.publish_date ? format(timeService.instant(item.publish_date), 'yyyy-MM-dd') : '',
      end_date: item.end_date ? format(timeService.instant(item.end_date), 'yyyy-MM-dd') : item.due_date ? format(timeService.instant(item.due_date), 'yyyy-MM-dd') : '',
      time: item.time || '12:00',
      assigned_person: item.assigned_person || item.assignee_name || '',
      reminder: item.reminder || 'none',
      color: item.color || '#3B82F6',
      attachment: item.attachment || item.file_urls?.[0] || '',
      project_id: item.project_id || ''
    })
    setShowEditModal(true)
  }

  // Duplicate Event Quick Action
  const handleDuplicate = (e, item) => {
    e.stopPropagation()
    const payload = {
      project_id: item.project_id,
      title: `${item.title} (Copy)`,
      description: item.description || item.notes || '',
      category: item.category || 'Marketing Campaign',
      platform: item.platform || 'Instagram',
      priority: item.priority || 'medium',
      status: 'draft',
      start_date: item.start_date ? timeService.toUtcISOString(item.start_date) : null,
      end_date: item.end_date ? timeService.toUtcISOString(item.end_date) : null,
      time: item.time || '12:00',
      assigned_person: item.assigned_person || item.assignee_name || '',
      reminder: item.reminder || 'none',
      color: item.color || '#3B82F6',
      attachment: item.attachment || '',
      tags: item.tags || [],
      file_urls: item.file_urls || []
    }
    createMutation.mutate(payload)
  }

  // Handle Form Submit
  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.project_id) {
      toast.error('Please associate a project with this content schedule.')
      return
    }
    const payload = {
      project_id: form.project_id,
      title: form.title,
      description: form.description,
      notes: form.description, // for backend notes fallback
      category: form.category,
      platform: form.platform,
      priority: form.priority,
      status: form.status,
      start_date: form.start_date ? timeService.zonedInputToUtcISOString(`${form.start_date}T00:00:00`) : null,
      end_date: form.end_date ? timeService.zonedInputToUtcISOString(`${form.end_date}T23:59:59`) : null,
      due_date: form.end_date ? timeService.zonedInputToUtcISOString(`${form.end_date}T23:59:59`) : null,
      publish_date: form.start_date ? timeService.zonedInputToUtcISOString(`${form.start_date}T${form.time}:00`) : null,
      time: form.time,
      assigned_person: form.assigned_person,
      assignee_name: form.assigned_person,
      reminder: form.reminder,
      color: form.color,
      attachment: form.attachment,
      file_urls: form.attachment ? [form.attachment] : []
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-140px)] flex-col space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-surface-border pb-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary-600" />
            Content Calendar
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Plan, coordinate, and schedule content publication. Visible team-wide.
          </p>
        </div>

        {/* Navigation & Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:self-center">
          <Button onClick={() => handleOpenCreate(timeService.now())}>
            <Plus className="h-4 w-4 mr-1.5" />
            Schedule Content
          </Button>

          {/* Month/Week/Day tabs */}
          <div className="flex rounded-xl bg-slate-100 p-0.5 dark:bg-gray-800">
            {['month', 'week', 'day'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  view === v
                    ? 'bg-white shadow-sm text-primary-700 dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="xs" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="xs" onClick={handleToday}>
              Today
            </Button>
            <Button variant="secondary" size="xs" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 min-w-36 text-center">
            {view === 'day'
              ? format(currentDate, 'MMMM d, yyyy')
              : view === 'week'
                ? `${format(weekDays[0], 'MMM d')} - ${format(weekDays[6], 'MMM d, yyyy')}`
                : format(currentDate, 'MMMM yyyy')}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        
        {/* Controls Sidebar */}
        <aside className="space-y-6">
          
          {/* Search Box */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="input pl-10 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns..."
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Platform Filters */}
          <div className="rounded-3xl border border-surface-border bg-surface p-4 dark:border-gray-800 dark:bg-black">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Platform</h3>
            <select className="input text-xs" value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
              <option value="">All Platforms</option>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Status Filters */}
          <div className="rounded-3xl border border-surface-border bg-surface p-4 dark:border-gray-800 dark:bg-black">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Workflow State</h3>
            <select className="input text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {['draft', 'planned', 'shoot_scheduled', 'shot', 'editing', 'internal_review', 'client_review', 'approved', 'scheduled', 'published'].map((status) => (
                <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        </aside>

        {/* Main Grid */}
        <main className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
            </div>
          ) : isError ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-50/20 p-6 text-center text-red-800">
              <p className="font-semibold">Unable to load Content Calendar items.</p>
            </div>
          ) : (
            <div className="rounded-3xl border border-surface-border bg-surface shadow-sm dark:border-gray-800 dark:bg-black overflow-hidden">
              {view === 'month' && (
                <ContentMonthView
                  days={monthDays}
                  items={filteredItems}
                  onOpen={handleOpenEdit}
                  onCreateAt={handleOpenCreate}
                  onDuplicate={handleDuplicate}
                  parseEventDate={parseEventDate}
                />
              )}
              {view === 'week' && (
                <ContentWeekView
                  days={weekDays}
                  items={filteredItems}
                  onOpen={handleOpenEdit}
                  onDuplicate={handleDuplicate}
                  parseEventDate={parseEventDate}
                />
              )}
              {view === 'day' && (
                <ContentDayView
                  day={currentDate}
                  items={filteredItems}
                  onOpen={handleOpenEdit}
                  onDuplicate={handleDuplicate}
                  parseEventDate={parseEventDate}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Editing / Creation Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title={editingItem ? 'Edit Scheduled Content' : 'Schedule Content Item'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Title" required>
              <input type="text" className="input" value={form.title} onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))} required />
            </FormField>

            <FormField label="Project" required>
              <select className="input" value={form.project_id} onChange={(e) => setForm(prev => ({ ...prev, project_id: e.target.value }))} required>
                <option value="">Select Associated Project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FormField>

            <FormField label="Platform">
              <select className="input" value={form.platform} onChange={(e) => setForm(prev => ({ ...prev, platform: e.target.value }))}>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>

            <FormField label="Category">
              <select className="input" value={form.category} onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>

            <FormField label="Start Date">
              <input type="date" className="input" value={form.start_date} onChange={(e) => setForm(prev => ({ ...prev, start_date: e.target.value }))} />
            </FormField>

            <FormField label="End Date">
              <input type="date" className="input" value={form.end_date} onChange={(e) => setForm(prev => ({ ...prev, end_date: e.target.value }))} />
            </FormField>

            <FormField label="Publish Time">
              <input type="time" className="input" value={form.time} onChange={(e) => setForm(prev => ({ ...prev, time: e.target.value }))} />
            </FormField>

            <FormField label="Assigned Person">
              <input type="text" className="input" value={form.assigned_person} onChange={(e) => setForm(prev => ({ ...prev, assigned_person: e.target.value }))} placeholder="e.g. Content Creator" />
            </FormField>

            <FormField label="Reminder">
              <select className="input" value={form.reminder} onChange={(e) => setForm(prev => ({ ...prev, reminder: e.target.value }))}>
                {REMINDERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </FormField>

            <FormField label="Event Color">
              <select className="input" value={form.color} onChange={(e) => setForm(prev => ({ ...prev, color: e.target.value }))}>
                {COLORS.map((c) => <option key={c.value} value={c.value} style={{ color: c.value, fontWeight: 'bold' }}>{c.label}</option>)}
              </select>
            </FormField>

            <FormField label="Attachment URL">
              <input type="text" className="input" value={form.attachment} onChange={(e) => setForm(prev => ({ ...prev, attachment: e.target.value }))} placeholder="https://..." />
            </FormField>

            <FormField label="Priority">
              <select className="input" value={form.priority} onChange={(e) => setForm(prev => ({ ...prev, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </FormField>
            
            <FormField label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value }))}>
                {['draft', 'planned', 'shoot_scheduled', 'shot', 'editing', 'internal_review', 'client_review', 'approved', 'scheduled', 'published'].map((status) => (
                  <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Description / Caption notes">
            <textarea className="input min-h-20 text-xs" value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Add captions, notes..." />
          </FormField>

          <div className="flex justify-between items-center border-t border-surface-border pt-4 mt-4">
            {editingItem ? (
              <Button type="button" variant="secondary" className="hover:bg-red-50 hover:text-red-600 text-gray-500" onClick={() => deleteMutation.mutate(editingItem.id)}>
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete
              </Button>
            ) : <div />}
            
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
              <Button type="submit" loading={createMutation.isLoading || updateMutation.isLoading}>
                {editingItem ? 'Save Updates' : 'Schedule'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}

/* Month view manual calendar subcomponent */
function ContentMonthView({ days, items, onOpen, onCreateAt, onDuplicate, parseEventDate }) {
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-surface-border bg-slate-50/50 text-center text-xs font-semibold uppercase text-gray-500 dark:border-gray-800 dark:bg-black dark:text-gray-400">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="p-3">{day}</div>)}
      </div>

      <div className="grid grid-cols-7 divide-x divide-y divide-surface-border dark:divide-gray-800">
        {days.map((day) => {
          const dayItems = items.filter((item) => {
            const date = parseEventDate(item.start_date || item.publish_date || item.due_date)
            return date && isSameDay(date, day)
          })
          
          return (
            <div
              key={timeService.toUtcISOString(day)}
              onClick={() => onCreateAt(day)}
              className="min-h-32 p-1.5 text-left transition-colors flex flex-col justify-between hover:bg-slate-50 dark:hover:bg-gray-900/40 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{format(day, 'd')}</span>
                <Plus className="h-3.5 w-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
                {dayItems.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen(item)
                    }}
                    style={{ borderLeftColor: item.color || '#3B82F6' }}
                    className="w-full text-left truncate rounded-lg p-1 text-[10px] font-semibold border border-l-4 border-surface-border bg-white shadow-xs dark:bg-gray-950 dark:border-gray-800 hover:brightness-95 flex items-center justify-between group/card"
                  >
                    <span className="truncate flex-1">{item.title}</span>
                    <button
                      type="button"
                      title="Duplicate"
                      onClick={(e) => onDuplicate(e, item)}
                      className="hidden group-hover/card:inline-flex h-4 w-4 items-center justify-center text-slate-400 hover:text-slate-600 rounded"
                    >
                      <Copy className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {dayItems.length > 3 && (
                  <span className="text-[9px] font-bold text-primary-600 pl-1">+{dayItems.length - 3} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* Week view manual calendar subcomponent */
function ContentWeekView({ days, items, onOpen, onDuplicate, parseEventDate }) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[700px] grid-cols-7 divide-x divide-surface-border bg-slate-50/50 border-b border-surface-border dark:divide-gray-800 dark:bg-black dark:border-gray-800 text-center">
        {days.map((day) => (
          <div key={timeService.toUtcISOString(day)} className="p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase">{format(day, 'EEE')}</p>
            <p className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{format(day, 'd')}</p>
          </div>
        ))}
      </div>

      <div className="grid min-w-[700px] grid-cols-7 divide-x divide-surface-border dark:divide-gray-800 min-h-[450px]">
        {days.map((day) => {
          const dayItems = items.filter((item) => {
            const date = parseEventDate(item.start_date || item.publish_date || item.due_date)
            return date && isSameDay(date, day)
          })

          return (
            <div key={timeService.toUtcISOString(day)} className="p-2 space-y-2 bg-white dark:bg-black">
              {dayItems.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[10px] text-gray-300 dark:text-gray-700 italic select-none py-10">
                  No Content
                </div>
              ) : (
                dayItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onOpen(item)}
                    style={{ borderLeftColor: item.color || '#3B82F6' }}
                    className="w-full text-left rounded-xl p-2.5 text-xs shadow-xs border border-l-4 border-surface-border hover:shadow-md cursor-pointer group bg-slate-50 dark:bg-gray-900/40 dark:border-gray-800"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="block font-bold truncate flex-1">{item.title}</span>
                      <button
                        type="button"
                        onClick={(e) => onDuplicate(e, item)}
                        className="hidden group-hover:inline-flex text-slate-400 hover:text-slate-600"
                        title="Duplicate"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500 font-medium">{item.platform} · {item.category}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <Badge label={String(item.status).replace(/_/g, ' ')} colorKey={item.status || 'draft'} />
                      {item.time && <span className="text-[9px] text-slate-400 font-semibold">{item.time}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* Day view manual calendar subcomponent */
function ContentDayView({ day, items, onOpen, onDuplicate, parseEventDate }) {
  const dayItems = items.filter((item) => {
    const date = parseEventDate(item.start_date || item.publish_date || item.due_date)
    return date && isSameDay(date, day)
  })

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 border-b border-surface-border pb-3 dark:border-gray-800">
        <span className="h-10 w-10 bg-primary-50 rounded-full flex items-center justify-center text-primary-600 font-bold dark:bg-primary-950/30">
          {format(day, 'd')}
        </span>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100">{format(day, 'EEEE')}</h3>
          <p className="text-xs text-gray-500">{format(day, 'MMMM yyyy')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {dayItems.length === 0 ? (
          <div className="col-span-full py-12 text-center text-sm text-gray-400 dark:text-gray-600 italic">
            No scheduled content for this day.
          </div>
        ) : (
          dayItems.map((item) => (
            <div
              key={item.id}
              onClick={() => onOpen(item)}
              style={{ borderLeftColor: item.color || '#3B82F6' }}
              className="text-left rounded-2xl p-4 border border-l-4 border-surface-border hover:shadow-md cursor-pointer group bg-slate-50 dark:bg-gray-900/40 dark:border-gray-800 flex flex-col justify-between space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-bold text-sm block">{item.title}</span>
                  <span className="text-[10px] text-gray-500 font-medium block mt-0.5">{item.platform} · {item.category}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => onDuplicate(e, item)}
                    className="text-slate-400 hover:text-slate-600 hidden group-hover:inline-flex"
                    title="Duplicate"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <Badge label={String(item.status).replace(/_/g, ' ')} colorKey={item.status || 'draft'} />
                </div>
              </div>

              {item.description && (
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">{item.description}</p>
              )}

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100 dark:border-gray-800">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {item.assigned_person || 'Unassigned'}
                </span>
                
                {item.reminder && item.reminder !== 'none' && (
                  <span className="flex items-center gap-1 text-primary-500 font-semibold">
                    <Bell className="h-3 w-3 animate-swing" />
                    Reminder
                  </span>
                )}
                
                {item.time && (
                  <span className="font-bold">{item.time}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
