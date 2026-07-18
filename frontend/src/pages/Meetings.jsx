import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { CalendarDays, Video, FileText, CheckSquare, Target, Users, Mail } from 'lucide-react'
import { meetingsApi } from '../api/meetings'
import { usersAPI } from '../api/users'
import { Badge, Button, EmptyState, FormField, Modal, PageHeader, SkeletonTable, Table, inputClassName } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { buildMeetingParticipantOptions, filterMeetingParticipantOptions, toggleMeetingParticipantId, validateMeetingDuration } from './Meetings.helpers'
import { asArray, formatDateTime, toFormData } from './phase4Utils'
import { EmailComposer } from '../components/EmailComposer'
import { ROLE, normalizeRole } from '../utils/roles'

export default function Meetings() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [selectedMeetingId, setSelectedMeetingId] = useState(null)
  const { data, isLoading, isError } = useQuery('meetings', () => meetingsApi.list({ limit: 100 }))
  const meetings = asArray(data, ['meetings'])
  const selected = meetings.find((meeting) => meeting.id === selectedMeetingId) || meetings[0] || null

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
    { key: 'title', header: 'Title' },
    { key: 'meeting_date', header: 'Date', render: (row) => formatDateTime(row.meeting_date) },
    { key: 'duration', header: 'Duration', render: (row) => `${row.duration || 30} min` },
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
            className="font-medium text-primary-700 hover:underline dark:text-primary-300"
          >
            Join meeting
          </button>
        ) : (
          'Not configured'
        )
      },
    },
  ], [openJoinLink])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meetings"
        description="Agenda, notes, decisions, and action items in one view."
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => setComposerOpen(true)}>
              <Mail className="h-4 w-4" />
              Send Email
            </Button>
            <Button onClick={() => setOpen(true)}><Video className="h-4 w-4" /> New Meeting</Button>
          </div>
        )}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <div className="card p-4"><p className="text-xs uppercase tracking-[0.18em] text-gray-500">Agenda</p><p className="mt-2 text-2xl font-semibold">{meetings.length}</p></div>
        <div className="card p-4"><p className="text-xs uppercase tracking-[0.18em] text-gray-500">Notes</p><p className="mt-2 text-2xl font-semibold">{meetings.filter((item) => item.description).length}</p></div>
        <div className="card p-4"><p className="text-xs uppercase tracking-[0.18em] text-gray-500">Decisions</p><p className="mt-2 text-2xl font-semibold">{meetings.filter((item) => item.decisions).length}</p></div>
        <div className="card p-4"><p className="text-xs uppercase tracking-[0.18em] text-gray-500">Action items</p><p className="mt-2 text-2xl font-semibold">{meetings.filter((item) => item.action_items).length}</p></div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="card overflow-hidden p-0">
          {isLoading ? <div className="p-4"><SkeletonTable rows={6} cols={5} /></div> : isError ? <div className="p-4"><EmptyState icon={CalendarDays} title="Could not load meetings" /></div> : meetings.length ? <Table columns={columns} data={meetings} onRowClick={(row) => setSelectedMeetingId(row.id)} /> : <div className="p-4"><EmptyState icon={CalendarDays} title="No meetings scheduled" description="Create a meeting to coordinate work." action={<Button onClick={() => setOpen(true)}>Create Meeting</Button>} /></div>}
        </div>

        <aside className="card p-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Meeting focus</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Notes, decisions, action items, and related projects.</p>
          <div className="mt-4 space-y-3">
            {selected ? (
              <>
                <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-500">Selected</div>
                  <div className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.title}</div>
                </div>
                <DetailBlock icon={FileText} title="Notes" value={selected.description || 'No notes captured.'} />
                <DetailBlock icon={Target} title="Decisions" value={selected.decisions || 'No decisions captured.'} />
                <DetailBlock icon={CheckSquare} title="Action items" value={selected.action_items || 'No action items captured.'} />
                <DetailBlock icon={Users} title="Related projects" value={selected.project_name || selected.project?.name || 'No related project linked.'} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" onClick={() => openJoinLink(selected)}>
                    Join meeting
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setComposerOpen(true)}>
                    Send follow-up
                  </Button>
                </div>
                {canManageSelected ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selected.status !== 'ongoing' && selected.status !== 'completed' && selected.status !== 'cancelled' ? (
                      <Button type="button" variant="secondary" loading={meetingActionMutation.isLoading} onClick={() => meetingActionMutation.mutate({ action: 'start', meetingId: selected.id })}>
                        Start
                      </Button>
                    ) : null}
                    {selected.status !== 'completed' && selected.status !== 'cancelled' ? (
                      <Button type="button" variant="secondary" loading={meetingActionMutation.isLoading} onClick={() => meetingActionMutation.mutate({ action: 'complete', meetingId: selected.id })}>
                        Complete
                      </Button>
                    ) : null}
                    {selected.status !== 'cancelled' && selected.status !== 'completed' ? (
                      <Button type="button" variant="secondary" loading={meetingActionMutation.isLoading} onClick={() => meetingActionMutation.mutate({ action: 'cancel', meetingId: selected.id })}>
                        Cancel
                      </Button>
                    ) : null}
                    <Button type="button" variant="danger" loading={meetingActionMutation.isLoading} onClick={() => meetingActionMutation.mutate({ action: 'delete', meetingId: selected.id })}>
                      Delete
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState icon={Video} title="Select a meeting" description="Pick a row to inspect notes and action items." />
            )}
          </div>
        </aside>
      </section>

      <MeetingModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onDone={() => {
          setOpen(false)
          queryClient.invalidateQueries('meetings')
        }}
      />
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
    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
        <Icon className="h-4 w-4 text-primary-600" />
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{value}</p>
    </div>
  )
}

