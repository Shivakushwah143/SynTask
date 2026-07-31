import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import Papa from 'papaparse'
import toast from 'react-hot-toast'
import { 
  ArrowRight, 
  CheckCircle2, 
  Download, 
  FileSpreadsheet, 
  FileUp, 
  Filter, 
  ListChecks, 
  Sparkles, 
  Upload, 
  Users, 
  AlertTriangle,
  Database,
  Settings,
  UserCheck,
  Award,
  Clock,
  TrendingUp,
  Zap,
  Shield
} from 'lucide-react'
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

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

// Status Indicator Component
const StatusIndicator = ({ status, label }) => {
  const statusConfigs = {
    ready: { color: 'emerald', icon: CheckCircle2 },
    waiting: { color: 'amber', icon: Clock },
    error: { color: 'rose', icon: AlertTriangle },
  }
  const config = statusConfigs[status] || statusConfigs.waiting
  const Icon = config.icon

  return (
    <div className={`flex items-center gap-2 rounded-lg bg-${config.color}-50 px-3 py-2 text-${config.color}-700 dark:bg-${config.color}-900/20 dark:text-${config.color}-300`}>
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

export default function BulkLeads() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [strategy, setStrategy] = useState('round-robin')
  const [departmentId, setDepartmentId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [previewRows, setPreviewRows] = useState([])
  const [uploading, setUploading] = useState(false)
  const [fileError, setFileError] = useState('')

  const { data: usersData } = useQuery('bulk-leads-assignable-users', () => usersAPI.getAssignableUsersWithJuniors())
  const { data: departmentsData } = useQuery('bulk-leads-departments', departmentsAPI.listDepartments)
  const users = asArray(usersData, ['users'])
  const departments = asArray(departmentsData, ['departments'])
  const assignableUsers = useMemo(() => users.filter((user) => user.status === 'active'), [users])

  const hasPreview = previewRows.length > 0
  const previewCount = previewRows.length
  const importedCount = importResult?.total_uploaded ?? 0
  const assignedCount = Object.values(importResult?.assigned_breakdown || {}).reduce((sum, count) => sum + Number(count || 0), 0)
  const failedCount = importResult?.skipped_rows ?? 0
  const nextAction = assignedCount > 0
    ? { label: 'View Assigned Leads', href: '/crm/leads' }
    : { label: 'Open Qualification', href: '/crm/pipeline' }

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

      const result = await salesApi.bulkUploadLeads(formData)
      const uploaded = result?.total_uploaded ?? result?.data?.total_uploaded ?? 0
      const skipped = result?.skipped_rows ?? result?.data?.skipped_rows ?? 0
      const payload = result?.data || result || {}

      toast.success(`Uploaded ${uploaded} lead${uploaded === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}`)
      setConfirmOpen(false)
      setFile(null)
      setPreviewRows([])
      setDepartmentId('')
      setTargetUserId('')
      setImportResult({
        total_rows: payload.total_rows ?? 0,
        total_uploaded: payload.total_uploaded ?? 0,
        skipped_rows: payload.skipped_rows ?? 0,
        assigned_breakdown: payload.assigned_breakdown || {},
        warnings: payload.warnings || [],
        strategy: departmentId ? 'department routing' : strategy,
      })
      setResultOpen(true)
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
    <CRMPage className="p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-600 via-amber-600 to-yellow-600 p-6 text-white shadow-xl md:p-8 mb-6">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-indigo-200">CRM Intake</p>
                <h1 className="text-2xl font-bold md:text-3xl">Lead Intake</h1>
                <p className="mt-1 text-indigo-100">Import leads, validate entries, inspect duplicates, and route them into the assignment flow.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={downloadSample}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Download className="h-4 w-4" />
                Sample
              </button>
              <button
                onClick={loadSampleData}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Sparkles className="h-4 w-4" />
                Load Sample
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <StatCard
          label="Upload Status"
          value={file ? 'Ready' : 'Waiting'}
          icon={file ? CheckCircle2 : Upload}
          color={file ? 'emerald' : 'amber'}
          subtitle={file ? file.name : 'Choose a CSV or XLSX file'}
        />
        <StatCard
          label="Preview Rows"
          value={String(previewCount)}
          icon={ListChecks}
          color="blue"
          subtitle="First 20 parsed rows shown below"
        />
        <StatCard
          label="Assignable Team"
          value={String(assignableUsers.length)}
          icon={Users}
          color="indigo"
          subtitle="Team members available for routing"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="space-y-6">
          {/* Import Flow Section */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                    <Database className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-white">Import Flow</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Upload, validate, preview, and confirm</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleFile(null)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    Clear file
                  </button>
                  <button
                    onClick={() => setConfirmOpen(true)}
                    disabled={!file || !!fileError}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Leads
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4">
                  {/* File Upload Area */}
                  <div className="rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/30 p-6 transition hover:border-indigo-300 dark:border-indigo-800/50 dark:bg-indigo-950/20">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">1. Upload file</p>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          Required: <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-indigo-600 dark:bg-gray-800 dark:text-indigo-400">email</code>. 
                          Suggested: <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-indigo-600 dark:bg-gray-800 dark:text-indigo-400">name</code>, 
                          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-indigo-600 dark:bg-gray-800 dark:text-indigo-400">phone</code>, 
                          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-indigo-600 dark:bg-gray-800 dark:text-indigo-400">company</code>
                        </p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-sm ring-1 ring-indigo-100 dark:bg-gray-800 dark:text-indigo-300 dark:ring-indigo-800">
                        CSV / XLSX
                      </div>
                    </div>
                    <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-white/80 px-6 py-8 text-center transition hover:bg-indigo-50/50 dark:border-indigo-800/50 dark:bg-gray-900/50 dark:hover:bg-indigo-950/20">
                      <FileSpreadsheet className="h-10 w-10 text-indigo-500 dark:text-indigo-400" />
                      <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">Drag & drop or click to choose</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Import lead rows and stage them for preview.</p>
                      <input
                        type="file"
                        accept=".csv,.xlsx"
                        onChange={(event) => handleFile(event.target.files?.[0])}
                        className="hidden"
                      />
                    </label>
                    {file && !fileError && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                        File loaded: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                      </div>
                    )}
                  </div>

                  {fileError && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-300">
                      <AlertTriangle className="inline h-4 w-4 mr-2" />
                      {fileError}
                    </div>
                  )}

                  {/* Assignment Configuration */}
                  <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-700 dark:bg-gray-900/30">
                    <div className="flex items-center gap-2 mb-4">
                      <Settings className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">2. Validate and route</h3>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField label="Assignment strategy">
                        <select 
                          className={`${inputClassName} bg-white dark:bg-gray-800`} 
                          value={strategy} 
                          onChange={(event) => setStrategy(event.target.value)} 
                          disabled={Boolean(departmentId)}
                        >
                          <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="round-robin">Round robin</option>
                          <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="evenly">Evenly</option>
                          <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="least-loaded">Least loaded</option>
                          <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="manual">Manual</option>
                        </select>
                      </FormField>
                      <FormField label="Department">
                        <select 
                          className={`${inputClassName} bg-white dark:bg-gray-800`} 
                          value={departmentId} 
                          onChange={(event) => setDepartmentId(event.target.value)}
                        >
                          <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">All departments</option>
                          {departments.map((department) => (
                            <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={getId(department)} value={getId(department)}>{department.name}</option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="Assign to">
                        <select 
                          className={`${inputClassName} bg-white dark:bg-gray-800`} 
                          value={targetUserId} 
                          onChange={(event) => setTargetUserId(event.target.value)} 
                          disabled={strategy !== 'manual' || Boolean(departmentId)}
                        >
                          <option value="">Select team member</option>
                          {assignableUsers.map((user) => (
                            <option key={getId(user)} value={getId(user)}>
                              {user.first_name} {user.last_name} - {user.role}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="Queue mode">
                        <div className="flex h-10 items-center rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
                          {departmentId ? 'Department routing' : strategy === 'manual' ? 'Manual assignment' : 'Auto assignment'}
                        </div>
                      </FormField>
                    </div>
                  </div>
                </div>

                {/* Side info */}
                <div className="space-y-4">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-700 dark:bg-gray-900/30">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Validation checks</h3>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-gray-500 dark:text-gray-400">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                        Every row is imported as-is — no validation is applied.
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                        Rows without a mobile number still import.
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                        Repeated emails are imported (email dropped on duplicates).
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                        Import history is saved for retry and audit.
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-700 dark:bg-gray-900/30">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Routing status</h3>
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      {assignableUsers.length ? `${assignableUsers.length} team members are available for assignment.` : 'No assignable team members found yet.'}
                    </p>
                    {departmentId ? (
                      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                        Department selected: <span className="font-semibold text-gray-700 dark:text-gray-300">{departments.find((department) => getId(department) === departmentId)?.name || 'selected department'}</span>
                      </p>
                    ) : null}
                    {targetUserId ? (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Manual assignee selected
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-700 dark:bg-gray-900/30">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quick actions</h3>
                    </div>
                    <button
                      onClick={loadSampleData}
                      className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      <Sparkles className="inline h-4 w-4 mr-2" />
                      Load sample data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Section */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50/50 to-white p-4 dark:border-gray-700 dark:from-blue-950/20 dark:to-gray-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                    <ListChecks className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-white">Preview</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Inspect the top parsed rows before confirming</p>
                  </div>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{hasPreview ? `${previewCount} rows loaded` : 'No file loaded'}</span>
              </div>
            </div>
            <div className="p-4">
              {hasPreview ? (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        {SAMPLE_HEADERS.map((header) => (
                          <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {previewRows.map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                          {SAMPLE_HEADERS.map((header) => (
                            <td key={header} className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{row?.[header] || '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                    <FileUp className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">No preview yet</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Upload a CSV file or load the sample data to preview the leads here.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 bg-gradient-to-r from-purple-50/50 to-white p-4 dark:border-gray-700 dark:from-purple-950/20 dark:to-gray-800">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                  <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 dark:text-white">Import Workflow</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">The intake path mirrors the final CRM flow</p>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Flow</h3>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {['Import / Manual Create', 'Validation', 'Duplicate Detection', 'Assignment Engine', 'Sales Queue'].map((item, index) => (
                    <span key={item} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-gray-600 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700">
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">{index + 1}</span>
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Next actions</h3>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-gray-500 dark:text-gray-400">
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
                    Preview the rows.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
                    Choose the assignment mode.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
                    Confirm import.
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Sample file</h3>
                </div>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Use the sample CSV first to verify upload, preview, and auto-assignment.</p>
                <button
                  onClick={loadSampleData}
                  className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Sparkles className="inline h-4 w-4 mr-2" />
                  Load sample data
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Bulk Upload" size="lg">
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Confirm import</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Please review before proceeding</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You are about to upload {previewRows.length || 'the selected'} lead rows using{' '}
            <span className="font-semibold text-gray-900 dark:text-white">{strategy}</span> assignment.
            {departmentId ? ' Department-based splitting is enabled.' : ''}
          </p>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400">File:</span>
              <span className="font-medium text-gray-900 dark:text-white">{file?.name}</span>
              <span className="text-gray-500 dark:text-gray-400">Rows:</span>
              <span className="font-medium text-gray-900 dark:text-white">{previewRows.length}</span>
              <span className="text-gray-500 dark:text-gray-400">Strategy:</span>
              <span className="font-medium text-gray-900 dark:text-white">{strategy}</span>
              {departmentId && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Department:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{departments.find(d => getId(d) === departmentId)?.name}</span>
                </>
              )}
              {targetUserId && (
                <>
                  <span className="text-gray-500 dark:text-gray-400">Assignee:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {assignableUsers.find(u => getId(u) === targetUserId)?.first_name}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={uploading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Confirm Upload'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={resultOpen} onClose={() => setResultOpen(false)} title="Import Complete" size="lg">
        <div className="space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Import successful</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Leads have been processed and assigned</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-900/50">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Imported</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{importedCount}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-900/50">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Assigned</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{assignedCount}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-900/50">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Failed</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{failedCount}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center dark:border-gray-700 dark:bg-gray-900/50">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Warnings</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{importResult?.warnings?.length || 0}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Assignment strategy</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {importResult?.strategy === 'manual'
                ? 'Manual assignment was used for the imported leads.'
                : importResult?.strategy === 'department routing'
                  ? 'Department-based routing was used to distribute the imported leads.'
                  : `Automatic ${importResult?.strategy || strategy} assignment was used.`}
            </p>
          </div>

          {importResult?.warnings?.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-300">Failed rows</p>
              <div className="mt-2 max-h-40 space-y-1 overflow-auto text-sm text-amber-800 dark:text-amber-400">
                {importResult.warnings.slice(0, 8).map((item) => (
                  <div key={`${item.row}-${item.reason}`}>Row {item.row}: {item.reason}</div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setResultOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Close
            </button>
            <button
              onClick={() => {
                setResultOpen(false)
                navigate(nextAction.href)
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              {nextAction.label}
            </button>
          </div>
        </div>
      </Modal>
    </CRMPage>
  )
}
