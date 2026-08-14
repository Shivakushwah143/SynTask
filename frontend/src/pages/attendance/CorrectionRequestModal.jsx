import { useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { attendanceAPI } from '../../api/attendance'
import { Button, Modal } from '../../components/ui'

const CORRECTION_TYPES = [
  { value: 'missing_check_in', label: 'Missing Check-In', description: 'Add a forgotten check-in time' },
  { value: 'missing_check_out', label: 'Missing Check-Out', description: 'Add a forgotten check-out time' },
  { value: 'change_check_in', label: 'Change Check-In', description: 'Correct the check-in time' },
  { value: 'change_check_out', label: 'Change Check-Out', description: 'Correct the check-out time' },
]

const CorrectionRequestModal = ({ isOpen, onClose, attendanceRecord, onSuccess }) => {
  const [form, setForm] = useState({
    correction_type: 'missing_check_out',
    attendance_date: '',
    requested_check_in: '',
    requested_check_out: '',
    reason: '',
  })
  const [submitting, setSubmitting] = useState(false)

  // Pre-fill from attendance record if available
  const dateValue = form.attendance_date || (attendanceRecord?.date || new Date().toISOString().split('T')[0])

  const handleSubmit = async () => {
    if (!form.reason.trim()) {
      toast.error('Please provide a reason for the correction')
      return
    }

    try {
      setSubmitting(true)
      const payload = {
        correction_type: form.correction_type,
        attendance_date: dateValue,
        reason: form.reason.trim(),
      }

      if (['missing_check_in', 'change_check_in'].includes(form.correction_type) && form.requested_check_in) {
        payload.requested_check_in = new Date(`${dateValue}T${form.requested_check_in}`).toISOString()
      }
      if (['missing_check_out', 'change_check_out'].includes(form.correction_type) && form.requested_check_out) {
        payload.requested_check_out = new Date(`${dateValue}T${form.requested_check_out}`).toISOString()
      }

      await attendanceAPI.requestCorrection(payload)
      toast.success('Correction request submitted')
      setForm({ correction_type: 'missing_check_out', attendance_date: '', requested_check_in: '', requested_check_out: '', reason: '' })
      onSuccess?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to submit correction request')
    } finally {
      setSubmitting(false)
    }
  }

  const needsCheckIn = ['missing_check_in', 'change_check_in'].includes(form.correction_type)
  const needsCheckOut = ['missing_check_out', 'change_check_out'].includes(form.correction_type)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Request Attendance Correction">
      <div className="space-y-4">
        {/* Current values display */}
        {attendanceRecord && (attendanceRecord.check_in_at || attendanceRecord.check_out_at) && (
          <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900/50">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Values</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Check-in: </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {attendanceRecord.check_in_at ? new Date(attendanceRecord.check_in_at).toLocaleTimeString() : 'Missing'}
                </span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Check-out: </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {attendanceRecord.check_out_at ? new Date(attendanceRecord.check_out_at).toLocaleTimeString() : 'Missing'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Attendance Date *</label>
          <input
            type="date"
            value={dateValue}
            onChange={(e) => setForm((f) => ({ ...f, attendance_date: e.target.value }))}
            max={new Date().toISOString().split('T')[0]}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Correction Type *</label>
          <select
            value={form.correction_type}
            onChange={(e) => setForm((f) => ({ ...f, correction_type: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            {CORRECTION_TYPES.map((ct) => (
              <option key={ct.value} value={ct.value}>{ct.label}</option>
            ))}
          </select>
        </div>

        {needsCheckIn && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Requested Check-In Time *</label>
            <input
              type="time"
              value={form.requested_check_in}
              onChange={(e) => setForm((f) => ({ ...f, requested_check_in: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        )}

        {needsCheckOut && (
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Requested Check-Out Time *</label>
            <input
              type="time"
              value={form.requested_check_out}
              onChange={(e) => setForm((f) => ({ ...f, requested_check_out: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Reason *</label>
          <textarea
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Why do you need this correction?"
            rows={3}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting} loadingText="Submitting...">
            Submit Request
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default CorrectionRequestModal
