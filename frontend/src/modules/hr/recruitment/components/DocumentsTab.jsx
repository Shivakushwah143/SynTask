import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import {
  Archive,
  CalendarClock,
  Download,
  Eye,
  FileText,
  Filter,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Replace,
  Search,
  ShieldAlert,
  UploadCloud,
  X,
} from 'lucide-react'

import { Button, ConfirmDialog, EmptyState, Modal, inputClassName } from '../../../../components/ui'
import { hrDocumentsApi, hrDocumentFiles, buildDocumentFormData, normalizeDocumentTypesResponse } from '../../../../api/hrDocuments'
import {
  EXPIRY_STATES,
  VISIBILITY_OPTIONS,
  formatFileSize,
  isPreviewable,
  previewBlobUrl,
} from '../utils/documents'
import DocumentUploadModal from './DocumentUploadModal'

const PAGE_SIZE = 15
const selectClassName = inputClassName

const EXPIRY_FILTERS = [
  { value: '', label: 'All expiry states' },
  { value: 'valid', label: 'Valid' },
  { value: 'expiring_soon', label: 'Expiring soon' },
  { value: 'expired', label: 'Expired' },
  { value: 'no_expiry', label: 'No expiry' },
]

const VISIBILITY_FILTERS = [
  { value: '', label: 'All visibility' },
  ...VISIBILITY_OPTIONS,
]

