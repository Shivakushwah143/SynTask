import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import Papa from 'papaparse'
import toast from 'react-hot-toast'
import { ArrowRight, CheckCircle2, Download, FileSpreadsheet, FileUp, Filter, ListChecks, Sparkles, Upload, Users } from 'lucide-react'
import { salesApi } from '../api/sales'
import { departmentsAPI } from '../api/departments'
import { usersAPI } from '../api/users'
import { Button, EmptyState, FormField, Modal, inputClassName } from '../components/ui'
import { CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../components/crm'
import { asArray, getId } from './phase4Utils'

const SAMPLE_ROWS = [
  { name: 'Amit Sharma', email: 'amit.sharma@example.com', phone: '+91 98765 43210', company: 'Apex Builders', source: 'website', status: 'new', remark: 'Interested in 2BHK options' },
  { name: 'Priya Verma', email: 'priya.verma@example.com', phone: '+91 99887 77665', company: 'Skyline Homes', source: 'referral', status: 'new', remark: 'Wants a callback in the evening' },
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
  const assignableUsers = useMemo(() => users.filter((user) => String(user.role || '').toLowerCase() === 'employee'), [users])

  const hasPreview = previewRows.length > 0
  const previewCount = previewRows.length

  const handleFile = (selected) => {
    setFileError('')
    setPreviewRows([])
    if (!selected) {
      setFile(null)
      return
    }
    if (!selected.name.toLowerCase().match(/\.(csv|xlsx)$/)) {
      setFileError('Please upload a CSV or XLSX file.')
      setFile(null)
      return
    }

    setFile(selected)
    const isCsv = selected.name.toLowerCase().endsWith('.csv')
    if (!isCsv) {
      setFileError('XLSX preview is available after import; CSV preview is shown here for quick checks.')
    }

    if (isCsv) {
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
          if (!normalizedFields.includes('email')) setFileError('CSV must include an email column.')
          setPreviewRows(data.slice(0, 20))
        },
        error: () => setFileError('Could not parse the selected file.'),
      })
    }
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
      toast.error('Choose a file first')
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
      <div className="absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(circle_at_top,_rgba(91,100,228,0.22),_transparent_58%),linear-gradient(180deg,#08142f_0%,#08142f_45%,#f4f7fb_45%,#f4f7fb_100%)]" />
      <CRMPageTitle
        eyebrow="CRM Intake"
        title="Lead Intake"
        description="Import prospects, validate entries, inspect duplicates, and route leads into the assignment flow."
        actions={(
          <>
            <Button variant="secondary" onClick={downloadSample}>
              <Download className="h-4 w-4" />
              Download sample
            </Button>
            <Button variant="secondary" onClick={loadSampleData}>
              <Sparkles className="h-4 w-4" />
              Load sample
            </Button>
          </>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CRMStatCard icon={Upload} label="Upload status" value={file ? 'Ready' : 'Waiting'} helper={file ? file.name : 'Choose a CSV or XLSX file'} tone="blue" />
        <CRMStatCard icon={ListChecks} label="Preview rows" value={String(previewCount)} helper="First 20 parsed rows shown below" tone="amber" />
        <CRMStatCard icon={Users} label="Assignable team" value={String(assignableUsers.length)} helper="Employees available for routing" tone="emerald" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="space-y-6">
          <CRMSection
            title="Import flow"
            description="Upload, validate, preview, and confirm without leaving the intake workspace."
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
            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-dashed border-primary-200 bg-gradient-to-br from-primary-50 via-white to-sky-50 p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">1. Upload file</p>
                      <p className="mt-1 text-sm text-gray-600">
                        Required: <code>email</code>. Suggested: <code>name</code>, <code>phone</code>, <code>company</code>, <code>source</code>, <code>status</code>, <code>remark</code>.
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 text-xs font-medium text-primary-700 shadow-sm ring-1 ring-primary-100">
                      CSV / XLSX
                    </div>
                  </div>
                  <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-primary-200 bg-white/70 px-6 py-12 text-center">
                    <FileSpreadsheet className="h-10 w-10 text-primary-500" />
                    <p className="mt-3 text-sm font-semibold text-gray-900">Drag & drop or click to choose</p>
                    <p className="mt-1 text-xs text-gray-500">Import lead rows and stage them for preview.</p>
                    <input
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={(event) => handleFile(event.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                </div>

                {fileError ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    {fileError}
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-3xl border border-surface-border/80 bg-white shadow-sm">
                  <div className="border-b border-surface-border/80 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-semibold text-gray-900">2. Validate and route</h3>
                    </div>
                  </div>
                  <div className="grid gap-4 p-5 md:grid-cols-2">
                    <FormField label="Assignment strategy">
                      <select className={inputClassName} value={strategy} onChange={(event) => setStrategy(event.target.value)} disabled={Boolean(departmentId)}>
                        <option value="round-robin">Round robin</option>
                        <option value="evenly">Evenly</option>
                        <option value="least-loaded">Least loaded</option>
                        <option value="manual">Manual</option>
                      </select>
                    </FormField>
                    <FormField label="Department">
                      <select className={inputClassName} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                        <option value="">All departments</option>
                        {departments.map((department) => (
                          <option key={getId(department)} value={getId(department)}>{department.name}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Assign to">
                      <select className={inputClassName} value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} disabled={strategy !== 'manual' || Boolean(departmentId)}>
                        <option value="">Select employee</option>
                        {assignableUsers.map((user) => (
                          <option key={getId(user)} value={getId(user)}>
                            {user.first_name} {user.last_name} - {user.role}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Queue mode">
                      <div className="flex h-10 items-center rounded-xl border border-surface-border/80 bg-gray-50 px-3 text-sm text-gray-600">
                        {departmentId ? 'Department routing' : strategy === 'manual' ? 'Manual assignment' : 'Auto assignment'}
                      </div>
                    </FormField>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-surface-border/80 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Validation checks</h3>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-gray-600">
                    <li>Required fields are checked before preview.</li>
                    <li>Duplicate emails are flagged during import.</li>
                    <li>Valid rows continue even when some rows fail.</li>
                    <li>Import history is saved for retry and audit.</li>
                  </ul>
                </div>
                <div className="rounded-3xl border border-surface-border/80 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Routing status</h3>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {assignableUsers.length ? `${assignableUsers.length} employees are available for assignment.` : 'No assignable employees found yet.'}
                  </p>
                  {departmentId ? (
                    <p className="mt-3 text-sm text-gray-600">
                      Department selected: <span className="font-semibold">{departments.find((department) => getId(department) === departmentId)?.name || 'selected department'}</span>.
                    </p>
                  ) : null}
                  {targetUserId ? (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Manual assignee selected
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </CRMSection>

          <CRMSection
            title="Preview"
            description="Inspect the top parsed rows before confirming the upload."
            actions={<span className="text-xs text-gray-500">{hasPreview ? `${previewCount} rows loaded` : 'No file loaded'}</span>}
          >
            {hasPreview ? (
              <div className="overflow-x-auto rounded-2xl border border-surface-border/80">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-950">
                    <tr>
                      {SAMPLE_HEADERS.map((header) => (
                        <th key={header} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-900">
                    {previewRows.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                        {SAMPLE_HEADERS.map((header) => (
                          <td key={header} className="px-4 py-3 text-gray-700 dark:text-gray-200">{row?.[header] || '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={FileUp}
                title="No preview yet"
                description="Upload a CSV file or load the sample data to preview the leads here."
              />
            )}
          </CRMSection>
        </div>

        <div className="space-y-6">
          <CRMSection title="Import workflow" description="The intake path mirrors the final CRM flow.">
            <div className="space-y-4">
              <div className="rounded-3xl border border-surface-border/80 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Flow</h3>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {['Import / Manual Create', 'Validation', 'Duplicate Detection', 'Assignment Engine', 'Sales Queue'].map((item, index) => (
                    <span key={item} className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 text-gray-700 ring-1 ring-gray-200">
                      <span className="font-semibold text-primary-600">{index + 1}</span>
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-surface-border/80 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-primary-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Next actions</h3>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-gray-600">
                  <li>Preview the rows.</li>
                  <li>Choose the assignment mode.</li>
                  <li>Confirm import.</li>
                </ul>
              </div>

              <div className="rounded-3xl border border-surface-border/80 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Sample file</h3>
                </div>
                <p className="mt-2 text-sm text-gray-600">Use the sample CSV first to verify upload, preview, and auto-assignment.</p>
                <Button className="mt-4 w-full" variant="secondary" onClick={loadSampleData}>
                  Load sample data
                </Button>
              </div>
            </div>
          </CRMSection>
        </div>
      </div>

      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm bulk upload" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            You are about to upload {previewRows.length || 'the selected'} lead rows using{' '}
            <span className="font-semibold">{strategy}</span> assignment.
            {departmentId ? ' Department-based splitting is enabled.' : ''}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={uploading}>Confirm upload</Button>
          </div>
        </div>
      </Modal>
    </CRMPage>
  )
}
