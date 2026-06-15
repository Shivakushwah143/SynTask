import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { CalendarDays, Video } from 'lucide-react'
import { meetingsApi } from '../api/meetings'
import { Badge, Button, EmptyState, FormField, inputClassName, LoadingSpinner, Modal, PageHeader, Table } from '../components/ui'
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
      {isLoading ? <LoadingSpinner label="Loading meetings" /> : isError ? <EmptyState icon={CalendarDays} title="Could not load meetings" /> : meetings.length ? <Table columns={columns} data={meetings} /> : <EmptyState icon={CalendarDays} title="No meetings scheduled" description="Create a meeting to coordinate work." action={<Button onClick={() => setOpen(true)}>Create Meeting</Button>} />}
      <MeetingModal isOpen={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); queryClient.invalidateQueries('meetings') }} />
    </div>
  )
}

function MeetingModal({ isOpen, onClose, onDone }) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [form, setForm] = useState({ title: '', description: '', meeting_date: tomorrow, meeting_time: '10:00', duration: 30, participant_ids: '' })
  const mutation = useMutation((payload) => meetingsApi.create(toFormData(payload)), { onSuccess: () => { toast.success('Meeting created'); onDone() } })
  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create meeting">
      <div className="grid gap-4 sm:grid-cols-2">
        {Object.keys(form).map((key) => <FormField key={key} label={key.replace('_', ' ')}><input className={inputClassName} value={form[key]} onChange={(event) => update(key, event.target.value)} /></FormField>)}
      </div>
      <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={mutation.isLoading} onClick={() => mutation.mutate(form)}>Save</Button></div>
    </Modal>
  )
}
