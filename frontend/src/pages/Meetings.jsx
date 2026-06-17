import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { CalendarDays, Video } from 'lucide-react'
import { meetingsApi } from '../api/meetings'
import { Badge, Button, EmptyState, FormField, inputClassName, Modal, PageHeader, SkeletonTable, Table } from '../components/ui'
import { asArray, formatDateTime, toFormData } from './phase4Utils'

export default function Meetings() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError } = useQuery('meetings', () => meetingsApi.list({ limit: 50 }))
  const meetings = asArray(data, ['meetings'])
  const columns = [
    { key: 'title', header: 'Title' },
    { key: 'meeting_date', header: 'Date', render: (row) => formatDateTime(row.meeting_date) },
    { key: 'duration', header: 'Duration', render: (row) => `${row.duration || 30} min` },
    { key: 'status', header: 'Status', render: (row) => <Badge label={row.status || 'scheduled'} colorKey={row.status || 'scheduled'} /> },
    { key: 'zoom', header: 'Zoom', render: (row) => row.join_url ? <a className="text-primary-700" href={row.join_url} target="_blank" rel="noreferrer">Join Zoom</a> : 'Not configured' },
  ]
  return (
    <div className="p-6">
      <PageHeader title="Meetings" description="Schedule and track internal meetings." actions={<Button onClick={() => setOpen(true)}><Video className="h-4 w-4" /> New Meeting</Button>} />
      {isLoading ? <SkeletonTable rows={6} cols={5} /> : isError ? <EmptyState icon={CalendarDays} title="Could not load meetings" /> : meetings.length ? <Table columns={columns} data={meetings} /> : <EmptyState icon={CalendarDays} title="No meetings scheduled" description="Create a meeting to coordinate work." action={<Button onClick={() => setOpen(true)}>Create Meeting</Button>} />}
      <MeetingModal isOpen={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); queryClient.invalidateQueries('meetings') }} />
    </div>
  )
}

function MeetingModal({ isOpen, onClose, onDone }) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [form, setForm] = useState({ title: '', description: '', meeting_date: tomorrow, meeting_time: '10:00', duration: 30, participant_ids: '' })
  const [errors, setErrors] = useState({})
  const mutation = useMutation((payload) => meetingsApi.create(toFormData(payload)), { onSuccess: () => { toast.success('Meeting created'); onDone() } })
  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))
  const validate = () => {
    const nextErrors = {}
    if (!form.title.trim()) nextErrors.title = 'Title is required'
    if (!form.meeting_date) nextErrors.meeting_date = 'Meeting date is required'
    if (!form.meeting_time) nextErrors.meeting_time = 'Meeting time is required'
    if (!form.duration || Number(form.duration) < 1) nextErrors.duration = 'Duration must be at least 1 minute'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }
  const submit = () => {
    if (!validate()) return
    mutation.mutate(form)
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create meeting">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Title" required error={errors.title}>
          <input className={inputClassName} value={form.title} onChange={(event) => update('title', event.target.value)} aria-invalid={Boolean(errors.title)} />
        </FormField>
        <FormField label="Date" required error={errors.meeting_date}>
          <input className={inputClassName} type="date" value={form.meeting_date} onChange={(event) => update('meeting_date', event.target.value)} aria-invalid={Boolean(errors.meeting_date)} />
        </FormField>
        <FormField label="Time" required error={errors.meeting_time}>
          <input className={inputClassName} type="time" value={form.meeting_time} onChange={(event) => update('meeting_time', event.target.value)} aria-invalid={Boolean(errors.meeting_time)} />
        </FormField>
        <FormField label="Duration minutes" required error={errors.duration}>
          <input className={inputClassName} type="number" min="1" value={form.duration} onChange={(event) => update('duration', event.target.value)} aria-invalid={Boolean(errors.duration)} />
        </FormField>
        <FormField label="Participant IDs">
          <input className={inputClassName} value={form.participant_ids} onChange={(event) => update('participant_ids', event.target.value)} placeholder="Comma-separated user IDs" />
        </FormField>
        <FormField label="Description">
          <textarea className={inputClassName} rows="3" value={form.description} onChange={(event) => update('description', event.target.value)} />
        </FormField>
      </div>
      <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={mutation.isLoading} onClick={submit}>Save</Button></div>
    </Modal>
  )
}
