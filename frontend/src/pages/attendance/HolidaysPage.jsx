import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Plus, Pencil, Trash2, AlertCircle, RefreshCw, X, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { attendanceAPI } from '../../api/attendance'
import { Button, Modal, PageHeader, Skeleton } from '../../components/ui'

const HolidaysPage = () => {
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingHoliday, setEditingHoliday] = useState(null)
  const [form, setForm] = useState({ name: '', date: '', description: '', location: '' })
  const [submitting, setSubmitting] = useState(false)
  const [currentYear] = useState(() => new Date().getFullYear())

  const loadHolidays = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await attendanceAPI.getHolidays(currentYear)
      setHolidays(res.data || [])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load holidays')
    } finally {
      setLoading(false)
    }
  }, [currentYear])

  useEffect(() => {
    loadHolidays()
  }, [loadHolidays])

  const openCreate = () => {
    setEditingHoliday(null)
    setForm({ name: '', date: '', description: '', location: '' })
    setShowForm(true)
  }

  const openEdit = (holiday) => {
    setEditingHoliday(holiday)
    setForm({
      name: holiday.name,
      date: holiday.date ? new Date(holiday.date).toISOString().split('T')[0] : '',
      description: holiday.description || '',
      location: holiday.location || '',
    })
    setShowForm(true)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Holiday name is required')
      return
    }
    if (!form.date) {
      toast.error('Holiday date is required')
      return
    }
    try {
      setSubmitting(true)
      const payload = {
        name: form.name.trim(),
        date: form.date,
        description: form.description.trim(),
        location: form.location.trim() || null,
      }
      if (editingHoliday) {
        await attendanceAPI.updateHoliday(editingHoliday.id, payload)
        toast.success('Holiday updated')
      } else {
        await attendanceAPI.createHoliday(payload)
        toast.success('Holiday created')
      }
      setShowForm(false)
      loadHolidays()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save holiday')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (holiday) => {
    if (!confirm(`Deactivate holiday "${holiday.name}"?`)) return
    try {
      await attendanceAPI.deleteHoliday(holiday.id)
      toast.success('Holiday deactivated')
      loadHolidays()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to deactivate holiday')
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Holidays" description="Manage company holiday calendar." />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <PageHeader title="Holidays" description="Manage company holiday calendar." />
        <div className="rounded-lg border border-red-200 bg-white p-5 dark:border-red-900/60 dark:bg-gray-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Could not load holidays</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{error}</p>
              <Button className="mt-4" variant="secondary" onClick={loadHolidays}>
                <RefreshCw className="h-4 w-4" /> Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="Holidays"
        description="Manage company holiday calendar. Holidays affect attendance status and payroll."
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Holiday
          </Button>
        }
      />

      {holidays.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-800">
          <CalendarDays className="mx-auto h-10 w-10 text-gray-400" />
          <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-white">No holidays configured</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Add company holidays for {currentYear}.</p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add First Holiday
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {holidays.map((holiday) => (
                  <tr key={holiday.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{holiday.name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(holiday.date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {holiday.description || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        holiday.active
                          ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {holiday.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => openEdit(holiday)} className="mr-2 text-gray-400 hover:text-indigo-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(holiday)} className="text-gray-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editingHoliday ? 'Edit Holiday' : 'Add Holiday'}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Holiday Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Independence Day"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Date *</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Location (optional)</label>
            <input
              type="text"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="e.g. All offices"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting} loadingText="Saving...">
              {editingHoliday ? 'Update' : 'Create'} Holiday
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default HolidaysPage
