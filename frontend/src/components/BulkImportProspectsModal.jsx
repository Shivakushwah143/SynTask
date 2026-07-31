import { useEffect, useState } from 'react'
import { Upload, AlertCircle, CheckCircle, AlertTriangle, ArrowRight, Lightbulb } from 'lucide-react'
import toast from 'react-hot-toast'
import { salesApi } from '../api/sales'
import { useQueryClient } from 'react-query'
import { Button, Modal } from './ui'

const getId = (item) => item?.id || item?._id

const KNOWN_FIELD_LABELS = {
  first_name: 'First Name',
  last_name: 'Last Name',
  name: 'Full Name',
  country_code: 'Country Code',
  phone: 'Phone',
  email: 'Email',
  company: 'Company',
  company_name: 'Company Name',
  category_id: 'Category',
  product_ids: 'Products',
  interest_level: 'Interest Level',
  estimated_close_date: 'Estimated Close Date',
  status: 'Status',
  stage: 'Stage',
  current_stage: 'Current Stage',
  remark: 'Remark',
  relationship_type: 'Relationship Type',
  channel: 'Channel',
  designation: 'Designation',
  nationality: 'Nationality',
  language: 'Language',
  owner_name: 'Owner Name',
  owner_contact_no: 'Owner Contact',
  tag: 'Tags',
  crm_company_id: 'CRM Company',
  contact_id: 'Contact',
  due_date: 'Due Date',
  due_time: 'Due Time',
}

