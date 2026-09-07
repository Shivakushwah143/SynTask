import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery, useQueryClient } from 'react-query'
import { FileText, Send } from 'lucide-react'
import { hrDocumentsApi } from '../../../../api/hrDocuments'
import { Button, Modal, inputClassName } from '../../../../components/ui'

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const REQUIREMENT_OPTIONS = [
  { value: 'mandatory', label: 'Mandatory' },
  { value: 'optional', label: 'Optional' },
]

/**
 * Modal for HR/Admin to request an additional document from an employee.
 *
 * Props:
 * - open: boolean — whether the modal is visible
 * - onClose: () => void — close handler
 * - employeeId: string | null — pre-selected employee ID
 * - employeeName: string | null — pre-selected employee name (display only)
 */
export default function RequestDocumentModal({ open, onClose, employeeId: presetEmployeeId, employeeName: presetEmployeeName }) {
  const queryClient = useQueryClient()

  // Fetch document types for the dropdown
  const typesQuery = useQuery(
    ['hr-document-types'],
    () => hrDocumentsApi.listTypes(),
    { staleTime: 5 * 60 * 1000 },
  )
  const types = Array.isArray(typesQuery.data?.data) ? typesQuery.data.data : Array.isArray(typesQuery.data) ? typesQuery.data : []

  const [employeeId, setEmployeeId] = useState(presetEmployeeId || '')
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [customTypeName, setCustomTypeName] = useState('')
  const [requirementLevel, setRequirementLevel] = useState('mandatory')
  const [priority, setPriority] = useState('normal')
  const [dueDate, setDueDate] = useState('')
  const [instructions, setInstructions] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset form when modal opens with new employee
  const resetForm = () => {
    setEmployeeId(presetEmployeeId || '')
    setSelectedTypeId('')
    setCustomTypeName('')
    setRequirementLevel('mandatory')
    setPriority('normal')
    setDueDate('')
    setInstructions('')
  }

  const handleClose = () => {
    if (!submitting) {
      resetForm()
      onClose()
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const typeName = selectedTypeId === 'other'
      ? customTypeName.trim()
      : types.find((t) => t.id === selectedTypeId)?.name

    if (!typeName) {
      toast.error('Please select or enter a document type')
      return
    }

    const payload = {
      employee_id: presetEmployeeId || employeeId,
      document_type_id: selectedTypeId === 'other' || !selectedTypeId ? undefined : selectedTypeId,
      document_type_name: typeName,
      requirement_level: requirementLevel,
      priority: priority,
      instructions: instructions.trim() || undefined,
      due_date: dueDate || undefined,
    }

    setSubmitting(true)
    try {
      await hrDocumentsApi.createDocumentRequest(payload)
      toast.success(`Document request sent to ${presetEmployeeName || 'employee'}`)
      resetForm()
      onClose()
      // Invalidate relevant queries
      queryClient.invalidateQueries(['hr-document-requests'])
      queryClient.invalidateQueries(['hr-documents'])
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to create document request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Request Additional Document"
      description={
        presetEmployeeName
          ? `Request a document from ${presetEmployeeName}`
          : 'Request a document from an employee'
      }
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="request-document-form"
            loading={submitting}
            loadingText="Sending…"
          >
            <Send className="mr-2 h-4 w-4" /> Request Document
          </Button>
        </div>
      }
    >
      <form id="request-document-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Document Type */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Document Type <span className="ml-1 text-red-600">*</span>
          </label>
          <select
            className={inputClassName}
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
            required
          >
            <option value="">Select a document type…</option>
            {types
              .filter((t) => t.active !== false)
              .map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            <option value="other">Other (custom)</option>
          </select>
        </div>

        {/* Custom type name (shown when "Other" is selected) */}
        {selectedTypeId === 'other' && (
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Custom Document Name <span className="ml-1 text-red-600">*</span>
            </label>
            <input
              className={inputClassName}
              value={customTypeName}
              onChange={(e) => setCustomTypeName(e.target.value)}
              placeholder="e.g. Vaccination Certificate"
              required
            />
          </div>
        )}

        {/* Requirement + Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Requirement <span className="ml-1 text-red-600">*</span>
            </label>
            <select
              className={inputClassName}
              value={requirementLevel}
              onChange={(e) => setRequirementLevel(e.target.value)}
            >
              {REQUIREMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Mandatory = must eventually provide. Optional = nice to have.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Priority
            </label>
            <select
              className={inputClassName}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Urgency for HR operations — independent of requirement.
            </p>
          </div>
        </div>

        {/* Due Date */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Due Date <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
          </label>
          <input
            type="date"
            className={inputClassName}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>

        {/* Instructions */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Instructions / Notes <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
          </label>
          <textarea
            className={`${inputClassName} resize-none`}
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Upload both sides of the card, clearly visible."
          />
        </div>
      </form>
    </Modal>
  )
}
