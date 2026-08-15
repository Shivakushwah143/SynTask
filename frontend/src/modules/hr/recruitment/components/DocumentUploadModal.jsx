import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Search, Upload, X } from 'lucide-react'

import { Modal, Button, inputClassName } from '../../../../components/ui'
import { normalizeDocumentTypesResponse } from '../../../../api/hrDocuments'
import { VISIBILITY_OPTIONS, VISIBILITY_LABELS } from '../utils/documents'

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx']
const BASIC_DOCUMENT_TYPE_CODES = ['resume', 'aadhaar', 'pan', 'joining_document', 'bank_document']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB — mirrors backend settings.MAX_UPLOAD_SIZE

/**
 * Reusable upload modal for employee/candidate HR documents.
 * Validates client-side, submits multipart through the real backend API,
 * prevents duplicate submission, and resets on close.
 */
export default function DocumentUploadModal({ open, onClose, onUpload, defaultTypeId, documentTypes, documentTypesLoading = false, documentTypesError = null, requiredDocuments = [] }) {
  const types = normalizeDocumentTypesResponse(documentTypes)
  const activeTypes = types.filter((type) => type.active !== false)
  const requiredTypeIds = new Set((requiredDocuments || []).map((item) => item.document_type_id).filter(Boolean))
  const sortBasicFirst = (a, b) => {
    const aIndex = BASIC_DOCUMENT_TYPE_CODES.indexOf(a.code)
    const bIndex = BASIC_DOCUMENT_TYPE_CODES.indexOf(b.code)
    if (aIndex === -1 && bIndex === -1) return (a.name || '').localeCompare(b.name || '')
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  }
  const basicTypes = activeTypes
    .filter((type) => BASIC_DOCUMENT_TYPE_CODES.includes(type.code) || type.required || requiredTypeIds.has(type.id))
    .sort(sortBasicFirst)
  const fileInputRef = useRef(null)
  const [document_type_id, setDocumentTypeId] = useState(defaultTypeId || '')
  const [typeSearch, setTypeSearch] = useState('')
  const [file, setFile] = useState(null)
  const [expiry_date, setExpiryDate] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const submittedRef = useRef(false)

  const selectedType = types.find((type) => type.id === document_type_id)
  const filteredTypes = [...activeTypes].sort(sortBasicFirst).filter((type) => {
    const term = typeSearch.trim().toLowerCase()
    if (!term) return true
    return `${type.name || ''} ${type.code || ''}`.toLowerCase().includes(term)
  })

  // Reset whenever the modal opens.
  useEffect(() => {
    if (open) {
      setDocumentTypeId(defaultTypeId || '')
      setTypeSearch('')
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
    if (documentTypesLoading) next.document_type_id = 'Document types are still loading'
    else if (documentTypesError) next.document_type_id = 'Document types could not be loaded'
    else if (activeTypes.length === 0) next.document_type_id = 'No active document types are configured'
    else if (!document_type_id) next.document_type_id = 'Please select a document type'
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

  const selectType = (typeId) => {
    handleTypeChange(typeId)
    setErrors((current) => ({ ...current, document_type_id: '' }))
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
        {basicTypes.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              Needed employee documents
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {basicTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => selectType(type.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    document_type_id === type.id
                      ? 'border-indigo-500 bg-indigo-600 text-white'
                      : 'border-amber-300 bg-white text-amber-800 hover:border-indigo-400 hover:text-indigo-700 dark:border-amber-800 dark:bg-gray-900 dark:text-amber-200'
                  }`}
                >
                  {type.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Document Type <span className="ml-1 text-red-600">*</span>
            </label>
            <div className="relative">
              <input
                className={`${inputClassName} pl-9`}
                value={typeSearch}
                onChange={(event) => setTypeSearch(event.target.value)}
                placeholder="Search document type"
                aria-label="Search document type"
              />
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
            <select
              className={inputClassName}
              value={document_type_id}
              onChange={(event) => handleTypeChange(event.target.value)}
              aria-label="Document type"
            >
              <option value="">Select type…</option>
              {documentTypesLoading ? <option value="">Loading types...</option> : null}
              {documentTypesError ? <option value="">Document types unavailable</option> : null}
              {!documentTypesLoading && !documentTypesError && activeTypes.length === 0 ? <option value="">No active types available</option> : null}
              {!documentTypesLoading && !documentTypesError && activeTypes.length > 0 && filteredTypes.length === 0 ? <option value="">No matching types</option> : null}
              {filteredTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}{type.required ? ' (required)' : ''}
                </option>
              ))}
            </select>
            {errors.document_type_id ? <p className="text-xs text-red-600">{errors.document_type_id}</p> : null}
            {documentTypesError ? <p className="text-xs text-red-600">{documentTypesError}</p> : null}
            {!documentTypesLoading && !documentTypesError && activeTypes.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">No active document types are configured for this company.</p>
            ) : null}
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
