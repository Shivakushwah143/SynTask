import { useEffect, useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Briefcase, Search } from 'lucide-react'
import Papa from 'papaparse'
import toast from 'react-hot-toast'
import { salesApi } from '../../api/sales'
import { usersAPI } from '../../api/users'
import { Badge, Button, EmptyState, FormField, inputClassName, Modal, PageHeader, PhoneInput, SkeletonTable, Table } from '../../components/ui'
import { asArray, formatDate, getId } from '../phase4Utils'
import { timeService } from '@/services/timeService'

const normalizeLeadCsvHeader = (header = '') => {
  const normalized = String(header)
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (['email_address', 'email_id', 'e_mail'].includes(normalized)) return 'email'
  return normalized
}

export default function SalesLeads() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const { data, isLoading, isError } = useQuery(['sales-prospects', search], () => salesApi.getLeads({ search, limit: 50 }))
  const prospects = asArray(data, ['prospects', 'items'])

  useEffect(() => {
    if (searchParams.get('createProspect') === 'true') {
      setOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('createProspect')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const columns = [
    { key: 'prospect_name', header: 'Lead', render: (row) => <Link className="font-medium text-primary-700" to={`/sales/prospects/${getId(row)}`}>{row.prospect_name || `${row.first_name || ''} ${row.last_name || ''}`}</Link> },
    { key: 'email', header: 'Email', render: (row) => row.email || '-' },
    { key: 'company_name', header: 'Company', render: (row) => row.company_name || '-' },
    { key: 'interest_level', header: 'Interest', render: (row) => row.interest_level ? <Badge label={row.interest_level} colorKey={row.interest_level} /> : '-' },
    { key: 'current_stage', header: 'Stage', render: (row) => row.current_stage || '-' },
    { key: 'status', header: 'Status', render: (row) => <Badge label={row.status || 'open'} colorKey={row.status || 'active'} /> },
    { key: 'estimated_close_date', header: 'Close Date', render: (row) => formatDate(row.estimated_close_date) },
  ]

  return (
    <div className="p-6">
      <PageHeader
        title="Leads"
        description={`${prospects.length} active leads`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setUploadOpen(true)}>Bulk Upload Leads</Button>
            <Button onClick={() => setOpen(true)}>Add Lead</Button>
          </>
        }
      />
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input className={`${inputClassName} pl-10`} placeholder="Search leads..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {isLoading ? <SkeletonTable rows={6} cols={7} /> : isError ? <EmptyState icon={Briefcase} title="Could not load leads" /> : prospects.length ? <Table columns={columns} data={prospects} /> : <EmptyState icon={Briefcase} title="No leads yet" description="Create leads to fill your pipeline." action={<Button onClick={() => setOpen(true)}>Add Lead</Button>} />}
      <LeadModal isOpen={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); queryClient.invalidateQueries('sales-prospects') }} />
      <BulkUploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onDone={() => { setUploadOpen(false); queryClient.invalidateQueries('sales-prospects') }} />
    </div>
  )
}

