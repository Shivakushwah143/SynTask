import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { Clock } from 'lucide-react'
import { timesheetApi } from '../api/timesheet'
import { Badge, Button, EmptyState, FormField, inputClassName, LoadingSpinner, PageHeader, Table } from '../components/ui'
import { asArray, formatDate, toFormData } from './phase4Utils'

export default function Timesheet() {
  const queryClient = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ date: today, hours_spent_today: 1, miscellaneous_description: 'General work', is_miscellaneous: true })
  const mine = useQuery('my-timesheet', timesheetApi.getMine)
  const entries = asArray(mine.data, ['entries', 'timesheet'])
  const create = useMutation((payload) => timesheetApi.createEntry(toFormData(payload)), { onSuccess: () => { toast.success('Timesheet saved'); queryClient.invalidateQueries('my-timesheet') } })
  const columns = [
    { key: 'date', header: 'Date', render: (row) => formatDate(row.date) },
    { key: 'project_name', header: 'Project', render: (row) => row.project_name || row.miscellaneous_description || row.meeting_title || '-' },
    { key: 'task_title', header: 'Task', render: (row) => row.task_title || '-' },
    { key: 'hours_spent_today', header: 'Hours', render: (row) => row.hours_spent_today || row.hours_spent || 0 },
    { key: 'status', header: 'Status', render: (row) => <Badge label={row.status || 'draft'} colorKey={row.status || 'draft'} /> },
  ]
  return (
    <div className="p-6">
      <PageHeader title="Timesheet" description="Log weekly work and review approval status." />
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-4 font-semibold text-gray-900">Quick entry</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {Object.keys(form).map((key) => <FormField key={key} label={key.replaceAll('_', ' ')}><input className={inputClassName} value={form[key]} onChange={(event) => setForm((state) => ({ ...state, [key]: event.target.value }))} /></FormField>)}
        </div>
        <Button className="mt-4" loading={create.isLoading} onClick={() => create.mutate(form)}>Save Hours</Button>
      </section>
      {mine.isLoading ? <LoadingSpinner label="Loading timesheet" /> : entries.length ? <Table columns={columns} data={entries} /> : <EmptyState icon={Clock} title="No timesheet entries" description="Log hours to build your weekly timesheet." />}
    </div>
  )
}
