import { useState } from 'react'
import { useMutation, useQuery } from 'react-query'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Button, Skeleton } from '../components/ui'
import { clientsAPI } from '../api/clients'

function errorMessage(error, fallback) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  return detail?.message || error?.message || fallback
}

export default function PublicAssetUpload() {
  const { token } = useParams()
  const [files, setFiles] = useState([])
  const [notes, setNotes] = useState('')

  const requestQuery = useQuery(
    ['public-asset-upload', token],
    () => clientsAPI.getAssetUploadRequest(token),
    { enabled: Boolean(token), retry: false }
  )

  const uploadMutation = useMutation(
    () => clientsAPI.uploadAssetRequestFiles(token, { files, notes }),
    {
      onSuccess: () => {
        toast.success('Asset uploaded')
        setFiles([])
        setNotes('')
        requestQuery.refetch()
      },
      onError: (error) => toast.error(errorMessage(error, 'Failed to upload asset')),
    }
  )

  const data = requestQuery.data || {}
  const requirement = data.requirement || {}
  const client = data.client || {}

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <section className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {requestQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : requestQuery.isError ? (
          <div>
            <h1 className="text-xl font-bold">Asset request unavailable</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{errorMessage(requestQuery.error, 'This link is invalid or expired.')}</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-primary-700 dark:text-primary-300">{client.company_name || client.name || 'Client onboarding'}</p>
              <h1 className="mt-1 text-2xl font-bold">{requirement.name || 'Upload asset'}</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {requirement.request_note || requirement.description || 'Please upload the requested onboarding asset.'}
              </p>
              {data.expires_at ? <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Link expires {new Date(data.expires_at).toLocaleDateString()}</p> : null}
            </div>

            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              File
              <input
                type="file"
                multiple
                disabled={uploadMutation.isLoading}
                onChange={(event) => setFiles(Array.from(event.target.files || []))}
                className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100 dark:text-gray-300 dark:file:bg-primary-950 dark:file:text-primary-200"
              />
            </label>

            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Note
              <textarea
                rows={3}
                value={notes}
                disabled={uploadMutation.isLoading}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                placeholder="Optional context"
              />
            </label>

            <Button
              type="button"
              className="w-full"
              disabled={!files.length || uploadMutation.isLoading}
              loading={uploadMutation.isLoading}
              loadingText="Uploading..."
              onClick={() => uploadMutation.mutate()}
            >
              Upload Asset
            </Button>
          </div>
        )}
      </section>
    </main>
  )
}