const expiryStateBadge = (state) => {
  const conf = EXPIRY_STATES[state] || EXPIRY_STATES.no_expiry
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${conf.color}`}>
      {conf.label}
    </span>
  )
}

/**
 * Reusable HR documents view for an employee or candidate.
 *
 * Security: every action (preview/download/history/replace/archive) calls the
 * authorized /hr backend endpoints — the backend re-checks ownership, company
 * scope and visibility on every request. The UI simply hides buttons the
 * backend said are not permitted (can_* flags).
 */
export default function DocumentsTab({ employeeId, candidateId, ownerName, canManage = true }) {
  const queryClient = useQueryClient()
  // Global mode (no owner passed): company-wide HR document list via
  // /hr/documents — used by the People → Documents page.
  const global = !employeeId && !candidateId
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [ownerType, setOwnerType] = useState('')
  const [documentTypeId, setDocumentTypeId] = useState('')
  const [expiryState, setExpiryState] = useState('')
  const [visibility, setVisibility] = useState('')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  const [previewDoc, setPreviewDoc] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [historyDoc, setHistoryDoc] = useState(null)
  const [replaceDoc, setReplaceDoc] = useState(null)
  const [editDoc, setEditDoc] = useState(null)
  const [archiveDoc, setArchiveDoc] = useState(null)
  const [archiveLoading, setArchiveLoading] = useState(false)

  const ownerKey = global ? { global: true } : employeeId ? { employeeId } : { candidateId }

  const buildParams = () => ({
    search: debouncedSearch || undefined,
    owner_type: ownerType || undefined,
    document_type_id: documentTypeId || undefined,
    expiry_state: expiryState || undefined,
    visibility: visibility || undefined,
    page,
    page_size: PAGE_SIZE,
  })

  // Params captured at render time for the query.
  const params = buildParams()

  const listFn = global
    ? () => hrDocumentsApi.listDocuments(params)
    : employeeId
      ? () => hrDocumentsApi.listEmployeeDocuments(employeeId, params)
      : () => hrDocumentsApi.listCandidateDocuments(candidateId, params)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const query = useQuery(
    ['hr-documents', ownerKey, { search: debouncedSearch, ownerType, documentTypeId, expiryState, visibility, page }],
    listFn,
    { keepPreviousData: true }
  )

  const typesQuery = useQuery(['hr-document-types'], () => hrDocumentsApi.listTypes(), {
    staleTime: 5 * 60 * 1000,
  })
  const types = normalizeDocumentTypesResponse(typesQuery.data)
  const activeTypes = types.filter((type) => type.active !== false)
  const typeLoadError = typesQuery.isError
  const noTypesAvailable = !typesQuery.isLoading && !typeLoadError && activeTypes.length === 0

  // Only HR/view users see the “missing required” banner — employee self-service
  // would be rejected by the backend's directory-view requirement.
  const missingQuery = useQuery(
    ['hr-documents', 'missing-required', employeeId],
    () => (employeeId ? hrDocumentsApi.missingRequired(employeeId) : Promise.resolve({ data: { missing: [], count: 0 } })),
    { enabled: Boolean(employeeId && canManage) }
  )
  const missingCount = missingQuery.data?.data?.count || 0
  const missingDocuments = missingQuery.data?.data?.missing || []
  const missingNames = missingDocuments.map((item) => item.name) || []

  const documents = query.data?.data?.items || []
  const total = query.data?.data?.total || 0
  const hasNext = query.data?.data?.has_next || page * PAGE_SIZE < total
  const hasActiveFilters = Boolean(ownerType || documentTypeId || expiryState || visibility || debouncedSearch)

  const invalidateAll = () => {
    queryClient.invalidateQueries(['hr-documents'])
    queryClient.invalidateQueries(['hr-document-types'])
  }

  const handleUpload = async (payload) => {
    const formData = buildDocumentFormData(payload)
    if (employeeId) await hrDocumentsApi.uploadEmployeeDocument(employeeId, formData)
    else await hrDocumentsApi.uploadCandidateDocument(candidateId, formData)
    invalidateAll()
  }

  // ── Preview (authorized blob fetch; never a raw public URL) ───────────────
  const openPreview = async (document) => {
    setPreviewDoc(document)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(true)
    try {
      const response = await hrDocumentFiles.preview(document.id)
      setPreviewUrl(previewBlobUrl(response.data))
    } catch (error) {
      setPreviewError(error?.response?.data?.detail || 'Unable to preview this document. You may not have permission.')
    } finally {
      setPreviewLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      if (previewUrl) window.URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl])

  // ── Download (authorized blob fetch + safe filename) ──────────────────────
  const handleDownload = async (doc) => {
    try {
      const response = await hrDocumentFiles.download(doc.id)
      const url = window.URL.createObjectURL(response.data)
      const link = window.document.createElement('a')
      link.href = url
      link.download = doc.filename || `${doc.document_type || 'document'}.pdf`
      window.document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to download document')
    }
  }

  // ── History ───────────────────────────────────────────────────────────────
  const versionsQuery = useQuery(
    ['hr-document-versions', historyDoc?.id],
    () => (historyDoc ? hrDocumentsApi.listVersions(historyDoc.id) : Promise.resolve({ data: [] })),
    { enabled: Boolean(historyDoc) }
  )
  const versions = versionsQuery.data?.data || []

  const downloadVersion = async (version) => {
    try {
      const response = await hrDocumentFiles.downloadVersion(historyDoc.id, version.id)
      const url = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = version.original_filename || 'document'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to download this version')
    }
  }

  // ── Replace (new version) ─────────────────────────────────────────────────
  const [replaceFile, setReplaceFile] = useState(null)
  const [replaceNote, setReplaceNote] = useState('')
  const [replaceSubmitting, setReplaceSubmitting] = useState(false)

  const handleReplaceSubmit = async (event) => {
    event.preventDefault()
    if (!replaceFile) {
      toast.error('Please choose a file')
      return
    }
    setReplaceSubmitting(true)
    try {
      const formData = buildDocumentFormData({ file: replaceFile, change_note: replaceNote })
      await hrDocumentsApi.replaceDocument(replaceDoc.id, formData)
      toast.success(`New version V${(replaceDoc.current_version || 0) + 1} uploaded`)
      setReplaceDoc(null)
      setReplaceFile(null)
      setReplaceNote('')
      invalidateAll()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to replace document')
    } finally {
      setReplaceSubmitting(false)
    }
  }

  // ── Edit metadata ─────────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState({})
  const [editSubmitting, setEditSubmitting] = useState(false)

  useEffect(() => {
    if (editDoc) {
      setEditForm({
        description: editDoc.description || '',
        expiry_date: editDoc.expiry_date ? editDoc.expiry_date.slice(0, 10) : '',
        visibility: editDoc.visibility || 'employee_visible',
      })
    }
  }, [editDoc])

  const handleEditSubmit = async (event) => {
    event.preventDefault()
    setEditSubmitting(true)
    try {
      const payload = {}
      if (editForm.expiry_date !== (editDoc.expiry_date ? editDoc.expiry_date.slice(0, 10) : '')) {
        payload.expiry_date = editForm.expiry_date || null
      }
      if (editForm.description !== (editDoc.description || '')) payload.description = editForm.description
      if (editForm.visibility !== editDoc.visibility) payload.visibility = editForm.visibility
      await hrDocumentsApi.updateDocument(editDoc.id, payload)
      toast.success('Document metadata updated')
      setEditDoc(null)
      invalidateAll()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update document')
    } finally {
      setEditSubmitting(false)
    }
  }

  // ── Archive ───────────────────────────────────────────────────────────────
  const handleArchive = async () => {
    setArchiveLoading(true)
    try {
      await hrDocumentsApi.archiveDocument(archiveDoc.id)
      toast.success('Document archived')
      setArchiveDoc(null)
      invalidateAll()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to archive document')
    } finally {
      setArchiveLoading(false)
    }
  }

  const resetFilters = () => {
    setOwnerType('')
    setDocumentTypeId('')
    setExpiryState('')
    setVisibility('')
    setSearch('')
    setDebouncedSearch('')
    setPage(1)
  }

  // Owner display + navigation for the company-wide list.
  const ownerLabel = (document) =>
    document.employee_name ||
    document.candidate_name ||
    (document.owner_type === 'employee' ? 'Employee' : document.owner_type === 'candidate' ? 'Candidate' : '—')
  const ownerHref = (document) => {
    if (document.employee_id) return `/hr/employees/${document.employee_id}`
    if (document.candidate_id) return '/hr/recruitment/candidates'
    return null
  }

  const typeName = (id) => types.find((type) => type.id === id)?.name || id

  return (
    <div className="space-y-4">
      {/* Upload + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => query.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
          <Button variant="secondary" onClick={() => setShowFilters((value) => !value)}>
            <Filter className="mr-2 h-4 w-4" /> Filters
            {hasActiveFilters ? <span className="ml-1 rounded-full bg-indigo-500 px-1.5 text-xs text-white">•</span> : null}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" onClick={resetFilters}>
              <X className="mr-1.5 h-4 w-4" /> Clear
            </Button>
          )}
        </div>
        {canManage && !global && (
          <Button onClick={() => setShowUpload(true)}>
            <Plus className="mr-2 h-4 w-4" /> Upload Document
          </Button>
        )}
      </div>

      {/* Missing required documents banner */}
      {employeeId && missingCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
            <CalendarClock className="h-4 w-4" />
            Missing required documents: {missingCount}
          </p>
          {missingNames.length > 0 && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{missingNames.join(', ')}</p>
          )}
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className={`grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 ${global ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          {global && (
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">Owner Type</span>
              <select className={selectClassName} aria-label="Filter by owner type" value={ownerType} onChange={(event) => { setOwnerType(event.target.value); setPage(1) }}>
                <option value="">All owners</option>
                <option value="employee">Employees</option>
                <option value="candidate">Candidates</option>
              </select>
            </label>
          )}
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">Document Type</span>
            <select className={selectClassName} aria-label="Filter by document type" value={documentTypeId} onChange={(event) => { setDocumentTypeId(event.target.value); setPage(1) }}>
              <option value="">
                {typesQuery.isLoading ? 'Loading types...' : typeLoadError ? 'Document types unavailable' : noTypesAvailable ? 'No document types available' : 'All types'}
              </option>
              {activeTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
            {typeLoadError ? (
              <p className="text-xs text-red-600 dark:text-red-400">Unable to load document types. Retry before filtering or uploading.</p>
            ) : noTypesAvailable ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">No active document types are configured for this company.</p>
            ) : null}
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">Expiry State</span>
            <select className={selectClassName} aria-label="Filter by expiry state" value={expiryState} onChange={(event) => { setExpiryState(event.target.value); setPage(1) }}>
              {EXPIRY_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">Visibility</span>
            <select className={selectClassName} aria-label="Filter by visibility" value={visibility} onChange={(event) => { setVisibility(event.target.value); setPage(1) }}>
              {VISIBILITY_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by filename or description…"
          className={`${inputClassName} pl-9`}
          aria-label="Search documents"
        />
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>

      {/* List */}
      {query.isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={FileText}
          title="Failed to load documents"
          description="Something went wrong while loading documents. Please try again."
          action={<Button variant="secondary" onClick={() => query.refetch()}>Try Again</Button>}
        />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description={global ? 'No HR documents have been uploaded for this company yet.' : `No HR documents have been added for ${ownerName || 'this employee'}.`}
          action={canManage && !global ? <Button onClick={() => setShowUpload(true)}><UploadCloud className="mr-2 h-4 w-4" /> Upload First Document</Button> : null}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800/70">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Document</th>
                  {global && <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Owner</th>}
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Expiry</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Uploaded</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Version</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {documents.map((document) => (
                  <tr key={document.id} className="transition-colors hover:bg-gray-50/70 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{document.filename || document.document_type || 'Untitled'}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(document.file_size)}</p>
                        </div>
                      </div>
                    </td>
                    {global && (
                      <td className="px-4 py-3">
                        {ownerHref(document) ? (
                          <Link
                            to={ownerHref(document)}
                            onClick={(event) => event.stopPropagation()}
                            className="text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-800 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                          >
                            {ownerLabel(document)}
                          </Link>
                        ) : (
                          <p className="text-sm text-gray-700 dark:text-gray-200">{ownerLabel(document)}</p>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700 dark:text-gray-200">{document.document_type || typeName(document.document_type_id)}</p>
                      {document.document_type_required ? <span className="text-xs text-gray-400 dark:text-gray-500">Required</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {document.expiry_date ? <p className="text-xs text-gray-500 dark:text-gray-400">{document.expiry_date.slice(0, 10)}</p> : null}
                        {expiryStateBadge(document.expiry_state)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {document.uploaded_at ? document.uploaded_at.slice(0, 10) : '—'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{document.uploaded_by_name || document.uploaded_by || ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700/40 dark:text-gray-300">
                        V{document.current_version || 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {document.can_preview && isPreviewable(document.mime_type) && (
                          <button type="button" title="Preview" onClick={() => openPreview(document)} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300">
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        {document.can_download && (
                          <button type="button" title="Download" onClick={() => handleDownload(document)} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300">
                            <Download className="h-4 w-4" />
                          </button>
                        )}
                        {document.can_view && (
                          <button type="button" title="History" onClick={() => setHistoryDoc(document)} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300">
                            <History className="h-4 w-4" />
                          </button>
                        )}
                        {document.can_replace && (
                          <button type="button" title="Replace (new version)" onClick={() => setReplaceDoc(document)} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300">
                            <Replace className="h-4 w-4" />
                          </button>
                        )}
                        {document.can_edit && (
                          <button type="button" title="Edit metadata" onClick={() => setEditDoc(document)} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300">
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {document.can_archive && (
                          <button type="button" title="Archive" onClick={() => setArchiveDoc(document)} className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-gray-400 dark:hover:bg-rose-900/30 dark:hover:text-rose-300">
                            <Archive className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {(page > 1 || hasNext) && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-gray-700/60">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Showing {documents.length} of {total}
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  Previous
                </Button>
                <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => setPage((value) => value + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Upload modal ──────────────────────────────────────────────────── */}
      <DocumentUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUpload={handleUpload}
        documentTypes={types}
        documentTypesLoading={typesQuery.isLoading}
        documentTypesError={typeLoadError ? 'Unable to load document types' : null}
        requiredDocuments={missingDocuments}
      />

      {/* ── Preview modal ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        title={previewDoc?.filename || 'Preview'}
        description={previewDoc ? `${previewDoc.document_type || ''} · V${previewDoc.current_version || 1}` : undefined}
        size="xl"
        bodyClassName="flex flex-col"
        footer={
          previewDoc ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreviewDoc(null)}>
                Close
              </Button>
              {previewDoc.can_download && (
                <Button onClick={() => handleDownload(previewDoc)}>
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
              )}
            </div>
          ) : null
        }
      >
        {previewLoading ? (
          <div className="flex h-80 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : previewError ? (
          <EmptyState icon={ShieldAlert} title="Preview unavailable" description={previewError} />
        ) : previewUrl ? (
          isPreviewable(previewDoc?.mime_type) ? (
            previewDoc?.mime_type?.startsWith('image/') ? (
              <img src={previewUrl} alt={previewDoc.filename} className="mx-auto max-h-[70vh] rounded-xl object-contain" />
            ) : (
              <iframe src={previewUrl} title="Document preview" className="h-[70vh] w-full rounded-xl border border-gray-200 dark:border-gray-700" />
            )
          ) : (
            <EmptyState
              icon={FileText}
              title="No inline preview"
              description="This file format cannot be previewed in the browser. Use Download instead."
              action={<Button onClick={() => handleDownload(previewDoc)}><Download className="mr-2 h-4 w-4" /> Download</Button>}
            />
          )
        ) : null}
      </Modal>

      {/* ── History modal ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(historyDoc)}
        onClose={() => setHistoryDoc(null)}
        title="Version History"
        description={historyDoc ? `${historyDoc.document_type || 'Document'} — ${historyDoc.filename || ''}` : undefined}
        size="lg"
      >
        {versionsQuery.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        ) : versions.length === 0 ? (
          <EmptyState icon={History} title="No versions" description="This document has no version history." />
        ) : (
          <div className="space-y-3">
            {versions.map((version) => (
              <div key={version.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                    V{version.version_number}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{version.original_filename}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {version.uploaded_by_name || version.uploaded_by || 'Unknown'} · {version.uploaded_at ? version.uploaded_at.slice(0, 10) : '—'} · {formatFileSize(version.file_size)}
                    </p>
                    {version.change_note ? <p className="mt-0.5 text-xs italic text-gray-500 dark:text-gray-400">“{version.change_note}”</p> : null}
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => downloadVersion(version)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ── Replace modal ─────────────────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(replaceDoc)}
        onClose={() => { setReplaceDoc(null); setReplaceFile(null); setReplaceNote('') }}
        title="Replace Document"
        description={
          replaceDoc
            ? `Current version is V${replaceDoc.current_version || 1}. The new upload will become V${(replaceDoc.current_version || 1) + 1} — the current version stays in history.`
            : undefined
        }
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setReplaceDoc(null); setReplaceFile(null); setReplaceNote('') }} disabled={replaceSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleReplaceSubmit} form="hr-document-replace-form" loading={replaceSubmitting} loadingText="Uploading…">
              <Replace className="mr-2 h-4 w-4" /> Upload New Version
            </Button>
          </div>
        }
      >
        <form id="hr-document-replace-form" onSubmit={handleReplaceSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              New File <span className="ml-1 text-red-600">*</span>
            </label>
            <input
              type="file"
              aria-label="New File"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(event) => setReplaceFile(event.target.files?.[0] || null)}
              className="block w-full cursor-pointer rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 transition hover:border-indigo-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">PDF, JPG, PNG, DOC, DOCX — max 10 MB</p>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Change Note</label>
            <input
              className={inputClassName}
              value={replaceNote}
              onChange={(event) => setReplaceNote(event.target.value)}
              placeholder="Why is this version being uploaded? (shown in history)"
            />
          </div>
        </form>
      </Modal>

      {/* ── Edit metadata modal ───────────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(editDoc)}
        onClose={() => setEditDoc(null)}
        title="Edit Document Metadata"
        description={editDoc ? `Editing ${editDoc.filename || editDoc.document_type || 'document'} — this does not create a new file version.` : undefined}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditDoc(null)} disabled={editSubmitting}>Cancel</Button>
            <Button onClick={handleEditSubmit} form="hr-document-edit-form" loading={editSubmitting} loadingText="Saving…">
              Save Changes
            </Button>
          </div>
        }
      >
        <form id="hr-document-edit-form" onSubmit={handleEditSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Expiry Date</label>
            <input type="date" className={inputClassName} value={editForm.expiry_date || ''} onChange={(event) => setEditForm((form) => ({ ...form, expiry_date: event.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Visibility</label>
            <select className={selectClassName} value={editForm.visibility || 'employee_visible'} onChange={(event) => setEditForm((form) => ({ ...form, visibility: event.target.value }))}>
              {VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
            <textarea className={`${inputClassName} min-h-24`} value={editForm.description || ''} onChange={(event) => setEditForm((form) => ({ ...form, description: event.target.value }))} placeholder="Optional description…" />
          </div>
        </form>
      </Modal>

      {/* ── Archive confirm ───────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={Boolean(archiveDoc)}
        onClose={() => setArchiveDoc(null)}
        title="Archive Document?"
        message={`Archive “${archiveDoc?.filename || archiveDoc?.document_type || 'this document'}” for ${global ? (archiveDoc?.employee_name || archiveDoc?.candidate_name || 'the owner') : (ownerName || 'this employee')}? The record stays in history and can be restored later, but it will no longer appear in the active list.`}
        confirmLabel="Archive"
        loading={archiveLoading}
        onConfirm={handleArchive}
      />
    </div>
  )
}
