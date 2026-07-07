import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import Papa from 'papaparse'
import toast from 'react-hot-toast'
import { Upload, Download, Shuffle, Users, FileText, Sparkles, CheckCircle2, ListChecks, Users2 } from 'lucide-react'
import { salesApi } from '../api/sales'
import { departmentsAPI } from '../api/departments'
import { usersAPI } from '../api/users'
import { Button, EmptyState, FormField, Modal, inputClassName } from '../components/ui'
import { CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../components/crm'
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
  const assignableUsers = useMemo(
    () => users.filter((user) => String(user.role || '').toLowerCase() === 'employee'),
    [users]
  )

  const hasPreview = previewRows.length > 0
  const previewCount = previewRows.length

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
      queryClient.invalidateQueries('crm-pipeline-board')
      queryClient.invalidateQueries('crm-leads-entry')
      queryClient.invalidateQueries('crm-lead-duplicates')
      queryClient.invalidateQueries('crm-assigned-leads')
      queryClient.invalidateQueries('crm-lead-workspace')
      queryClient.invalidateQueries('sales-prospects')
    } catch (error) {
      const message = error?.response?.data?.detail || error?.message || 'Failed to upload leads'
      toast.error(message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <CRMPage className="p-6">
      <CRMPageTitle
        eyebrow="CRM Import"
        title="Bulk Leads"
        description="Upload leads once, preview them before import, then assign them into the same CRM pipeline used everywhere else."
        actions={(
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
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CRMStatCard icon={Upload} label="Upload status" value={file ? 'Ready' : 'Waiting'} helper={file ? file.name : 'Choose a CSV file'} tone="blue" />
        <CRMStatCard icon={ListChecks} label="Preview rows" value={String(previewCount)} helper="First 20 parsed rows shown below" tone="amber" />
        <CRMStatCard icon={Users2} label="Assignable team" value={String(assignableUsers.length)} helper="Employees available for routing" tone="emerald" />
      </div>

      <CRMSection
        title="Import flow"
        description="Step 1: upload a CSV. Step 2: confirm the preview. Step 3: choose how leads should be assigned."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => handleFile(null)}>
              Clear file
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={!file || !!fileError}>
              <Upload className="h-4 w-4" />
              Upload leads
            </Button>
          </div>
        )}
      >
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-dashed border-primary-200 bg-primary-50/40 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">1. Upload CSV</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Required: `email`. Suggested: `name`, `phone`, `company`, `source`, `status`, `remark`.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-medium text-primary-700 shadow-sm ring-1 ring-primary-100 hover:bg-primary-50">
                  <Upload className="h-4 w-4" />
                  Choose file
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(event) => handleFile(event.target.files?.[0])}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {fileError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {fileError}
              </div>
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
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-surface-border/80 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Shuffle className="h-4 w-4 text-primary-600" />
                <h3 className="text-sm font-semibold text-gray-900">2. Assignment rules</h3>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                <li>Round robin assigns one lead at a time to each selected employee.</li>
                <li>Evenly balances the import across the selected team.</li>
                <li>Select a department to restrict assignment to that department's users.</li>
                <li>Manual sends all uploaded leads to one employee.</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-surface-border/80 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary-600" />
                <h3 className="text-sm font-semibold text-gray-900">3. Team visibility</h3>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {assignableUsers.length
                  ? `${assignableUsers.length} employees are available for assignment.`
                  : 'No assignable employees found yet.'}
              </p>
              {departmentId ? (
                <p className="mt-3 text-sm text-gray-600">
                  Department selected. Leads will be split across{' '}
                  <span className="font-semibold">
                    {departments.find((department) => getId(department) === departmentId)?.name || 'this department'}
                  </span>
                  .
                </p>
              ) : null}
              {targetUserId ? (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Manual assignee selected
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-surface-border/80 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary-600" />
                <h3 className="text-sm font-semibold text-gray-900">Built-in test data</h3>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Use the sample CSV first to verify upload, preview, and auto-assignment.
              </p>
            </div>
          </div>
        </div>
      </CRMSection>

      <CRMSection
        title="Preview"
        description="Review parsed rows before confirming import. This uses the same CSV state that will be uploaded."
        actions={<span className="text-xs text-gray-500">{hasPreview ? `${previewCount} rows loaded` : 'No file loaded'}</span>}
      >
        {hasPreview ? (
          <div className="overflow-x-auto rounded-2xl border border-surface-border/80">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-950">
                <tr>
                  {SAMPLE_HEADERS.map((header) => (
                    <th key={header} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-900">
                {previewRows.map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                    {SAMPLE_HEADERS.map((header) => (
                      <td key={header} className="px-4 py-3 text-gray-700 dark:text-gray-200">
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
      </CRMSection>

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
    </CRMPage>
  )
}