export default function BulkImportLeadsModal({ isOpen, onClose, onSuccess, stages, users }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState(null)
  const [data, setData] = useState([])
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [strategy, setStrategy] = useState('round-robin')
  const [targetUserId, setTargetUserId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [importHistory, setImportHistory] = useState([])
  const [importSummary, setImportSummary] = useState(null)
  const [step, setStep] = useState('upload') // 'upload' | 'preview' | 'importing'
  const [detectedColumns, setDetectedColumns] = useState([])
  const [fieldRecommendations, setFieldRecommendations] = useState([])
  const employeeOptions = Array.isArray(users) ? users : []

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setStep('upload')
    setData([])
    setErrors([])
  }

  const handleProcessFile = (event) => {
    event?.preventDefault()

    if (!file) {
      toast.error('Please select a file first')
      return
    }

    setProcessing(true)
    salesApi.previewBulkUploadLeads({
      file,
      strategy,
      target_user_id: targetUserId,
      target_department_id: departmentId,
    })
      .then((response) => {
        const payload = response?.data || response || {}
        setData(payload.preview_rows || [])
        setErrors((payload.failed_rows || []).map((item) => `Row ${item.row}: ${item.error}`))
        setDetectedColumns(payload.detected_columns || [])
        setFieldRecommendations(payload.field_recommendations || [])
        setStep('preview')
      })
      .catch((err) => {
        const msg = err?.response?.data?.detail || 'Could not preview the selected file'
        toast.error(msg)
      })
      .finally(() => {
        setProcessing(false)
      })
  }

  const handleImport = async () => {
    if (!file || data.length === 0) {
      toast.error('No valid data to import')
      return
    }

    setLoading(true)
    setStep('importing')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('strategy', strategy)
      if (strategy === 'manual' && targetUserId) {
        formData.append('target_user_id', targetUserId)
      }
      if (departmentId) {
        formData.append('target_department_id', departmentId)
      }
      const result = await salesApi.bulkUploadLeads(formData)
      const payload = result?.data || result || {}
      const successCount = payload.total_uploaded || payload.success_count || 0
      const importErrors = (payload.failed_rows || []).map(
        (failure) => `Row ${failure.row}: ${failure.error}`
      )
      const assignedCount = Object.values(payload.assigned_breakdown || {}).reduce((sum, count) => sum + Number(count || 0), 0)

      if (successCount > 0) {
        toast.success(`${successCount} lead${successCount !== 1 ? 's' : ''} created`)
        queryClient.invalidateQueries('crm-pipeline-board')
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('crm-lead-duplicates')
        queryClient.invalidateQueries('crm-assigned-leads')
        queryClient.invalidateQueries('crm-lead-workspace')
        queryClient.invalidateQueries('sales-prospects')
        queryClient.invalidateQueries('crm-import-history')
        setImportSummary({
          total_uploaded: successCount,
          skipped_rows: payload.skipped_rows || 0,
          assigned_count: assignedCount,
          warnings: payload.warnings || [],
          strategy,
        })
        setStep('success')
      }

      if (importErrors.length > 0) {
        setErrors(importErrors)
        setStep('preview')
        toast.error(`${importErrors.length} lead${importErrors.length !== 1 ? 's' : ''} failed to import`)
      } else if (successCount === 0) {
        setFile(null)
        setData([])
        setErrors([])
        setStep('upload')
        onClose()
      }
    } catch (error) {
      console.error('Bulk import error:', error)
      toast.error('Failed to import leads')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setData([])
    setErrors([])
    setProcessing(false)
    setLoading(false)
    setStrategy('round-robin')
    setTargetUserId('')
    setDepartmentId('')
    setImportSummary(null)
    setDetectedColumns([])
    setFieldRecommendations([])
    setStep('upload')
    onClose()
  }

  useEffect(() => {
    if (!isOpen) return
    salesApi.getImportHistory()
      .then((response) => setImportHistory(response?.data?.items || response?.items || []))
      .catch(() => setImportHistory([]))
  }, [isOpen])

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Import Leads" size="lg">
      {step === 'success' ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-surface-border/80 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Imported</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{importSummary?.total_uploaded || 0}</p>
            </div>
            <div className="rounded-lg border border-surface-border/80 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Assigned</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{importSummary?.assigned_count || 0}</p>
            </div>
            <div className="rounded-lg border border-surface-border/80 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Failed</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{importSummary?.skipped_rows || 0}</p>
            </div>
          </div>

          <div className="rounded-lg border border-surface-border/80 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Assignment strategy</p>
            <p className="mt-1 text-sm text-gray-600">
              {importSummary?.strategy === 'manual'
                ? 'Manual assignment was used.'
                : `Automatic ${importSummary?.strategy || strategy} assignment was used.`}
            </p>
          </div>

          {importSummary?.warnings?.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                Failed or flagged rows
              </p>
              <div className="mt-2 max-h-36 space-y-1 overflow-auto text-sm text-amber-800">
                {importSummary.warnings.slice(0, 8).map((item) => (
                  <div key={`${item.row}-${item.reason}`}>Row {item.row}: {item.reason}</div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button
              onClick={() => {
                onSuccess?.(importSummary)
                handleClose()
              }}
            >
              Open Sales Pipeline
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : step === 'upload' && (
        <form className="space-y-4" onSubmit={handleProcessFile}>
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm font-medium text-gray-900">Upload file</p>
            <p className="mt-1 text-xs text-gray-500">
              Upload a CSV, XLSX, or any text file with comma-separated values. Columns are auto-detected.
            </p>
            <input
              type="file"
              accept="*"
              onChange={handleFileSelect}
              className="mt-4"
            />
          </div>

          {/* Field Recommendation Div */}
          {file && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-5 w-5 text-blue-600" />
                <p className="text-sm font-semibold text-blue-900">Field Mapping Recommendations</p>
              </div>
              <p className="text-xs text-blue-700 mb-3">
                The file will be parsed and columns will be mapped to lead fields. Unknown columns are stored as custom fields.
              </p>
              <div className="grid gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-green-800">Known fields (phone, name, email, etc.) are mapped automatically</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-amber-800">Unknown columns are stored as custom fields on the lead</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-gray-600">No validation is applied — every row is imported, even without a mobile number</span>
                </div>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-lg bg-red-50 p-3" role="alert">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-900">
                <AlertCircle className="h-4 w-4" />
                Please fix these CSV errors
              </p>
              <ul className="space-y-1 text-xs text-red-800">
                {errors.slice(0, 10).map((error, index) => <li key={index}>• {error}</li>)}
              </ul>
              {errors.length > 10 && <p className="mt-2 text-xs text-red-700">... and {errors.length - 10} more errors</p>}
            </div>
          )}

          <div className="space-y-2 rounded-lg bg-blue-50 p-3">
            <p className="text-xs font-semibold text-blue-900">CSV Format Example:</p>
            <code className="block overflow-x-auto rounded bg-white p-2 text-xs">
              First Name,Last Name,Country Code,Phone,Email,Company,Category,Stage,Owner,Interest Level,Estimated Close Date,Remark,Products
              <br />
              John,Doe,+91,9999999999,john@example.com,ABC Corp,Residential,Lead,Alice Admin,High,2026-12-31,Good lead,2BHK Apartment|Office Space
            </code>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Assignment strategy</span>
              <select className="input w-full" value={strategy} onChange={(event) => setStrategy(event.target.value)}>
                <option value="round-robin">Round robin</option>
                <option value="evenly">Evenly</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            {strategy === 'manual' ? (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Assign to employee</span>
                <select className="input w-full" value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>
                  <option value="">Select employee</option>
                  {employeeOptions.map((user) => (
                    <option key={getId(user)} value={getId(user)}>
                      {user.first_name} {user.last_name} {user.role ? `(${user.role})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!file} loading={processing}>
              <Upload className="h-4 w-4" />
              Preview File
            </Button>
          </div>
        </form>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          {/* Field Mapping Recommendation */}
          {fieldRecommendations.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="h-5 w-5 text-blue-600" />
                <p className="text-sm font-semibold text-blue-900">Detected Columns ({fieldRecommendations.length})</p>
              </div>
              <div className="grid gap-1.5 max-h-40 overflow-y-auto">
                {fieldRecommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    {rec.status === 'mapped' ? (
                      <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
                    ) : (
                      <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    )}
                    <span className="font-medium text-gray-700">{rec.column}</span>
                    {rec.maps_to ? (
                      <span className="text-gray-500">→ {rec.maps_to}</span>
                    ) : (
                      <span className="text-amber-700">→ stored as custom field</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-lg bg-red-50 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-900">
                <AlertCircle className="h-4 w-4" />
                {errors.length} validation error{errors.length !== 1 ? 's' : ''}
              </p>
              <ul className="space-y-1 text-xs text-red-800">
                {errors.slice(0, 10).map((error, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="font-medium">•</span>
                    {error}
                  </li>
                ))}
              </ul>
              {errors.length > 10 && <p className="mt-2 text-xs text-red-700">... and {errors.length - 10} more errors</p>}
            </div>
          )}

          {data.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-green-900">
                <CheckCircle className="h-4 w-4" />
                {data.length} lead{data.length !== 1 ? 's' : ''} ready to import
              </p>
              <div className="viewport-scroll-x max-h-64 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="border-b px-3 py-2 text-left">Name</th>
                      <th className="border-b px-3 py-2 text-left">Phone</th>
                      <th className="border-b px-3 py-2 text-left">Email</th>
                      <th className="border-b px-3 py-2 text-left">Company</th>
                      <th className="border-b px-3 py-2 text-left">Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((prospect, idx) => {
                      const stage = stages?.find((s) => {
                        const value = `${prospect.current_stage || ''}`.toLowerCase()
                        return `${s.name || ''}`.toLowerCase() === value || `${getId(s) || ''}`.toLowerCase() === value
                      })
                      return (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="px-3 py-2">
                            {prospect.first_name} {prospect.last_name}
                          </td>
                          <td className="px-3 py-2">{prospect.phone}</td>
                          <td className="px-3 py-2">{prospect.email || '-'}</td>
                          <td className="px-3 py-2">{prospect.company_name || '-'}</td>
                          <td className="px-3 py-2">{stage?.name || '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button
              onClick={handleImport}
              disabled={data.length === 0 || errors.length > 0}
              loading={loading}
            >
              Import {data.length} Lead{data.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-primary-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Importing leads...</p>
          <p className="text-xs text-gray-500">This may take a moment</p>
        </div>
      )}

      {importHistory.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-900">Recent imports</p>
          <div className="mt-2 space-y-2 text-xs text-gray-600">
            {importHistory.slice(0, 3).map((job) => (
              <div key={job.id} className="flex items-center justify-between gap-3">
                <span>{job.filename || 'Import job'}</span>
                <span>{job.total_uploaded}/{job.total_rows}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
