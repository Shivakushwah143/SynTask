import { useState } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, Download, Eye, FileText, Loader2, ShieldAlert } from 'lucide-react'
import { hrDocumentFiles } from '../../../api/hrDocuments'
import { useMyDocuments, useMyProfile } from '../../../hooks/useMyHr'
import { Button, EmptyState, Modal, Skeleton } from '../../../components/ui'
import { downloadBlob, getDownloadFilename } from '../../../utils/download'
import { EXPIRY_STATE_META, formatDate } from './myHrUtils'

const MyDocuments = () => {
  const { data: profile, isLoading: profileLoading, isError: profileError } = useMyProfile()
  const { data: documents, isLoading: docsLoading, isError: docsError, refetch } = useMyDocuments(profile?.id)

  const [preview, setPreview] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState(null)

  const openPreview = async (document) => {
    setPreview(document)
    setPreviewUrl(null)
    setPreviewError(null)
    setPreviewLoading(true)
    try {
      const response = await hrDocumentFiles.preview(document.id)
      setPreviewUrl(window.URL.createObjectURL(response.data))
    } catch (err) {
      setPreviewError(err?.response?.data?.detail || 'Unable to preview this document. You may not have permission.')
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
      toast.error(err?.response?.data?.detail || 'Failed to download document')
    }
  }

  if (profileLoading || docsLoading) {
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
        description="Your HR employee profile is required to view documents."
      />
    )
  }

  if (docsError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Unable to load your documents"
        description="Please try again in a moment."
        action={<Button variant="secondary" onClick={() => refetch()}>Retry</Button>}
      />
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-lg bg-sky-50 p-1.5 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
            <FileText className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">My Documents</h3>
        </div>

        {!documents || documents.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">No employee-visible documents are available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400 dark:border-gray-700">
                  <th className="py-2 pr-3">Document</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Uploaded</th>
                  <th className="py-2 pr-3">Expiry</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => {
                  const expiryMeta = EXPIRY_STATE_META[document.expiry_state] || EXPIRY_STATE_META.no_expiry
                  return (
                    <tr key={document.id} className="border-b border-gray-50 dark:border-gray-800">
                      <td className="max-w-64 py-2.5 pr-3">
                        <p className="truncate font-medium text-gray-800 dark:text-gray-200">{document.filename || 'Document'}</p>
                        {document.description ? <p className="truncate text-xs text-gray-400">{document.description}</p> : null}
                      </td>
                      <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-400">{document.document_type || '-'}</td>
                      <td className="py-2.5 pr-3 text-gray-600 dark:text-gray-400">{formatDate(document.uploaded_at)}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${expiryMeta.badge}`}>{expiryMeta.label}</span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-2">
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

      {/* Preview modal */}
      <Modal
        isOpen={Boolean(preview)}
        onClose={() => setPreview(null)}
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
        ) : previewUrl ? (
          <iframe src={previewUrl} title="Document preview" className="h-[70vh] w-full rounded-xl border border-gray-200 dark:border-gray-700" />
        ) : null}
      </Modal>
    </div>
  )
}

export default MyDocuments