function MeetingModal({ isOpen, onClose, onDone }) {
  const { user } = useAuthStore()
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
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
      title="Create meeting"
      description="Capture the core details first, then add participants and notes."
      size="lg"
      footer={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isLoading} onClick={submit}>Save meeting</Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-gray-200/80 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-950/50">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Schedule</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">Set the meeting title, date, time, and duration.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField label="Title" required error={errors.title} helperText="Use a short, scannable title.">
              <input className={inputClassName} value={form.title} onChange={(event) => update('title', event.target.value)} aria-invalid={Boolean(errors.title)} />
            </FormField>
            <FormField label="Date" required error={errors.meeting_date}>
              <input className={inputClassName} type="date" value={form.meeting_date} onChange={(event) => update('meeting_date', event.target.value)} aria-invalid={Boolean(errors.meeting_date)} />
            </FormField>
            <FormField label="Time" required error={errors.meeting_time}>
              <input className={inputClassName} type="time" value={form.meeting_time} onChange={(event) => update('meeting_time', event.target.value)} aria-invalid={Boolean(errors.meeting_time)} />
            </FormField>
            <FormField label="Duration minutes" required error={errors.duration} helperText="1 to 60 minutes.">
              <input className={inputClassName} type="number" min="1" max="60" value={form.duration} onChange={(event) => update('duration', event.target.value)} aria-invalid={Boolean(errors.duration)} />
            </FormField>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Participants and notes</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">Add attendees and capture the discussion summary.</p>
          <div className="mt-4 grid gap-4">
            <FormField label="Participants" helperText="Select junior team members available to you.">
              <div className="max-h-52 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50/70 p-2 dark:border-gray-800 dark:bg-gray-950/40">
                <input
                  className={`${inputClassName} mb-2`}
                  value={participantSearch}
                  onChange={(event) => setParticipantSearch(event.target.value)}
                  placeholder="Search participants by name"
                />
                {isLoadingUsers ? (
                  <p className="px-2 py-3 text-sm text-gray-500 dark:text-gray-400">Loading people...</p>
                ) : visibleParticipantOptions.length ? (
                  <div className="space-y-1">
                    {visibleParticipantOptions.map((option) => (
                      <label key={option.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-white dark:hover:bg-gray-900">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          checked={form.participant_ids.includes(option.id)}
                          onChange={() => update('participant_ids', toggleMeetingParticipantId(form.participant_ids, option.id))}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-gray-900 dark:text-gray-100">{option.label}</span>
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
              <textarea className={inputClassName} rows="4" value={form.description} onChange={(event) => update('description', event.target.value)} />
            </FormField>
          </div>
        </section>
      </div>
    </Modal>
  )
}
