import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { CalendarDays, Video, FileText, CheckSquare, Target, Users, Mail, Clock, Calendar, User, Link, ExternalLink, Plus, Zap, Award, TrendingUp } from 'lucide-react'
import { meetingsApi } from '../api/meetings'
import { usersAPI } from '../api/users'
import { Badge, Button, EmptyState, FormField, Modal, PageHeader, SkeletonTable, Table, inputClassName } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { buildMeetingParticipantOptions, filterMeetingParticipantOptions, toggleMeetingParticipantId, validateMeetingDuration } from './Meetings.helpers'
import { asArray, formatDateTime, toFormData } from './phase4Utils'
import { EmailComposer } from '../components/EmailComposer'
import { ROLE, normalizeRole } from '../utils/roles'
import { timeService } from '@/services/timeService'

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

export default function Meetings() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [selectedMeetingId, setSelectedMeetingId] = useState(null)
  const { data, isLoading, isError } = useQuery('meetings', () => meetingsApi.list({ limit: 100 }))
  const meetings = asArray(data, ['meetings'])
  const selected = meetings.find((meeting) => meeting.id === selectedMeetingId) || meetings[0] || null

  // Calculate stats
  const totalMeetings = meetings.length
  const withNotes = meetings.filter((item) => item.description).length
  const withDecisions = meetings.filter((item) => item.decisions).length
  const withActionItems = meetings.filter((item) => item.action_items).length

  const getJoinLink = (row) => row.zoom_meeting_url || row.join_url || row.meeting_link || row.zoom_start_url || ''
  const openJoinLink = useCallback((row) => {
    const url = getJoinLink(row)
    if (!url) {
      toast.error('No join link configured for this meeting')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])
  const meetingActionMutation = useMutation(
    ({ action, meetingId }) => meetingsApi[action](meetingId),
    {
      onSuccess: () => {
        toast.success('Meeting updated')
        queryClient.invalidateQueries('meetings')
      },
      onError: (error) => toast.error(error?.response?.data?.detail || 'Could not update meeting'),
    }
  )
  const canManageSelected = selected && (
    String(selected.host?.id || selected.host_id || '') === String(user?.id || user?._id || '') ||
    [ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(normalizeRole(user?.role))
  )

  const columns = useMemo(() => [
    { key: 'title', header: 'Title', render: (row) => (
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-indigo-500" />
        <span className="font-medium text-gray-900 dark:text-white">{row.title}</span>
      </div>
    )},
    { key: 'meeting_date', header: 'Date', render: (row) => (
      <div className="flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-gray-600 dark:text-gray-400">{formatDateTime(row.meeting_date)}</span>
      </div>
    )},
    { key: 'duration', header: 'Duration', render: (row) => (
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-gray-400" />
        <span className="text-gray-600 dark:text-gray-400">{row.duration || 30} min</span>
      </div>
    )},
    { key: 'status', header: 'Status', render: (row) => <Badge label={row.status || 'scheduled'} colorKey={row.status || 'scheduled'} /> },
    {
      key: 'join',
      header: 'Join',
      render: (row) => {
        const joinLink = getJoinLink(row)
        return joinLink ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              openJoinLink(row)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Join
          </button>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">Not configured</span>
        )
      },
    },
  ], [openJoinLink])

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <Video className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Meetings</h1>
                <p className="mt-1 text-indigo-100">Agenda, notes, decisions, and action items in one view.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setComposerOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Mail className="h-4 w-4" />
                Send Email
              </button>
              <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Plus className="h-4 w-4" />
                New Meeting
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Meetings"
          value={totalMeetings}
          icon={Video}
          color="indigo"
          subtitle="All scheduled"
        />
        <StatCard
          label="With Notes"
          value={withNotes}
          icon={FileText}
          color="blue"
          subtitle="Have agenda/notes"
        />
        <StatCard
          label="Decisions"
          value={withDecisions}
          icon={Target}
          color="emerald"
          subtitle="Have decisions"
        />
        <StatCard
          label="Action Items"
          value={withActionItems}
          icon={CheckSquare}
          color="amber"
          subtitle="Have action items"
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Meetings Table */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <CalendarDays className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">All Meetings</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{meetings.length} meetings</p>
              </div>
            </div>
          </div>

          <div className="p-4">
            {isLoading ? (
              <div className="p-2"><SkeletonTable rows={6} cols={5} /></div>
            ) : isError ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-900/30">
                  <CalendarDays className="h-8 w-8 text-rose-600 dark:text-rose-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Could not load meetings</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Please refresh the page or try again later.</p>
              </div>
            ) : meetings.length ? (
              <Table columns={columns} data={meetings} onRowClick={(row) => setSelectedMeetingId(row.id)} />
            ) : (
              <div className="py-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                  <Video className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">No meetings scheduled</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Create a meeting to coordinate work.</p>
                <button
                  onClick={() => setOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" />
                  Create Meeting
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Meeting Details */}
        <aside className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 bg-gradient-to-r from-purple-50/50 to-white p-4 dark:border-gray-700 dark:from-purple-950/20 dark:to-gray-800">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Meeting Focus</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Notes, decisions, action items</p>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {selected ? (
              <>
                <div className="rounded-xl border border-gray-200 bg-gradient-to-r from-indigo-50/30 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <Video className="h-3.5 w-3.5" />
                    Selected Meeting
                  </div>
                  <div className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{selected.title}</div>
                  <div className="mt-2 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDateTime(selected.meeting_date)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {selected.duration || 30} min
                    </span>
                  </div>
                </div>

                <DetailBlock icon={FileText} title="Notes" value={selected.description || 'No notes captured.'} />
                <DetailBlock icon={Target} title="Decisions" value={selected.decisions || 'No decisions captured.'} />
                <DetailBlock icon={CheckSquare} title="Action Items" value={selected.action_items || 'No action items captured.'} />
                <DetailBlock icon={Users} title="Related Projects" value={selected.project_name || selected.project?.name || 'No related project linked.'} />

                <div className="flex gap-2">
                  <Button type="button" onClick={() => openJoinLink(selected)} className="flex-1 gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Join
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setComposerOpen(true)} className="flex-1 gap-2">
                    <Mail className="h-4 w-4" />
                    Follow-up
                  </Button>
                </div>

                {canManageSelected && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selected.status !== 'ongoing' && selected.status !== 'completed' && selected.status !== 'cancelled' && (
                      <Button 
                        type="button" 
                        variant="secondary" 
                        loading={meetingActionMutation.isLoading} 
                        onClick={() => meetingActionMutation.mutate({ action: 'start', meetingId: selected.id })}
                        className="gap-2"
                      >
                        <Play className="h-4 w-4" />
                        Start
                      </Button>
                    )}
                    {selected.status !== 'completed' && selected.status !== 'cancelled' && (
                      <Button 
                        type="button" 
                        variant="secondary" 
                        loading={meetingActionMutation.isLoading} 
                        onClick={() => meetingActionMutation.mutate({ action: 'complete', meetingId: selected.id })}
                        className="gap-2"
                      >
                        <CheckSquare className="h-4 w-4" />
                        Complete
                      </Button>
                    )}
                    {selected.status !== 'cancelled' && selected.status !== 'completed' && (
                      <Button 
                        type="button" 
                        variant="secondary" 
                        loading={meetingActionMutation.isLoading} 
                        onClick={() => meetingActionMutation.mutate({ action: 'cancel', meetingId: selected.id })}
                        className="gap-2"
                      >
                        <XCircle className="h-4 w-4" />
                        Cancel
                      </Button>
                    )}
                    <Button 
                      type="button" 
                      variant="danger" 
                      loading={meetingActionMutation.isLoading} 
                      onClick={() => meetingActionMutation.mutate({ action: 'delete', meetingId: selected.id })}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                  <Video className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Select a meeting</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Pick a row to inspect notes and action items.</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Meeting Modal */}
      <MeetingModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onDone={() => {
          setOpen(false)
          queryClient.invalidateQueries('meetings')
        }}
      />

      {/* Email Composer */}
      <EmailComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialData={{
          subject: selected?.title ? `Meeting follow-up: ${selected.title}` : 'Meeting follow-up',
          html: '<p>Hello,</p><p></p>',
          text: 'Hello,',
          related_entity_type: 'meeting',
          related_entity_id: selected?.id || '',
          related_module: 'meetings',
        }}
      />
    </div>
  )
}

