import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  FileUp,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  XCircle,
} from 'lucide-react'
import { hrDocumentFiles } from '../../../api/hrDocuments'
import { useMyDocumentActions, useMyDocumentRequests, useMyDocumentStatus, useMyDocuments, useMyProfile, useUploadForDocumentRequest } from '../../../hooks/useMyHr'
import { Button, EmptyState, Modal, Skeleton, inputClassName } from '../../../components/ui'
import { downloadBlob, getDownloadFilename } from '../../../utils/download'
import { EXPIRY_STATE_META, formatDate } from './myHrUtils'
import { REVIEW_STATUS_META, documentFileErrorMessage, formatFileSize, isPreviewable } from '../../../modules/hr/recruitment/utils/documents'

const reviewBadge = (status) => {
  const conf = REVIEW_STATUS_META[status] || REVIEW_STATUS_META.missing
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${conf.color}`}>
      {status === 'pending' ? <Clock className="h-3 w-3" /> : null}
      {status === 'approved' ? <CheckCircle2 className="h-3 w-3" /> : null}
      {status === 'rejected' ? <XCircle className="h-3 w-3" /> : null}
      {conf.label}
    </span>
  )
}

const MyDocuments = () => {
  const { data: profile, isLoading: profileLoading, isError: profileError } = useMyProfile()
  const { data: documents, isLoading: docsLoading, isError: docsError, refetch: refetchDocs } = useMyDocuments()
  const {
    data: status,
    isLoading: statusLoading,
    isError: statusError,
    refetch: refetchStatus,
  } = useMyDocumentStatus()
  const {
    data: docRequests,
    isLoading: requestsLoading,
    refetch: refetchRequests,
  } = useMyDocumentRequests()

  const uploadMutation = useMyDocumentActions()
  const uploadForRequestMutation = useUploadForDocumentRequest()

  // documents from the backend's HRDocumentListResponse ({ items, total, ... })
  const items = documents?.items || []
  const requiredRows = status?.required || []
  const uploadableRows = status?.uploadable || []

  // ── Upload / resubmit modal state ─────────────────────────────────────────
  const [uploadOpen, setUploadOpen] = useState(false)
  const [presetTypeId, setPresetTypeId] = useState(null)
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [file, setFile] = useState(null)
  const [expiryDate, setExpiryDate] = useState('')
  const [description, setDescription] = useState('')

  const canUploadAnything = uploadableRows.some((row) => row.can_upload)

  const openUpload = (typeId = null) => {
    const allowed = uploadableRows.filter((row) => row.can_upload)
    const target = typeId && allowed.some((row) => row.document_type_id === typeId) ? typeId : allowed[0]?.document_type_id || ''
    // Resubmitting a rejected document keeps its declared expiry so the
    // employee can preserve, change, or clear it (date inputs need YYYY-MM-DD).
    const existing = items.find((doc) => doc.document_type_id === target && doc.review_status === 'rejected')
    setPresetTypeId(target)
    setSelectedTypeId(target)
    setFile(null)
    setExpiryDate(existing?.expiry_date ? String(existing.expiry_date).slice(0, 10) : '')
    setDescription('')
    setUploadOpen(true)
  }

  const closeUpload = () => {
    if (!uploadMutation.isLoading) setUploadOpen(false)
  }

  const selectedRow = uploadableRows.find((row) => row.document_type_id === selectedTypeId)

  const handleUpload = async (event) => {
    event.preventDefault()
    if (!file) {
      toast.error('Please choose a file')
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    if (selectedTypeId) formData.append('document_type_id', selectedTypeId)
    // Expiry date is an optional field used to declare the expiry of the
    // particular document being submitted — sent whenever the employee set it.
    if (expiryDate) formData.append('expiry_date', expiryDate)
    if (description.trim()) formData.append('description', description.trim())
    try {
      await uploadMutation.mutateAsync(formData)
      const label = selectedRow?.document_id ? 'Document resubmitted' : 'Document submitted'
      toast.success(`${label} — it is now pending HR review`)
      setUploadOpen(false)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to submit document')
    }
  }

  // ── Upload for a specific document request ─────────────────────────────
  const [requestUploadOpen, setRequestUploadOpen] = useState(false)
  const [activeRequest, setActiveRequest] = useState(null)
  const [requestFile, setRequestFile] = useState(null)
  const [requestExpiry, setRequestExpiry] = useState('')
  const [requestDescription, setRequestDescription] = useState('')

  const openRequestUpload = (request) => {
    setActiveRequest(request)
    setRequestFile(null)
    setRequestExpiry('')
    setRequestDescription('')
    setRequestUploadOpen(true)
  }

  const closeRequestUpload = () => {
    if (!uploadForRequestMutation.isLoading) {
      setRequestUploadOpen(false)
      setActiveRequest(null)
    }
  }

  const handleRequestUpload = async (event) => {
    event.preventDefault()
    if (!requestFile) {
      toast.error('Please choose a file')
      return
    }
    const formData = new FormData()
    formData.append('file', requestFile)
    if (requestExpiry) formData.append('expiry_date', requestExpiry)
    if (requestDescription.trim()) formData.append('description', requestDescription.trim())
    try {
      await uploadForRequestMutation.mutateAsync({ requestId: activeRequest.id, formData })
      toast.success('Document uploaded — it is now pending HR review')
      setRequestUploadOpen(false)
      setActiveRequest(null)
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to upload document')
    }
  }

  const requestItems = docRequests?.items || []

  // ── Preview / download (authorized blob access) ──────────────────────────
  const [preview, setPreview] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewMime, setPreviewMime] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)

  const openPreview = async (document) => {
    setPreview(document)
    setPreviewUrl(null)
    setPreviewMime(null)
    setPreviewError(null)
    setPreviewLoading(true)
    try {
      const response = await hrDocumentFiles.preview(document.id)
      const mime = response.headers?.['content-type'] || document.mime_type || null
      setPreviewMime(mime)
      setPreviewUrl(window.URL.createObjectURL(response.data))
    } catch (err) {
      // Blob responses hide the backend detail; decode it for a useful message.
      setPreviewError(await documentFileErrorMessage(err, 'Unable to preview this document. You may not have permission.'))
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDownload = async (document) => {
    try {
      const response = await hrDocumentFiles.download(document.id)
      const filename = getDownloadFilename(
        response.headers?.['content-disposition'],
        document.filename || `document-${document.id}.pdf`,
      )
      downloadBlob(response.data, filename)
    } catch (err) {
      toast.error(await documentFileErrorMessage(err, 'Failed to download document'))
    }
  }

  // Revoke the preview object URL when the modal closes or this page unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) window.URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl])

  const refetchAll = () => {
    refetchDocs()
    refetchStatus()
    refetchRequests()
  }

  if (profileLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (profileError || !profile) {
    return (
      <EmptyState
        icon={FileText}
        title="Employee profile unavailable"
        description="Your HR employee profile is required to view and submit documents."
      />
    )
  }

  const loading = docsLoading || statusLoading

  return (
    <div className="space-y-5">
      {/* Header + Upload */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-sky-50 p-1.5 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">My Documents</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Submissions go to HR for review before they are marked approved.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={refetchAll}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
            </Button>
            <Button size="sm" onClick={() => openUpload(null)} disabled={!canUploadAnything || uploadMutation.isLoading}>
              <UploadCloud className="mr-1.5 h-3.5 w-3.5" /> Upload Document
            </Button>
          </div>
        </div>
      </section>

      {docsError || statusError ? (
        <EmptyState
          icon={AlertCircle}
          title="Unable to load your documents"
          description="Please try again in a moment."
          action={<Button variant="secondary" onClick={refetchAll}><RefreshCw className="mr-2 h-4 w-4" /> Retry</Button>}
        />
      ) : loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {/* Required documents + statuses */}
          {requiredRows.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Required Documents</h4>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {requiredRows.map((row) => (
                  <div
                    key={row.document_type_id}
                    className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{row.name}</p>
                        {row.filename ? <p className="truncate text-xs text-gray-400">{row.filename}</p> : null}
                      </div>
                      {reviewBadge(row.status)}
                    </div>
                    {row.status === 'rejected' && row.review_note ? (
                      <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                        <span className="font-semibold">Reason: </span>{row.review_note}
                      </p>
                    ) : null}
                    {row.status === 'pending' ? (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Awaiting HR review.</p>
                    ) : null}
                    {row.can_upload || row.can_preview ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {row.can_preview && row.document_id ? (
                          <Button variant="secondary" size="sm" onClick={() => openPreview({ id: row.document_id, filename: row.filename })}>
                            <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                          </Button>
                        ) : null}
                        {row.can_upload ? (
                          <Button variant="secondary" size="sm" onClick={() => openUpload(row.document_type_id)}>
                            <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                            {row.status === 'rejected' ? 'Resubmit' : 'Upload'}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Document requests from HR */}
          {requestItems.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Requested Documents</h4>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {requestItems.map((req) => {
                  const isOverdue = req.is_overdue
                  const statusColors = {
                    pending: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                    submitted: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
                    approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                    rejected: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
                    cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
                  }
                  const priorityColors = {
                    low: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
                    normal: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
                    high: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
                    urgent: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
                  }
                  return (
                    <div
                      key={req.id}
                      className={`rounded-xl border p-4 dark:border-gray-700 ${
                        isOverdue
                          ? 'border-rose-200 bg-rose-50/40 dark:bg-rose-900/10'
                          : 'border-gray-100 bg-gray-50/60 dark:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                            {req.document_type_name}
                          </p>
                          {req.instructions && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{req.instructions}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColors[req.status] || ''}`}>
                          {req.status}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${priorityColors[req.priority] || ''}`}>
                          {req.priority}
                        </span>
                        {isOverdue && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                            <AlertCircle className="h-3 w-3" /> Overdue
                          </span>
                        )}
                      </div>
                      {req.due_date && (
                        <p className="mt-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Calendar className="h-3 w-3" /> Due {formatDate(req.due_date)}
                        </p>
                      )}
                      {req.status === 'rejected' && (
                        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">Please re-upload the requested document.</p>
                      )}
                      {req.can_upload && (
                        <div className="mt-3">
                          <Button size="sm" onClick={() => openRequestUpload(req)}>
                            <FileUp className="mr-1.5 h-3.5 w-3.5" />
                            {req.status === 'rejected' ? 'Re-upload' : 'Upload Document'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* My document table */}
          <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">My Documents</h4>
            {items.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-gray-400">
                  No documents yet.
                  {canUploadAnything ? ' Use Upload Document to submit one for review.' : ''}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400 dark:border-gray-700">
                      <th className="py-2 pr-3">Document</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Uploaded</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((document) => {
                      const expiryMeta = EXPIRY_STATE_META[document.expiry_state] || EXPIRY_STATE_META.no_expiry
                      return (
                        <tr key={document.id} className="border-b border-gray-50 dark:border-gray-800">
                          <td className="max-w-56 py-2.5 pr-3">
                            <p className="truncate font-medium text-gray-800 dark:text-gray-200">{document.filename || 'Document'}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              V{document.current_version || 1} · {formatFileSize(document.file_size)}
                            </p>
                          </td>
                          <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-400">{document.document_type || '-'}</td>
                          <td className="py-2.5 pr-3">
                            <p className="text-gray-600 dark:text-gray-400">{formatDate(document.uploaded_at)}</p>
                            <p className="text-[11px] text-gray-400">
                              {document.submission_source === 'employee' ? 'Submitted by me' : 'Added by HR'}
                            </p>
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="space-y-1">
                              {reviewBadge(document.review_status)}
                              {document.review_status === 'rejected' && document.review_note ? (
                                <p className="max-w-52 text-xs text-rose-600 dark:text-rose-400">
                                  {document.review_note}
                                </p>
                              ) : null}
                              <span className="inline-block text-[11px] text-gray-400">
                                <span className={`rounded-full px-2 py-0.5 ${expiryMeta.badge}`}>{expiryMeta.label}</span>
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-2">
                              {document.can_preview && (
                                <Button variant="secondary" size="sm" onClick={() => openPreview(document)}>
                                  <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                                </Button>
                              )}
                              {document.can_download && (
                                <Button variant="secondary" size="sm" onClick={() => handleDownload(document)}>
                                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download
                                </Button>
                              )}
                              {document.can_resubmit && (
                                <Button size="sm" onClick={() => openUpload(document.document_type_id)}>
                                  <UploadCloud className="mr-1.5 h-3.5 w-3.5" /> Resubmit
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Upload / resubmit modal ──────────────────────────────────────── */}
      <Modal
        isOpen={uploadOpen}
        onClose={closeUpload}
        title={selectedRow?.document_id ? 'Resubmit Document' : 'Upload Document'}
        description={
          selectedRow?.document_id
            ? `Replace your rejected ${selectedRow.name} — a new version is created and sent for review.`
            : 'Your submission goes to HR for review and appears here immediately as “Pending Review”.'
        }
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeUpload} disabled={uploadMutation.isLoading}>Cancel</Button>
            <Button form="my-document-upload-form" type="submit" loading={uploadMutation.isLoading} loadingText="Submitting…">
              <UploadCloud className="mr-2 h-4 w-4" />
              {selectedRow?.document_id ? 'Resubmit' : 'Submit for Review'}
            </Button>
          </div>
        }
      >
        <form id="my-document-upload-form" onSubmit={handleUpload} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="my-doc-type">
              Document Type <span className="ml-1 text-red-600">*</span>
            </label>
            <select
              id="my-doc-type"
              aria-label="Document type"
              className={inputClassName}
              value={selectedTypeId}
              onChange={(event) => setSelectedTypeId(event.target.value)}
              disabled={Boolean(presetTypeId)}
            >
              <option value="">Select a document type…</option>
              {uploadableRows
                .filter((row) => row.can_upload)
                .map((row) => (
                  <option key={row.document_type_id} value={row.document_type_id}>{row.name}</option>
                ))}
            </select>
            {!selectedTypeId && (
              <p className="text-xs text-gray-400">Only document types enabled by HR for employee upload are listed.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              File <span className="ml-1 text-red-600">*</span>
            </label>
            <input
              type="file"
              aria-label="Choose file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="block w-full cursor-pointer rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 transition hover:border-sky-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">PDF, JPG, PNG, DOC, DOCX</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Expiry Date <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
              </label>
              <input
                type="date"
                className={inputClassName}
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                aria-label="Expiry date"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Declare when this particular document expires. Leave blank if it never expires.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
              <input
                className={inputClassName}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional note for HR…"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Preview modal ────────────────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(preview)}
        onClose={() => {
          setPreview(null)
          // Dropping the URL triggers the effect cleanup that revokes it.
          setPreviewUrl(null)
          setPreviewMime(null)
          setPreviewError(null)
        }}
        title="Document Preview"
        description={preview?.filename}
        size="xl"
        bodyClassName="flex flex-col"
        footer={
          preview ? (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>
              <Button onClick={() => handleDownload(preview)}>
                <Download className="mr-2 h-4 w-4" /> Download
              </Button>
            </div>
          ) : null
        }
      >
        {previewLoading ? (
          <div className="flex h-80 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : previewError ? (
          <EmptyState icon={ShieldAlert} title="Preview unavailable" description={previewError} />
        ) : previewUrl && previewMime?.startsWith('image/') ? (
          <img src={previewUrl} alt={preview?.filename || 'Document preview'} className="max-h-[70vh] w-auto rounded-xl border border-gray-200 object-contain dark:border-gray-700" />
        ) : previewUrl ? (
          <iframe src={previewUrl} title="Document preview" className="h-[70vh] w-full rounded-xl border border-gray-200 dark:border-gray-700" />
        ) : null}
      </Modal>

      {/* ── Upload for document request modal ────────────────────────────── */}
      <Modal
        isOpen={requestUploadOpen}
        onClose={closeRequestUpload}
        title="Upload Requested Document"
        description={activeRequest ? `Upload "${activeRequest.document_type_name}" as requested by HR.` : ''}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeRequestUpload} disabled={uploadForRequestMutation.isLoading}>Cancel</Button>
            <Button form="request-upload-form" type="submit" loading={uploadForRequestMutation.isLoading} loadingText="Uploading…">
              <UploadCloud className="mr-2 h-4 w-4" /> Submit
            </Button>
          </div>
        }
      >
        <form id="request-upload-form" onSubmit={handleRequestUpload} className="space-y-4">
          {activeRequest?.instructions && (
            <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
              <span className="font-medium">Instructions: </span>{activeRequest.instructions}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              File <span className="ml-1 text-red-600">*</span>
            </label>
            <input
              type="file"
              aria-label="Choose file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(event) => setRequestFile(event.target.files?.[0] || null)}
              className="block w-full cursor-pointer rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 transition hover:border-sky-400 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">PDF, JPG, PNG, DOC, DOCX</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Expiry Date <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
              </label>
              <input
                type="date"
                className={inputClassName}
                value={requestExpiry}
                onChange={(event) => setRequestExpiry(event.target.value)}
                aria-label="Expiry date"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Declare when this document expires. Leave blank if it never expires.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
              <input
                className={inputClassName}
                value={requestDescription}
                onChange={(event) => setRequestDescription(event.target.value)}
                placeholder="Optional note for HR…"
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default MyDocuments
