import { useCallback, useEffect, useMemo, useState } from 'react'
import { ClipboardList, Plus, RefreshCw, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { workRequestsAPI } from '../api/workRequests'
import { PageHeader, Button, EmptyState, Modal } from '../components/ui'
import { inputClassName } from '../components/ui'
import { timeService } from '../services/timeService'

const REQUEST_TYPES = [
  ['new_work', 'New Work'],
  ['change_request', 'Change Request'],
  ['approval_request', 'Approval'],
  ['deadline_extension', 'Deadline Extension'],
  ['resource_request', 'Resource'],
  ['blocker', 'Blocker'],
  ['leave_availability', 'Leave / Availability'],
  ['client_request', 'Client Request'],
  ['other', 'Other'],
]

const STATUS_LABELS = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  converted: 'Converted',
  cancelled: 'Cancelled',
}

const tone = {
  submitted: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200',
  converted: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
}

function Badge({ value }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${tone[value] || tone.submitted}`}>{STATUS_LABELS[value] || value}</span>
}

export default function WorkRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ type: 'new_work', title: '', description: '', priority: 'medium' })

  const filters = useMemo(() => ({ search, status }), [search, status])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await workRequestsAPI.list(filters)
      setRequests(data.requests || [])
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not load work requests')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { void load() }, [load])

  const createRequest = async (event) => {
    event.preventDefault()
    try {
      await workRequestsAPI.create(form)
      toast.success('Work request submitted')
      setShowCreate(false)
      setForm({ type: 'new_work', title: '', description: '', priority: 'medium' })
      await load()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not submit request')
    }
  }

  const runAction = async (request, action) => {
    try {
      if (action === 'start_review') await workRequestsAPI.startReview(request.id)
      if (action === 'approve') await workRequestsAPI.approve(request.id)
      if (action === 'reject') {
        const reason = window.prompt('Reason')
        if (!reason) return
        await workRequestsAPI.reject(request.id, reason)
      }
      if (action === 'cancel') await workRequestsAPI.cancel(request.id)
      if (action === 'convert_to_task') await workRequestsAPI.convert(request.id, { target: 'task', task: {} })
      toast.success('Request updated')
      await load()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Action failed')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Requests"
        description="Review, approve, and convert operational requests without mixing them with support tickets."
        action={<Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New Request</Button>}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 md:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input className={`${inputClassName} pl-9`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search requests" />
        </div>
        <select className={inputClassName} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Button variant="secondary" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        {loading ? (
          <div className="p-6 text-sm text-gray-500">Loading...</div>
        ) : requests.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No work requests" description="Submitted requests will appear here." />
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-950/60">
              <tr>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Related</th>
                <th className="px-4 py-3">Reviewer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {requests.map((request) => (
                <tr key={request.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 dark:text-white">{request.request_id}</div>
                    <div className="text-gray-600 dark:text-gray-300">{request.title}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{String(request.type).replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{request.project_id || request.task_id || request.client_id || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{request.assigned_reviewer_id || '-'}</td>
                  <td className="px-4 py-3"><Badge value={request.status} /></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{timeService.formatShortDateTime?.(request.updated_at) || request.updated_at}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {(request.allowed_actions || []).slice(0, 4).map((action) => (
                        <Button key={action} size="sm" variant="secondary" onClick={() => runAction(request, action)}>
                          {action.replace(/_/g, ' ')}
                        </Button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Work Request">
        <form className="space-y-4" onSubmit={createRequest}>
          <select className={inputClassName} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            {REQUEST_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input className={inputClassName} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Title" required />
          <textarea className={inputClassName} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Description / reason" required rows={4} />
          <select className={inputClassName} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
            {['low', 'medium', 'high', 'critical'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit">Submit</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
