import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Upload, X } from 'lucide-react'

import { Modal, Button, inputClassName } from '../../../../components/ui'
import { VISIBILITY_OPTIONS, VISIBILITY_LABELS } from '../utils/documents'

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB — mirrors backend settings.MAX_UPLOAD_SIZE

/**
 * Reusable upload modal for employee/candidate HR documents.
 * Validates client-side, submits multipart through the real backend API,
 * prevents duplicate submission, and resets on close.
 */
export default function DocumentUploadModal({ open, onClose, onUpload, defaultTypeId, documentTypes }) {
  const types = Array.isArray(documentTypes) ? documentTypes : documentTypes?.data?.data || documentTypes?.data || []
  const activeTypes = types.filter((type) => type.active !== false)
  const fileInputRef = useRef(null)
  const [document_type_id, setDocumentTypeId] = useState(defaultTypeId || '')
  const [file, setFile] = useState(null)
  const [expiry_date, setExpiryDate] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const submittedRef = useRef(false)

  const selectedType = types.find((type) => type.id === document_type_id)

  // Reset whenever the modal opens.
  useEffect(() => {
    if (open) {
      setDocumentTypeId(defaultTypeId || '')
      setFile(null)
      setExpiryDate('')
      setDescription('')
      setVisibility(selectedType?.default_visibility || '')
      setErrors({})
      setSubmitting(false)
      submittedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTypeId])

  const validate = () => {
    const next = {}
    if (!document_type_id) next.document_type_id = 'Please select a document type'
    if (!file) {
      next.file = 'Please choose a file'
    } else {
      const ext = `.${(file.name || '').split('.').pop().toLowerCase()}`
      if (!ALLOWED_EXTENSIONS.includes(ext)) next.file = 'File type is not supported. Allowed types: PDF, JPG, PNG, DOC, DOCX'
      else if (file.size > MAX_FILE_SIZE) next.file = 'File exceeds the 10 MB limit'
    }
    if (expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) next.expiry_date = 'Use YYYY-MM-DD'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting || submittedRef.current) return
    if (!validate()) return

    setSubmitting(true)
    submittedRef.current = true
    try {
      await onUpload({ file, document_type_id, expiry_date, description, visibility })
      toast.success('Document uploaded successfully')
      onClose()
    } catch (error) {
      submittedRef.current = false
      toast.error(error?.response?.data?.detail || error?.message || 'Failed to upload document')
    } finally {
      setSubmitting(false)
    }
  }

  const handleTypeChange = (value) => {
    setDocumentTypeId(value)
    const type = types.find((t) => t.id === value)
    if (type?.default_visibility) setVisibility(type.default_visibility)
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Upload HR Document"
      description="Store a file for this employee/candidate. Replacing later creates a new version — history is preserved."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="hr-document-upload-form" loading={submitting} loadingText="Uploading…">
            <Upload className="mr-2 h-4 w-4" /> Upload
          </Button>
        </div>
      }
    >
      <form id="hr-document-upload-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Document Type <span className="ml-1 text-red-600">*</span>
            </label>
            <select
              className={inputClassName}
              value={document_type_id}
              onChange={(event) => handleTypeChange(event.target.value)}
              aria-label="Document type"
            >
              <option value="">Select type…</option>
              {activeTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
            {errors.document_type_id ? <p className="text-xs text-red-600">{errors.document_type_id}</p> : null}
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Expiry Date</label>
            <input
              type="date"
              className={inputClassName}
              value={expiry_date}
              disabled={selectedType && selectedType.expiry_supported === false}
              onChange={(event) => setExpiryDate(event.target.value)}
              aria-label="Expiry date"
            />
            {errors.expiry_date ? <p className="text-xs text-red-600">{errors.expiry_date}</p> : null}
            {selectedType && selectedType.expiry_supported === false ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">This document type does not support expiry dates.</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            File <span className="ml-1 text-red-600">*</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(',')}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null)
              setErrors((current) => ({ ...current, file: '' }))
            }}
            className="block w-full cursor-pointer rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 transition hover:border-indigo-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300"
            aria-label="Choose file"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {file ? `${file.name} (${(file.size / 1024).toFixed(0)} KB)` : 'PDF, JPG, PNG, DOC, DOCX — max 10 MB'}
          </p>
          {errors.file ? <p className="text-xs text-red-600">{errors.file}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Visibility</label>
          <select
            className={inputClassName}
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
            aria-label="Visibility"
          >
            {VISIBILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {visibility === 'hr_only'
              ? 'Confidential — visible to HR only. The employee will not see it.'
              : 'The employee will be able to see this document in their own profile.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
          <textarea
            className={`${inputClassName} min-h-20`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional note about this document…"
          />
        </div>
      </form>
    </Modal>
  )
}