function BulkUploadModal({ isOpen, onClose, onDone }) {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [previewRows, setPreviewRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [strategy, setStrategy] = useState('round-robin')
  const [targetUserId, setTargetUserId] = useState('')
  const [fileError, setFileError] = useState('')
  const [step, setStep] = useState('upload')
  const [summary, setSummary] = useState(null)
  const { data: usersData } = useQuery('assignable-users-for-bulk-upload', () => usersAPI.getAssignableUsers(), { enabled: isOpen })
  const users = asArray(usersData, ['users'])

  const mutation = useMutation((formData) => salesApi.bulkUploadLeads(formData), {
    onSuccess: (result) => {
      console.group('[Bulk Lead Upload] Success')
      console.log('Server response:', result)
      console.log('Uploaded rows:', result.total_uploaded)
      console.log('Skipped row details:', result.warnings || [])
      console.groupEnd()
      toast.success(`Uploaded ${result.total_uploaded} leads. ${result.skipped_rows} skipped.`)
      const assignedCount = Object.values(result.assigned_breakdown || {}).reduce((sum, count) => sum + Number(count || 0), 0)
      setSummary({
        imported: result.total_uploaded || 0,
        assigned: assignedCount,
        failed: result.skipped_rows || 0,
        warnings: result.warnings || [],
        strategy,
      })
      setStep('success')
    },
    onError: (error) => {
      console.group('[Bulk Lead Upload] Error')
      console.error('Upload error:', error)
      console.error('HTTP status:', error.response?.status)
      console.error('Server error data:', error.response?.data)
      console.log('Selected file:', file ? { name: file.name, size: file.size, type: file.type } : null)
      console.log('Normalized headers:', headers)
      console.log('Parsed preview data:', previewRows)
      console.groupEnd()
      toast.error(error.response?.data?.detail || error.message || 'Upload failed')
    },
  })

  const parsedPreview = useMemo(() => previewRows.slice(0, 20), [previewRows])

  const handleFileChange = (event) => {
    setFileError('')
    const selected = event.target.files?.[0]
    if (!selected) {
      setFile(null)
      setPreviewRows([])
      setHeaders([])
      return
    }

    if (!selected.name.toLowerCase().endsWith('.csv')) {
      setFileError('Please select a CSV file.')
      return
    }

    setFile(selected)
    Papa.parse(selected, {
      header: true,
      skipEmptyLines: true,
      preview: 50,
      transformHeader: normalizeLeadCsvHeader,
      complete: ({ data, meta, errors }) => {
        console.group('[Bulk Lead Upload] CSV parsed')
        console.log('File:', { name: selected.name, size: selected.size, type: selected.type })
        console.log('Normalized headers:', meta.fields || [])
        console.log('Parsed data:', data)
        console.log('Parser errors:', errors)
        console.groupEnd()

        if (errors.length) {
          console.error('[Bulk Lead Upload] CSV parse failed:', errors)
          setFileError('Unable to parse CSV file.')
          setHeaders([])
          setPreviewRows([])
          return
        }

        const parsedHeaders = meta.fields || []
        if (!parsedHeaders.includes('email')) {
          const message = `Email column not found. Detected columns: ${parsedHeaders.join(', ') || 'none'}`
          console.error('[Bulk Lead Upload] Header validation failed:', {
            required: 'email',
            detected: parsedHeaders,
          })
          setFileError(message)
          setHeaders(parsedHeaders)
          setPreviewRows(data)
          return
        }

        setHeaders(parsedHeaders)
        setPreviewRows(data)
      },
      error: (error) => {
        console.error('[Bulk Lead Upload] Could not read CSV file:', error)
        setFileError(`Unable to read CSV file: ${error.message || 'Unknown error'}`)
        setHeaders([])
        setPreviewRows([])
      },
    })
  }

  const handleReset = () => {
    setFile(null)
    setHeaders([])
    setPreviewRows([])
    setFileError('')
    setStrategy('round-robin')
    setTargetUserId('')
    setSummary(null)
    setStep('upload')
  }

  const submit = () => {
    if (!file) {
      setFileError('Choose a CSV file first.')
      return
    }
    if (strategy === 'manual' && !targetUserId) {
      setFileError('Select an assignee for manual strategy.')
      return
    }
    if (!headers.includes('email')) {
      setFileError(`Email column not found. Detected columns: ${headers.join(', ') || 'none'}`)
      return
    }

    const formData = new FormData()
    formData.append('strategy', strategy)
    formData.append('file', file)
    if (strategy === 'manual') {
      formData.append('target_user_id', targetUserId)
    }

    console.group('[Bulk Lead Upload] Submitting')
    console.log('File:', { name: file.name, size: file.size, type: file.type })
    console.log('Strategy:', strategy)
    console.log('Target user ID:', targetUserId || null)
    console.log('Normalized headers:', headers)
    console.log('Parsed preview data:', previewRows)
    console.groupEnd()

    mutation.mutate(formData)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Upload Leads" size="xl">
      {step === 'success' ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Imported</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{summary?.imported || 0}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Assigned</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{summary?.assigned || 0}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Failed</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{summary?.failed || 0}</p>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Assignment strategy</p>
            <p className="mt-1 text-sm text-gray-600">
              {summary?.strategy === 'manual'
                ? 'Manual assignment was used.'
                : `Automatic ${summary?.strategy || strategy} assignment was used.`}
            </p>
          </div>
          {summary?.warnings?.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Failed rows</p>
              <div className="mt-2 max-h-36 space-y-1 overflow-auto text-sm text-amber-800">
                {summary.warnings.slice(0, 8).map((item) => (
                  <div key={`${item.row}-${item.error}`}>Row {item.row}: {item.error}</div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button
              onClick={() => {
                onDone()
                navigate('/sales/pipeline')
              }}
            >
              Open Sales Pipeline
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">CSV file</label>
            <input type="file" accept=".csv" onChange={handleFileChange} className="block w-full text-sm text-gray-900 file:mr-4 file:rounded-full file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100" />
            <p className="text-xs text-gray-500">Required columns: email, name or first_name. Optional columns: company, phone, source, status, remark.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Assignment strategy</label>
              <select value={strategy} onChange={(event) => setStrategy(event.target.value)} className="input w-full">
                <option value="round-robin">Round Robin</option>
                <option value="evenly">Evenly</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            {strategy === 'manual' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Assign all leads to</label>
                <select value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} className="input w-full">
                  <option value="">Select employee or lead</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.first_name} {user.last_name} ({user.role})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {fileError ? <p className="text-sm text-red-600">{fileError}</p> : null}

        {headers.length ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Preview</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    {headers.map((header) => (
                      <th key={header} className="px-3 py-2 text-left font-medium text-gray-600">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {parsedPreview.length ? parsedPreview.map((row, index) => (
                    <tr key={index}>
                      {headers.map((header) => (
                        <td key={header} className="px-3 py-2 text-gray-700">{row[header] || '-'}</td>
                      ))}
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={headers.length} className="px-3 py-4 text-sm text-gray-500">No preview rows available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-500">Showing up to 20 preview rows.</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={handleReset} disabled={mutation.isLoading}>Reset</Button>
          <Button loading={mutation.isLoading} onClick={submit}>Upload Leads</Button>
        </div>
        </div>
      )}
    </Modal>
  )
}

function LeadModal({ isOpen, onClose, onDone }) {
  const [errors, setErrors] = useState({})
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    country_code: '+91',
    phone: '',
    category_id: '',
    product_ids: [],
    interest_level: 'warm',
    estimated_close_date: timeService.toUtcISOString(timeService.now()).slice(0, 10),
    assigned_to: '',
    current_stage: '',
    email: '',
    company_name: '',
    remark: '',
  })

  const { data: stagesData } = useQuery('sales-stages-for-prospect', salesApi.getStages, { enabled: isOpen })
  const { data: categoriesData } = useQuery('sales-categories-for-prospect', salesApi.getCategories, { enabled: isOpen })
  const { data: productsData } = useQuery('sales-products-for-prospect', salesApi.getProducts, { enabled: isOpen })
  const { data: usersData } = useQuery('assignable-users-for-prospect', () => usersAPI.getAssignableUsers(), { enabled: isOpen })

  const stages = asArray(stagesData, ['stages'])
  const categories = asArray(categoriesData, ['categories'])
  const products = asArray(productsData, ['products'])
  const users = asArray(usersData, ['users'])

  const mutation = useMutation((payload) => salesApi.createLead(payload), {
    onSuccess: () => {
      toast.success('Lead created')
      onDone()
    },
  })
  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))
  const toggleProduct = (productId) => {
    setForm((state) => ({
      ...state,
      product_ids: state.product_ids.includes(productId)
        ? state.product_ids.filter((id) => id !== productId)
        : [...state.product_ids, productId],
    }))
  }

  const submit = () => {
    const nextErrors = {}
    // Only phone is required - all other fields are optional for partial lead creation
    if (!/^\+\d{1,4}$/.test(form.country_code.trim())) nextErrors.phone = 'Country code must start with + and contain 1 to 4 digits'
    if (!/^\d{10}$/.test(form.phone.trim())) nextErrors.phone = 'Phone must be exactly 10 digits'
    // Category, stage, owner and product are optional - backend will assign defaults
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      toast.error('Please complete the required fields')
      return
    }
    mutation.mutate({
      ...form,
      product_ids: form.product_ids.join('|'),
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add lead"
      description="Add leads with just a phone number - all other details can be added later."
      size="lg"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isLoading} onClick={submit}>Save lead</Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-gray-200/80 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-950/50">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Identity</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField label="First name" error={errors.first_name}><input className={inputClassName} value={form.first_name} onChange={(event) => { update('first_name', event.target.value); if (errors.first_name) setErrors((state) => ({ ...state, first_name: '' })) }} /></FormField>
            <FormField label="Last name" error={errors.last_name}><input className={inputClassName} value={form.last_name} onChange={(event) => { update('last_name', event.target.value); if (errors.last_name) setErrors((state) => ({ ...state, last_name: '' })) }} /></FormField>
            <FormField label="Phone" required error={errors.phone} className="sm:col-span-2">
              <PhoneInput
                countryCode={form.country_code}
                phoneNumber={form.phone}
                onCountryCodeChange={(value) => update('country_code', value)}
                onPhoneNumberChange={(value) => { update('phone', value); if (errors.phone) setErrors((state) => ({ ...state, phone: '' })) }}
                required
              />
            </FormField>
            <FormField label="Email"><input className={inputClassName} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></FormField>
            <FormField label="Company"><input className={inputClassName} value={form.company_name} onChange={(event) => update('company_name', event.target.value)} /></FormField>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ownership and pipeline</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField label="Category" error={errors.category_id}><select className={inputClassName} value={form.category_id} onChange={(event) => { update('category_id', event.target.value); if (errors.category_id) setErrors((state) => ({ ...state, category_id: '' })) }}><option value="">Select category</option>{categories.map((category) => <option key={getId(category)} value={getId(category)}>{category.name}</option>)}</select></FormField>
            <FormField label="Stage" error={errors.current_stage}><select className={inputClassName} value={form.current_stage} onChange={(event) => { update('current_stage', event.target.value); if (errors.current_stage) setErrors((state) => ({ ...state, current_stage: '' })) }}><option value="">Select stage</option>{stages.map((stage) => <option key={getId(stage)} value={getId(stage)}>{stage.name}</option>)}</select></FormField>
            <FormField label="Owner" error={errors.assigned_to}><select className={inputClassName} value={form.assigned_to} onChange={(event) => { update('assigned_to', event.target.value); if (errors.assigned_to) setErrors((state) => ({ ...state, assigned_to: '' })) }}><option value="">Assign to</option>{users.map((user) => <option key={getId(user)} value={getId(user)}>{user.first_name} {user.last_name}</option>)}</select></FormField>
            <FormField label="Interest level"><select className={inputClassName} value={form.interest_level} onChange={(event) => update('interest_level', event.target.value)}><option value="cold">Cold</option><option value="warm">Warm</option><option value="hot">Hot</option></select></FormField>
            <FormField label="Estimated close date"><input className={inputClassName} type="date" value={form.estimated_close_date} onChange={(event) => update('estimated_close_date', event.target.value)} /></FormField>
            <FormField label="Remark"><input className={inputClassName} value={form.remark} onChange={(event) => update('remark', event.target.value)} /></FormField>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200/80 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-950/50">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Products</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">Select products for this lead (optional).</p>
          <div className="mt-4 grid max-h-40 gap-2 overflow-y-auto rounded-xl border border-gray-200/80 bg-white p-3 sm:grid-cols-2 dark:border-gray-800 dark:bg-gray-900">
            {products.length ? products.map((product) => (
              <label key={getId(product)} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800">
                <input
                  type="checkbox"
                  checked={form.product_ids.includes(getId(product))}
                  onChange={() => {
                    toggleProduct(getId(product))
                    if (errors.product_ids) setErrors((state) => ({ ...state, product_ids: '' }))
                  }}
                />
                {product.name}
              </label>
            )) : <span className="text-sm text-gray-500">Create products in Sales Settings first.</span>}
          </div>
          {errors.product_ids ? <p className="mt-2 text-xs text-red-600">{errors.product_ids}</p> : null}
        </section>
      </div>
    </Modal>
  )
}
