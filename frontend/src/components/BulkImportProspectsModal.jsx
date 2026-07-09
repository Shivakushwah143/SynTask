import { useEffect, useState } from 'react'
import { Upload, AlertCircle, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { salesApi } from '../api/sales'
import { useQueryClient } from 'react-query'
import { Button, Modal } from './ui'

const getId = (item) => item?.id || item?._id

export default function BulkImportProspectsModal({ isOpen, onClose, onSuccess, categories, stages, users, products }) {
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
  const employeeOptions = Array.isArray(users) ? users : []

  const parseCSVRows = (text) => {
    const rows = []
    let row = []
    let value = ''
    let quoted = false

    for (let index = 0; index < text.length; index++) {
      const character = text[index]

      if (character === '"') {
        if (quoted && text[index + 1] === '"') {
          value += '"'
          index++
        } else {
          quoted = !quoted
        }
      } else if (character === ',' && !quoted) {
        row.push(value.trim())
        value = ''
      } else if ((character === '\n' || character === '\r') && !quoted) {
        if (character === '\r' && text[index + 1] === '\n') index++
        row.push(value.trim())
        if (row.some((cell) => cell !== '')) rows.push(row)
        row = []
        value = ''
      } else {
        value += character
      }
    }

    row.push(value.trim())
    if (row.some((cell) => cell !== '')) rows.push(row)
    return rows
  }

  const parseCSV = (text) => {
    const parsedRows = parseCSVRows(text.replace(/^\uFEFF/, ''))
    if (parsedRows.length < 2) {
      setErrors(['CSV file must have at least a header and one data row'])
      return
    }

    const headers = parsedRows[0].map((header) => header.trim().toLowerCase())
    const rows = []
    const rowErrors = []

    for (let i = 1; i < parsedRows.length; i++) {
      const values = parsedRows[i]
      const row = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })

      const validation = validateRow(row, i + 1)
      if (validation.errors.length > 0) {
        rowErrors.push(...validation.errors)
      } else {
        rows.push(validation.data)
      }
    }

    if (rowErrors.length > 0) {
      setErrors(rowErrors)
      setData([])
      return
    }

    setErrors([])
    setData(rows)
    setStep('preview')
  }

  const validateRow = (row, rowNum) => {
    const errors = []
    const data = {
      first_name: row['first name'] || row['first_name'] || '',
      last_name: row['last name'] || row['last_name'] || '',
      country_code: row['country code'] || row['country_code'] || '+91',
      phone: row['phone'] || '',
      email: row['email'] || '',
      company_name: row['company'] || row['company_name'] || '',
      category_id: '',
      current_stage: '',
      assigned_to: '',
      interest_level: row['interest level'] || row['interest_level'] || 'medium',
      estimated_close_date: row['estimated close date'] || row['estimated_close_date'] || new Date().toISOString().slice(0, 10),
      remark: row['remark'] || row['remark'] || '',
      product_ids: [],
    }

    // Validate required fields
    if (!data.first_name) errors.push(`Row ${rowNum}: First name is required`)
    if (!data.last_name) errors.push(`Row ${rowNum}: Last name is required`)
    if (!data.phone) errors.push(`Row ${rowNum}: Phone is required`)
    if (!['low', 'medium', 'high'].includes(data.interest_level.toLowerCase())) {
      errors.push(`Row ${rowNum}: Interest level must be Low, Medium, or High`)
    } else {
      data.interest_level = data.interest_level.toLowerCase()
    }

    // Find category by name
    const categoryName = row['category'] || row['category_id'] || ''
    if (categoryName) {
      const category = categories?.find((c) => c.name?.toLowerCase() === categoryName.toLowerCase())
      if (category) {
        data.category_id = getId(category)
      } else {
        errors.push(`Row ${rowNum}: Category "${categoryName}" not found`)
      }
    } else {
      errors.push(`Row ${rowNum}: Category is required`)
    }

    // Find stage by name
    const stageName = row['stage'] || row['current_stage'] || ''
    if (stageName) {
      const stage = stages?.find((s) => {
        const candidate = `${s.name || ''}`.toLowerCase()
        const candidateId = `${getId(s) || ''}`.toLowerCase()
        const normalizedStage = stageName.trim().toLowerCase()
        return candidate === normalizedStage || candidateId === normalizedStage
      })
      if (stage) {
        data.current_stage = stage.name || getId(stage)
      } else {
        errors.push(`Row ${rowNum}: Stage "${stageName}" not found`)
      }
    } else {
      errors.push(`Row ${rowNum}: Stage is required`)
    }

    // Find owner/assigned_to by name
    const ownerName = row['owner'] || row['assigned_to'] || ''
    if (ownerName) {
      const owner = users?.find(
        (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase() === ownerName.trim().toLowerCase()
      )
      if (owner) {
        data.assigned_to = getId(owner)
      } else {
        errors.push(`Row ${rowNum}: Owner "${ownerName}" not found`)
      }
    } else {
      errors.push(`Row ${rowNum}: Owner is required`)
    }

    // Find products by name
    const productsStr = row['products'] || row['product_ids'] || ''
    if (productsStr) {
      const productNames = productsStr.split('|').map((p) => p.trim())
      productNames.forEach((productName) => {
        const product = products?.find((p) => p.name?.toLowerCase() === productName.toLowerCase())
        if (product) {
          data.product_ids.push(getId(product))
        } else {
          errors.push(`Row ${rowNum}: Product "${productName}" not found`)
        }
      })
    }

    if (data.product_ids.length === 0) {
      errors.push(`Row ${rowNum}: At least one product is required`)
    }

    // Validate date format
    if (data.estimated_close_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.estimated_close_date)) {
      errors.push(`Row ${rowNum}: Invalid date format. Use YYYY-MM-DD`)
    }

    return { data, errors }
  }

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    if (!/\.(csv|xlsx)$/i.test(selectedFile.name)) {
      toast.error('Please select a CSV or XLSX file')
      event.target.value = ''
      return
    }

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

    if (/\.(csv|xlsx)$/i.test(file.name)) {
      setProcessing(true)
      salesApi.previewBulkUploadProspects({
        file,
        strategy,
        target_user_id: targetUserId,
        target_department_id: departmentId,
      })
        .then((response) => {
          const payload = response?.data || response || {}
          setData(payload.preview_rows || [])
          setErrors((payload.failed_rows || []).map((item) => `Row ${item.row}: ${item.error}`))
          setStep('preview')
        })
        .catch(() => {
          toast.error('Could not preview the selected file')
        })
        .finally(() => {
          setProcessing(false)
        })
    } else {
      toast.error('Please select a CSV or XLSX file')
    }
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
      const result = await salesApi.bulkUploadProspects(formData)
      const payload = result?.data || result || {}
      const successCount = payload.total_uploaded || payload.success_count || 0
      const importErrors = (payload.failed_rows || []).map(
        (failure) => `Row ${failure.row}: ${failure.error}`
      )
      const assignedCount = Object.values(payload.assigned_breakdown || {}).reduce((sum, count) => sum + Number(count || 0), 0)

      if (successCount > 0) {
        toast.success(`${successCount} prospect${successCount !== 1 ? 's' : ''} created`)
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
        toast.error(`${importErrors.length} prospect${importErrors.length !== 1 ? 's' : ''} failed to import`)
      } else if (successCount === 0) {
        setFile(null)
        setData([])
        setErrors([])
        setStep('upload')
        onClose()
      }
    } catch (error) {
      console.error('Bulk import error:', error)
      toast.error('Failed to import prospects')
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
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Import Prospects" size="lg">
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
            <p className="mt-2 text-sm font-medium text-gray-900">Upload CSV file</p>
            <p className="mt-1 text-xs text-gray-500">
              CSV format with columns: First Name, Last Name, Country Code, Phone, Email, Company, Category, Stage, Owner, Interest Level, Estimated Close Date, Remark, Products
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="mt-4"
            />
          </div>

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
              John,Doe,+91,9999999999,john@example.com,ABC Corp,Residential,Lead,Alice Admin,High,2026-12-31,Good prospect,2BHK Apartment|Office Space
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
                {data.length} prospect{data.length !== 1 ? 's' : ''} ready to import
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
              Import {data.length} Prospect{data.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="space-y-4 text-center">
          <div className="flex justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-primary-600" />
          </div>
          <p className="text-sm font-medium text-gray-900">Importing prospects...</p>
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