function DetailBlock({ icon: Icon, title, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 transition hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-900/30 dark:hover:border-indigo-700">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
        <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{value}</p>
    </div>
  )
}

// Import missing icons
import { Play, XCircle, Trash2 } from 'lucide-react'

function MeetingModal({ isOpen, onClose, onDone }) {
  const { user } = useAuthStore()
  const tomorrow = timeService.toUtcISOString(timeService.addDays(timeService.now(), 1)).slice(0, 10)
  const [form, setForm] = useState({ title: '', description: '', meeting_date: tomorrow, meeting_time: '10:00', duration: 30, participant_ids: [] })
  const [errors, setErrors] = useState({})
  const [participantSearch, setParticipantSearch] = useState('')
  const { data: usersData, isLoading: isLoadingUsers } = useQuery(
    ['meeting-participant-users', user?.id],
    () => usersAPI.getAssignableUsers(),
    { enabled: isOpen }
  )
  const participantOptions = useMemo(
    () => buildMeetingParticipantOptions(asArray(usersData, ['users']), user),
    [usersData, user]
  )
  const visibleParticipantOptions = useMemo(
    () => filterMeetingParticipantOptions(participantOptions, participantSearch),
    [participantOptions, participantSearch]
  )
  const mutation = useMutation((payload) => meetingsApi.create(toFormData(payload)), {
    onSuccess: () => {
      toast.success('Meeting created')
      onDone()
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Could not create meeting'),
  })

  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))

  const validate = () => {
    const nextErrors = {}
    if (!form.title.trim()) nextErrors.title = 'Title is required'
    if (!form.meeting_date) nextErrors.meeting_date = 'Meeting date is required'
    if (!form.meeting_time) nextErrors.meeting_time = 'Meeting time is required'
    const durationError = validateMeetingDuration(form.duration)
    if (durationError) nextErrors.duration = durationError
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const submit = () => {
    if (!validate()) return
    mutation.mutate({ ...form, participant_ids: form.participant_ids.join(',') })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Meeting"
      description="Capture the core details first, then add participants and notes."
      size="lg"
      footer={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isLoading} onClick={submit}>Save Meeting</Button>
        </div>
      )}
    >
      <div className="space-y-5">
        {/* Schedule Section */}
        <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
          <div className="flex items-center gap-2 mb-3">
            <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/30">
              <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Schedule</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Set the meeting title, date, time, and duration.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Title" required error={errors.title} helperText="Use a short, scannable title.">
              <input className={inputClassName} value={form.title} onChange={(event) => update('title', event.target.value)} aria-invalid={Boolean(errors.title)} placeholder="Weekly Sync" />
            </FormField>
            <FormField label="Date" required error={errors.meeting_date}>
              <input className={inputClassName} type="date" value={form.meeting_date} onChange={(event) => update('meeting_date', event.target.value)} aria-invalid={Boolean(errors.meeting_date)} />
            </FormField>
            <FormField label="Time" required error={errors.meeting_time}>
              <input className={inputClassName} type="time" value={form.meeting_time} onChange={(event) => update('meeting_time', event.target.value)} aria-invalid={Boolean(errors.meeting_time)} />
            </FormField>
            <FormField label="Duration (minutes)" required error={errors.duration} helperText="1 to 60 minutes.">
              <input className={inputClassName} type="number" min="1" max="60" value={form.duration} onChange={(event) => update('duration', event.target.value)} aria-invalid={Boolean(errors.duration)} />
            </FormField>
          </div>
        </div>

        {/* Participants & Notes Section */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2 mb-3">
            <div className="rounded-lg bg-purple-100 p-1.5 dark:bg-purple-900/30">
              <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Participants & Notes</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Add attendees and capture the discussion summary.</p>
            </div>
          </div>
          <div className="grid gap-4">
            <FormField label="Participants" helperText="Select junior team members available to you.">
              <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/70 p-2 dark:border-gray-600 dark:bg-gray-900/50">
                <input
                  className={`${inputClassName} mb-2 bg-white dark:bg-gray-800`}
                  value={participantSearch}
                  onChange={(event) => setParticipantSearch(event.target.value)}
                  placeholder="Search participants by name"
                />
                {isLoadingUsers ? (
                  <p className="px-2 py-3 text-sm text-gray-500 dark:text-gray-400">Loading people...</p>
                ) : visibleParticipantOptions.length ? (
                  <div className="space-y-1">
                    {visibleParticipantOptions.map((option) => (
                      <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-white dark:hover:bg-gray-800">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700"
                          checked={form.participant_ids.includes(option.id)}
                          onChange={() => update('participant_ids', toggleMeetingParticipantId(form.participant_ids, option.id))}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-gray-900 dark:text-white">{option.label}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">{option.roleLabel}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-3 text-sm text-gray-500 dark:text-gray-400">No junior employees available.</p>
                )}
              </div>
            </FormField>
            <FormField label="Description" helperText="Use this for agenda or recap notes.">
              <textarea className={`${inputClassName} min-h-24 resize-y`} rows="4" value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Meeting agenda or notes..." />
            </FormField>
          </div>
        </div>
      </div>
    </Modal>
  )
} 
