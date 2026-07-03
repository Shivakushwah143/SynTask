import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Download, FileText, Lock, Plus, Trash2, UploadCloud } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { CRMEmptyState, CRMSection } from '../../../components/crm'
import { Badge, Button, ConfirmDialog } from '../../../components/ui'
import { formatShortDate } from '../pipeline/utils'

export const LEAD_FILES_QUERY_KEY = 'crm-lead-files'
const WORKSPACE_QUERY_KEY = 'crm-lead-workspace'

const formatFileSize = (value) => {
  const size = Number(value || 0)
  if (!Number.isFinite(size) || size <= 0) return 'N/A'
  const units = ['B', 'KB', 'MB', 'GB']
  let current = size
  let unitIndex = 0
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }
  return `${current >= 10 || unitIndex === 0 ? Math.round(current) : current.toFixed(1)} ${units[unitIndex]}`
}

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.detail || error?.message || fallback

export function LeadFilesTab({ leadId, lead }) {
  const queryClient = useQueryClient()
  const inputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const filesQuery = useQuery(
    [LEAD_FILES_QUERY_KEY, leadId],
    () => crmApi.getLeadFiles(leadId),
    {
      enabled: Boolean(leadId),
      retry: false,
      staleTime: 60 * 1000,
    }
  )

  const leadLabel = useMemo(
    () => lead?.company_name || lead?.prospect_name || lead?.primary_contact || 'this lead',
    [lead]
  )

  const refreshFiles = () => {
    queryClient.invalidateQueries([LEAD_FILES_QUERY_KEY, leadId])
    queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'timeline'])
  }

  const uploadMutation = useMutation(
    async (file) => {
      const formData = new FormData()
      formData.append('file', file)
      return crmApi.uploadLeadFile(leadId, formData)
    },
    {
      onSuccess: () => {
        toast.success('File uploaded')
        setSelectedFile(null)
        if (inputRef.current) inputRef.current.value = ''
        refreshFiles()
      },
      onError: (error) => {
        toast.error(getErrorMessage(error, 'Failed to upload file'))
      },
    }
  )

  const deleteMutation = useMutation(
    (fileId) => crmApi.deleteLeadFile(leadId, fileId),
    {
      onSuccess: () => {
        toast.success('File deleted')
        setDeleteTarget(null)
        refreshFiles()
      },
      onError: (error) => {
        toast.error(getErrorMessage(error, 'Failed to delete file'))
      },
    }
  )

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0] || null
    setSelectedFile(file)
  }

  const handleUpload = () => {
    if (!selectedFile) return
    uploadMutation.mutate(selectedFile)
  }

  const files = filesQuery.data?.files || []

  if (filesQuery.isError && filesQuery.error?.response?.status === 403) {
    return (
      <CRMSection title="Files" description={`Files for ${leadLabel}.`}>
        <CRMEmptyState
          icon={Lock}
          title="Access denied"
          description="You do not have permission to view files for this lead."
        />
      </CRMSection>
    )
  }

  if (filesQuery.isError) {
    return (
      <CRMSection title="Files" description={`Files for ${leadLabel}.`}>
        <CRMEmptyState
          icon={FileText}
          title="Files unavailable"
          description={getErrorMessage(filesQuery.error, 'The files section could not be loaded.')}
          action={(
            <Button type="button" variant="primary" onClick={() => filesQuery.refetch()}>
              Retry
            </Button>
          )}
        />
      </CRMSection>
    )
  }

  return (
    <>
      <CRMSection
        title="Files"
        description={`Lead-scoped file manager for ${leadLabel}.`}
        actions={<Badge label={`${files.length} files`} colorKey="draft" />}
      >
        <div className="space-y-5">
          <div className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Upload a file</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Files are stored in the existing upload service and associated with this lead.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  aria-label="Select lead file"
                />
                <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
                  <Plus className="h-4 w-4" />
                  Choose file
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  loading={uploadMutation.isLoading}
                  onClick={handleUpload}
                  disabled={!selectedFile}
                >
                  <UploadCloud className="h-4 w-4" />
                  Upload
                </Button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span>Selected:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {selectedFile ? selectedFile.name : 'No file selected'}
              </span>
            </div>
          </div>

          {filesQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : files.length ? (
            <div className="space-y-3">
              {files.map((file) => (
                <article key={file.id} className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge label={file.file_type || 'file'} colorKey="draft" />
                        <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {file.original_name || file.file_name}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <Badge label={`Size ${formatFileSize(file.file_size)}`} colorKey="draft" />
                        <Badge label={`Uploaded ${formatShortDate(file.uploaded_at)}`} colorKey="draft" />
                        <Badge label={`By ${file.uploaded_by_name || 'System'}`} colorKey="draft" />
                      </div>
                      <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                        {file.file_url}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => window.open(file.download_url || file.file_url, '_blank', 'noopener,noreferrer')}
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteTarget(file)}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <CRMEmptyState
              icon={FileText}
              title="No files yet"
              description="Upload the first file to keep lead documents in one place."
            />
          )}
        </div>
      </CRMSection>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isLoading}
        title="Delete file"
        message="This file will be removed from the lead workspace and deleted from storage."
        confirmLabel="Delete"
      />
    </>
  )
}
