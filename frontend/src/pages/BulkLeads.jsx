import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import Papa from 'papaparse'
import toast from 'react-hot-toast'
import { Upload, Download, Shuffle, Users, FileText, Sparkles } from 'lucide-react'
import { salesApi } from '../api/sales'
import { departmentsAPI } from '../api/departments'
import { usersAPI } from '../api/users'
import { Button, EmptyState, FormField, Modal, PageHeader, inputClassName } from '../components/ui'
import { asArray, getId } from './phase4Utils'

const SAMPLE_ROWS = [
  {
    name: 'Amit Sharma',
    email: 'amit.sharma@example.com',
    phone: '+91 98765 43210',
    company: 'Apex Builders',
    source: 'website',
    status: 'new',
    remark: 'Interested in 2BHK options',
  },
  {
    name: 'Priya Verma',
    email: 'priya.verma@example.com',
    phone: '+91 99887 77665',
    company: 'Skyline Homes',
    source: 'referral',
    status: 'new',
    remark: 'Wants a callback in the evening',
  },
]

const SAMPLE_HEADERS = ['name', 'email', 'phone', 'company', 'source', 'status', 'remark']

const SAMPLE_CSV = Papa.unparse(SAMPLE_ROWS)

export default function BulkLeads() {
  const queryClient = useQueryClient()
  const [file, setFile] = useState(null)
  const [strategy, setStrategy] = useState('round-robin')
  const [departmentId, setDepartmentId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [previewRows, setPreviewRows] = useState([])
  const [uploading, setUploading] = useState(false)
  const [fileError, setFileError] = useState('')

  const { data: usersData } = useQuery('bulk-leads-assignable-users', () => usersAPI.getAssignableUsers())
  const { data: departmentsData } = useQuery('bulk-leads-departments', departmentsAPI.listDepartments)
  const users = asArray(usersData, ['users'])
  const departments = asArray(departmentsData, ['departments'])
  const assignableUsers = useMemo(() => users.filter((user) => ['lead', 'employee'].includes(String(user.role || '').toLowerCase())), [users])

  const hasPreview = previewRows.length > 0

  const handleFile = async (selected) => {
    setFileError('')
    setPreviewRows([])
    if (!selected) {
      setFile(null)
      return
    }

    if (!selected.name.toLowerCase().endsWith('.csv')) {
      setFileError('Please upload a CSV file.')
      return
    }

    setFile(selected)
    Papa.parse(selected, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta, errors }) => {
        if (errors?.length) {
          setFileError('Could not read the CSV file.')
          setPreviewRows([])
          return
        }
        const normalizedFields = (meta.fields || []).map((field) => String(field || '').trim().toLowerCase())
        if (!normalizedFields.includes('email')) {
          setFileError('CSV must include an email column.')
        }
        setPreviewRows(data.slice(0, 20))
      },
      error: () => setFileError('Could not parse the selected file.'),
    })
  }

  const loadSampleData = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' })
    const sampleFile = new File([blob], 'sample_bulk_leads.csv', { type: 'text/csv' })
    handleFile(sampleFile)
    toast.success('Sample CSV loaded')
  }

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bulk-leads-sample.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const submit = async () => {
    if (!file) {
      toast.error('Choose a CSV file first')
      return
    }
    if (strategy === 'manual' && !targetUserId) {
      toast.error('Select an employee for manual assignment')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('strategy', departmentId ? 'evenly' : strategy)
      if (departmentId) formData.append('target_department_id', departmentId)
      if (strategy === 'manual') formData.append('target_user_id', targetUserId)

      const result = await salesApi.bulkUploadProspects(formData)
      const uploaded = result?.total_uploaded ?? result?.data?.total_uploaded ?? 0
      const skipped = result?.skipped_rows ?? result?.data?.skipped_rows ?? 0

      toast.success(`Uploaded ${uploaded} lead${uploaded === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}`)
      setConfirmOpen(false)
      setFile(null)
      setPreviewRows([])
      setDepartmentId('')
      setTargetUserId('')
      queryClient.invalidateQueries()
    } catch (error) {
      const message = error?.response?.data?.detail || error?.message || 'Failed to upload leads'
      toast.error(message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Bulk Leads"
        description="Upload leads in CSV format and auto-assign them to a department or employee team."
        actions={
          <>
            <Button variant="secondary" onClick={downloadSample}>
              <Download className="h-4 w-4" />
              Download sample
            </Button>
            <Button variant="secondary" onClick={loadSampleData}>
              <Sparkles className="h-4 w-4" />
              Load test data
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/40 p-6 text-center">
            <Upload className="mx-auto h-10 w-10 text-primary-600" />
            <p className="mt-3 text-sm font-semibold text-gray-900">Upload a leads CSV</p>
            <p className="mt-1 text-sm text-gray-600">
              Required: `email`. Suggested: `name`, `phone`, `company`, `source`, `status`, `remark`.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={(event) => handleFile(event.target.files?.[0])}
                className="block text-sm text-gray-700 file:mr-4 file:rounded-full file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100"
              />
            </div>
          </div>

          {fileError ? (
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{fileError}</div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Assignment strategy">
              <select
                className={inputClassName}
                value={strategy}
                onChange={(event) => setStrategy(event.target.value)}
                disabled={Boolean(departmentId)}
              >
                <option value="round-robin">Round robin</option>
                <option value="evenly">Evenly</option>
                <option value="manual">Manual</option>
              </select>
            </FormField>

            <FormField label="Department">
              <select
                className={inputClassName}
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={getId(department)} value={getId(department)}>
                    {department.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Assign to">
              <select
                className={inputClassName}
                value={targetUserId}
                onChange={(event) => setTargetUserId(event.target.value)}
                disabled={strategy !== 'manual' || !!departmentId}
              >
                <option value="">Select employee</option>
                {assignableUsers.map((user) => (
                  <option key={getId(user)} value={getId(user)}>
                    {user.first_name} {user.last_name} - {user.role}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setConfirmOpen(true)} disabled={!file || !!fileError}>
              <Upload className="h-4 w-4" />
              Upload leads
            </Button>
            <Button variant="secondary" onClick={() => handleFile(null)}>
              Clear file
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Shuffle className="h-4 w-4 text-primary-600" />
              <h3 className="text-sm font-semibold text-gray-900">How assignment works</h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-gray-600">
              <li>Round robin assigns one lead at a time to each selected employee.</li>
              <li>Evenly balances the import across the selected team.</li>
              <li>Select a department to assign the uploaded leads only within that department.</li>
              <li>Manual sends all uploaded leads to one employee.</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-600" />
              <h3 className="text-sm font-semibold text-gray-900">Selected team</h3>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {assignableUsers.length
                ? `${assignableUsers.length} employees and leads are available for assignment.`
                : 'No assignable employees found yet.'}
            </p>
            {departmentId ? (
              <p className="mt-3 text-sm text-gray-600">
                Department selected. Leads will be split across users in{' '}
                <span className="font-semibold">
                  {departments.find((department) => getId(department) === departmentId)?.name || 'this department'}
                </span>
                {' '}using even distribution.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary-600" />
              <h3 className="text-sm font-semibold text-gray-900">Test data included</h3>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Use the built-in sample CSV first to verify upload, preview, and auto-assignment.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Preview</h3>
          <span className="text-xs text-gray-500">{hasPreview ? `${previewRows.length} rows loaded` : 'No file loaded'}</span>
        </div>

        {hasPreview ? (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {SAMPLE_HEADERS.map((header) => (
                    <th key={header} className="px-4 py-3 text-left font-medium text-gray-600">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {previewRows.map((row, index) => (
                  <tr key={index}>
                    {SAMPLE_HEADERS.map((header) => (
                      <td key={header} className="px-4 py-3 text-gray-700">
                        {row?.[header] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="No preview yet"
            description="Upload a CSV file or load the sample data to preview the leads here."
          />
        )}
      </div>

      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm bulk upload">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            You are about to upload {previewRows.length || 'the selected'} lead rows using{' '}
            <span className="font-semibold">{strategy}</span> assignment.
            {departmentId ? ' Department-based splitting is enabled.' : ''}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={uploading}>
              Confirm upload
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
