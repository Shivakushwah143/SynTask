import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { Clock } from 'lucide-react'
import { timesheetApi } from '../api/timesheet'
import { Badge, Button, EmptyState, FormField, inputClassName, PageHeader, SkeletonTable, Table } from '../components/ui'
import { asArray, formatDate, toFormData } from './phase4Utils'

export default function Timesheet() {
  const queryClient = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ date: today, hours_spent_today: 1, miscellaneous_description: 'General work', is_miscellaneous: true })
  const [errors, setErrors] = useState({})
  const mine = useQuery('my-timesheet', timesheetApi.getMine)
  const entries = asArray(mine.data, ['entries', 'timesheet'])
  const create = useMutation((payload) => timesheetApi.createEntry(toFormData(payload)), { onSuccess: () => { toast.success('Timesheet saved'); queryClient.invalidateQueries('my-timesheet') } })
  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))
  const validate = () => {
    const nextErrors = {}
    if (!form.date) nextErrors.date = 'Date is required'
    if (!form.hours_spent_today || Number(form.hours_spent_today) <= 0) nextErrors.hours_spent_today = 'Hours must be greater than 0'
    if (form.is_miscellaneous && !form.miscellaneous_description.trim()) nextErrors.miscellaneous_description = 'Description is required'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }
  const submit = () => {
    if (!validate()) return
    create.mutate(form)
  }
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
          <FormField label="Date" required error={errors.date}>
            <input className={inputClassName} type="date" value={form.date} onChange={(event) => update('date', event.target.value)} aria-invalid={Boolean(errors.date)} />
          </FormField>
          <FormField label="Hours" required error={errors.hours_spent_today}>
            <input className={inputClassName} type="number" min="0.25" step="0.25" value={form.hours_spent_today} onChange={(event) => update('hours_spent_today', event.target.value)} aria-invalid={Boolean(errors.hours_spent_today)} />
          </FormField>
          <FormField label="Description" required={form.is_miscellaneous} error={errors.miscellaneous_description}>
            <input className={inputClassName} value={form.miscellaneous_description} onChange={(event) => update('miscellaneous_description', event.target.value)} aria-invalid={Boolean(errors.miscellaneous_description)} />
          </FormField>
          <label className="flex min-h-[42px] items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm text-gray-700">
            <input type="checkbox" checked={form.is_miscellaneous} onChange={(event) => update('is_miscellaneous', event.target.checked)} />
            Miscellaneous work
          </label>
        </div>
        <Button className="mt-4" loading={create.isLoading} onClick={submit}>Save Hours</Button>
      </section>
      {mine.isLoading ? <SkeletonTable rows={6} cols={5} /> : entries.length ? <Table columns={columns} data={entries} /> : <EmptyState icon={Clock} title="No timesheet entries" description="Log hours to build your weekly timesheet." />}
    </div>
  )
}
