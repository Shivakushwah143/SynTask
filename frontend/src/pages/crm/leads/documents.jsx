import { useMemo, useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { Copy, Download, ExternalLink, FileText, Link2, Upload } from 'lucide-react'
import { crmApi } from '../../../api/crm'
import { CRMEmptyState, CRMSection } from '../../../components/crm'
import { Badge, Button, inputClassName } from '../../../components/ui'
import { formatCurrency, formatShortDate } from '../pipeline/utils'

const emptyItem = { description: '', quantity: '1', unit: 'unit', unit_price: '', discount: '0', tax_rate: '18', tax_type: 'gst' }
const contractDefaults = {
  parties: '',
  scope: '',
  deliverables: '',
  price: '',
  payment_schedule: '',
  start_date: '',
  end_date: '',
  confidentiality: '',
  termination: '',
  clauses: '',
}

export const LEAD_DOCUMENTS_QUERY_KEY = 'crm-lead-documents'

const apiErrorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || JSON.stringify(item)).join('; ') || fallback
  }
  if (detail && typeof detail === 'object') return detail.message || detail.error || JSON.stringify(detail)
  return fallback
}

const fieldClassName = (error) => `${inputClassName} ${error ? 'border-red-400 bg-red-50/60 text-red-900 focus:border-red-500 focus:ring-red-500 dark:border-red-700 dark:bg-red-950/20 dark:text-red-100' : ''}`
const fieldError = (message) => message ? <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-300">{message}</p> : null
const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0
const isNonNegativeNumber = (value) => Number.isFinite(Number(value)) && Number(value) >= 0
const dateTimePayload = (value) => value ? `${value}T00:00:00` : undefined

export function LeadDocumentsTab({ leadId, lead, mode = 'documents' }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    document_type: 'quotation',
    title: '',
    valid_until: '',
    terms: '',
    notes: '',
    items: [{ ...emptyItem }],
    ...contractDefaults,
  })
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadType, setUploadType] = useState('quotation')
  const [shareLinks, setShareLinks] = useState({})
  const [fieldErrors, setFieldErrors] = useState({})

  const documentsQuery = useQuery([LEAD_DOCUMENTS_QUERY_KEY, leadId], () => crmApi.getLeadDocuments(leadId), { enabled: Boolean(leadId), staleTime: 60_000 })
  const documents = useMemo(() => documentsQuery.data?.documents || [], [documentsQuery.data])
  const visibleDocuments = useMemo(() => {
    if (mode === 'proposal') return documents.filter((document) => document.document_type === 'quotation')
    if (mode === 'agreement') return documents.filter((document) => document.document_type === 'contract')
    return documents
  }, [documents, mode])
  const workspaceTitle = mode === 'proposal' ? 'Proposal' : mode === 'agreement' ? 'Agreement' : 'Documents'
  const editorType = mode === 'agreement' ? 'contract' : 'quotation'
  useEffect(() => {
    if (mode === 'proposal') setForm((state) => ({ ...state, document_type: 'quotation' }))
    if (mode === 'agreement') setForm((state) => ({ ...state, document_type: 'contract' }))
  }, [mode])

  const refetch = () => {
    documentsQuery.refetch()
    queryClient.invalidateQueries(['crm-lead-workspace', leadId, 'timeline'])
  }

  const createMutation = useMutation((payload) => crmApi.createLeadDocument(leadId, payload), {
    onSuccess: () => {
      toast.success('Document created')
      setForm((state) => ({ ...state, title: '', notes: '', items: [{ ...emptyItem }] }))
      refetch()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Document create failed')),
  })
  const actionMutation = useMutation(({ action, document }) => {
    if (action === 'pdf') return crmApi.generateLeadDocumentPdf(leadId, document.id)
    if (action === 'download') return crmApi.downloadLeadDocumentPdf(leadId, document.id)
    if (action === 'share') return crmApi.createLeadDocumentShareLink(leadId, document.id, { regenerate: Boolean(document.token_expires_at) })
    if (action === 'revoke') return crmApi.revokeLeadDocumentShareLink(leadId, document.id)
    if (action === 'cancel') return crmApi.cancelLeadDocument(leadId, document.id)
    if (action === 'contract') return crmApi.createContractFromDocument(leadId, document.id)
    return Promise.resolve()
  }, {
    onSuccess: (data, variables) => {
      if (variables.action === 'download') {
        downloadBlob(data, `${variables.document.document_number}.pdf`)
        return
      }
      if (variables.action === 'share' && data?.public_link) {
        setShareLinks((state) => ({ ...state, [variables.document.id]: data.public_link }))
        copyText(data.public_link)
        toast.success('Secure link generated and copied')
      } else if (variables.action === 'revoke') {
        setShareLinks((state) => {
          const next = { ...state }
          delete next[variables.document.id]
          return next
        })
        toast.success('Secure link revoked')
      } else {
        toast.success('Document updated')
      }
      refetch()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Document action failed')),
  })
  const uploadMutation = useMutation(() => {
    const body = new FormData()
    body.append('file', uploadFile)
    body.append('document_type', uploadType)
    return crmApi.uploadLeadDocumentPdf(leadId, body)
  }, {
    onSuccess: () => {
      toast.success('PDF uploaded')
      setUploadFile(null)
      refetch()
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'PDF upload failed')),
  })

  const updateItem = (index, field, value) => {
    setFieldErrors((state) => {
      const next = { ...state }
      delete next[`items.${index}.${field}`]
      return next
    })
    setForm((state) => ({
      ...state,
      items: state.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }))
  }

  const updateField = (field, value) => {
    setFieldErrors((state) => {
      const next = { ...state }
      delete next[field]
      return next
    })
    setForm((state) => ({ ...state, [field]: value }))
  }

  const validateForm = () => {
    const errors = {}
    if (form.valid_until && Number.isNaN(Date.parse(form.valid_until))) errors.valid_until = 'Enter a valid date.'
    if (form.document_type === 'quotation') {
      let hasLine = false
      form.items.forEach((item, index) => {
        const hasDescription = Boolean(String(item.description || '').trim())
        const hasAnyValue = hasDescription || ['quantity', 'unit_price', 'discount', 'tax_rate'].some((key) => String(item[key] ?? '').trim())
        if (!hasAnyValue) return
        if (!hasDescription) errors[`items.${index}.description`] = 'Enter line description.'
        else hasLine = true
        if (!isPositiveNumber(item.quantity)) errors[`items.${index}.quantity`] = 'Qty must be greater than 0.'
        if (!isNonNegativeNumber(item.unit_price)) errors[`items.${index}.unit_price`] = 'Rate must be 0 or more.'
        if (!isNonNegativeNumber(item.discount)) errors[`items.${index}.discount`] = 'Discount must be 0 or more.'
        if (!isNonNegativeNumber(item.tax_rate)) errors[`items.${index}.tax_rate`] = 'GST must be 0 or more.'
      })
      if (!hasLine) errors['items.0.description'] = 'Add at least one quotation line.'
    }
    return errors
  }

  const submit = () => {
    const errors = validateForm()
    setFieldErrors(errors)
    if (Object.keys(errors).length) {
      toast.error('Fix highlighted fields')
      return undefined
    }
    const items = form.items.filter((item) => String(item.description || '').trim())
    return createMutation.mutateAsync({
      ...form,
      title: form.title || `${form.document_type === 'contract' ? 'Contract' : 'Quotation'} for ${lead?.company_name || lead?.prospect_name || 'Lead'}`,
      valid_until: dateTimePayload(form.valid_until),
      items,
      clauses: String(form.clauses || '').split('\n').map((item) => item.trim()).filter(Boolean),
    })
  }

  const copyText = (value) => {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value).catch(() => fallbackCopy(value))
    fallbackCopy(value)
  }

  const fallbackCopy = (value) => {
    const input = document.createElement('textarea')
    input.value = value
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  }

  const downloadBlob = (response, filename) => {
    const blob = response?.data || response
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <CRMSection title={workspaceTitle} description={mode === 'proposal' ? 'Manage the active quotation that drives Proposal status.' : mode === 'agreement' ? 'Create and manage the contract that completes Agreement.' : 'Central document repository and history for this lead.'}>
        <div className="flex flex-wrap gap-2">
          {mode !== 'agreement' ? <Button type="button" variant="secondary" onClick={() => setForm((s) => ({ ...s, document_type: 'quotation' }))}>Create Quotation</Button> : null}
          {mode !== 'proposal' ? <Button type="button" variant="secondary" onClick={() => setForm((s) => ({ ...s, document_type: 'contract' }))}>Create Contract</Button> : null}
          <select className={inputClassName} value={uploadType} onChange={(event) => setUploadType(event.target.value)}>
            <option value="quotation">Quotation PDF</option>
            <option value="contract">Contract PDF</option>
          </select>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
            <Upload className="h-4 w-4" />
            Upload Existing PDF
            <input className="hidden" type="file" accept="application/pdf" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
          </label>
          {uploadFile ? <Button type="button" variant="primary" disabled={uploadMutation.isLoading} onClick={() => uploadMutation.mutate()}>Upload {uploadFile.name}</Button> : null}
        </div>
      </CRMSection>

      <CRMSection title={`${form.document_type === 'contract' ? 'Contract' : 'Quotation'} builder`} description="Review generated information before sending; backend totals and status synchronization are authoritative.">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Title</span>
            <input className={fieldClassName(fieldErrors.title)} value={form.title} aria-invalid={fieldErrors.title ? 'true' : undefined} onChange={(event) => updateField('title', event.target.value)} />
            {fieldError(fieldErrors.title)}
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Valid until</span>
            <input className={fieldClassName(fieldErrors.valid_until)} type="date" value={form.valid_until} aria-invalid={fieldErrors.valid_until ? 'true' : undefined} onChange={(event) => updateField('valid_until', event.target.value)} />
            {fieldError(fieldErrors.valid_until)}
          </label>
        </div>
        {form.document_type === 'contract' ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {[
              ['parties', 'Parties'],
              ['scope', 'Scope of work'],
              ['deliverables', 'Deliverables'],
              ['price', 'Price'],
              ['payment_schedule', 'Payment schedule'],
              ['confidentiality', 'Confidentiality terms'],
              ['termination', 'Termination terms'],
            ].map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
                <textarea className={`${fieldClassName(fieldErrors[key])} min-h-20`} value={form[key]} aria-invalid={fieldErrors[key] ? 'true' : undefined} onChange={(event) => updateField(key, event.target.value)} />
                {fieldError(fieldErrors[key])}
              </label>
            ))}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Start date</span>
              <input className={fieldClassName(fieldErrors.start_date)} type="date" value={form.start_date} aria-invalid={fieldErrors.start_date ? 'true' : undefined} onChange={(event) => updateField('start_date', event.target.value)} />
              {fieldError(fieldErrors.start_date)}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">End date</span>
              <input className={fieldClassName(fieldErrors.end_date)} type="date" value={form.end_date} aria-invalid={fieldErrors.end_date ? 'true' : undefined} onChange={(event) => updateField('end_date', event.target.value)} />
              {fieldError(fieldErrors.end_date)}
            </label>
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Additional clauses</span>
              <textarea className={`${fieldClassName(fieldErrors.clauses)} min-h-24`} placeholder="One clause per line" value={form.clauses} aria-invalid={fieldErrors.clauses ? 'true' : undefined} onChange={(event) => updateField('clauses', event.target.value)} />
              {fieldError(fieldErrors.clauses)}
            </label>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
          {form.items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-xl border border-surface-border p-3 dark:border-gray-800 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]">
              <label className="block">
                <input className={fieldClassName(fieldErrors[`items.${index}.description`])} placeholder="Description" value={item.description} aria-invalid={fieldErrors[`items.${index}.description`] ? 'true' : undefined} onChange={(event) => updateItem(index, 'description', event.target.value)} />
                {fieldError(fieldErrors[`items.${index}.description`])}
              </label>
              <label className="block">
                <input className={fieldClassName(fieldErrors[`items.${index}.quantity`])} placeholder="Qty" value={item.quantity} aria-invalid={fieldErrors[`items.${index}.quantity`] ? 'true' : undefined} onChange={(event) => updateItem(index, 'quantity', event.target.value)} />
                {fieldError(fieldErrors[`items.${index}.quantity`])}
              </label>
              <label className="block">
                <input className={fieldClassName(fieldErrors[`items.${index}.unit`])} placeholder="Unit" value={item.unit} aria-invalid={fieldErrors[`items.${index}.unit`] ? 'true' : undefined} onChange={(event) => updateItem(index, 'unit', event.target.value)} />
                {fieldError(fieldErrors[`items.${index}.unit`])}
              </label>
              <label className="block">
                <input className={fieldClassName(fieldErrors[`items.${index}.unit_price`])} placeholder="Rate" value={item.unit_price} aria-invalid={fieldErrors[`items.${index}.unit_price`] ? 'true' : undefined} onChange={(event) => updateItem(index, 'unit_price', event.target.value)} />
                {fieldError(fieldErrors[`items.${index}.unit_price`])}
              </label>
              <label className="block">
                <input className={fieldClassName(fieldErrors[`items.${index}.discount`])} placeholder="Discount" value={item.discount} aria-invalid={fieldErrors[`items.${index}.discount`] ? 'true' : undefined} onChange={(event) => updateItem(index, 'discount', event.target.value)} />
                {fieldError(fieldErrors[`items.${index}.discount`])}
              </label>
              <label className="block">
                <input className={fieldClassName(fieldErrors[`items.${index}.tax_rate`])} placeholder="GST %" value={item.tax_rate} aria-invalid={fieldErrors[`items.${index}.tax_rate`] ? 'true' : undefined} onChange={(event) => updateItem(index, 'tax_rate', event.target.value)} />
                {fieldError(fieldErrors[`items.${index}.tax_rate`])}
              </label>
            </div>
          ))}
          </div>
        )}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <textarea className={`${fieldClassName(fieldErrors.terms)} min-h-24`} placeholder="Terms" value={form.terms} aria-invalid={fieldErrors.terms ? 'true' : undefined} onChange={(event) => updateField('terms', event.target.value)} />
          <textarea className={`${fieldClassName(fieldErrors.notes)} min-h-24`} placeholder="Notes" value={form.notes} aria-invalid={fieldErrors.notes ? 'true' : undefined} onChange={(event) => updateField('notes', event.target.value)} />
        </div>
        <div className="mt-4 flex justify-between gap-2">
          {form.document_type === 'quotation' ? <Button type="button" variant="secondary" onClick={() => setForm((s) => ({ ...s, items: [...s.items, { ...emptyItem }] }))}>Add line</Button> : <span />}
          <Button type="button" variant="primary" onClick={submit} loading={createMutation.isLoading}>Save document</Button>
        </div>
      </CRMSection>

      <CRMSection title={mode === 'documents' ? 'Document history' : 'Lifecycle'} description="Status, totals, sent date, and actions.">
        {documentsQuery.isLoading ? <div className="h-28 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" /> : visibleDocuments.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
              <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="py-2">Document</th><th>Status</th><th>Total</th><th>Created</th><th>Link expiry</th><th>Actions</th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {visibleDocuments.map((document) => (
                  <tr key={document.id}>
                    <td className="py-3"><div className="font-medium text-gray-900 dark:text-gray-100">{document.document_number}</div><div className="text-gray-500">{document.title}</div></td>
                    <td><Badge label={document.status} colorKey={document.status === 'accepted' ? 'completed' : document.status === 'rejected' ? 'critical' : 'scheduled'} /></td>
                    <td>{formatCurrency(Number(document.grand_total || 0))}</td>
                    <td>{formatShortDate(document.created_at)}</td>
                    <td>{formatShortDate(document.token_expires_at)}</td>
                    <td><div className="flex flex-wrap gap-2">
                      {!document.pdf_file_path && !document.source_file_path ? <Button type="button" variant="secondary" size="sm" disabled={actionMutation.isLoading} onClick={() => actionMutation.mutate({ action: 'pdf', document })}><FileText className="h-4 w-4" />Generate PDF</Button> : null}
                      {document.pdf_file_path || document.source_file_path ? <a className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-2 py-1 text-xs" href={crmApi.leadDocumentPdfUrl(leadId, document.id)} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Preview</a> : null}
                      {document.pdf_file_path || document.source_file_path ? <Button type="button" variant="secondary" size="sm" disabled={actionMutation.isLoading} onClick={() => actionMutation.mutate({ action: 'download', document })}><Download className="h-4 w-4" />Download</Button> : null}
                      <Button type="button" variant="secondary" size="sm" disabled={actionMutation.isLoading} onClick={() => actionMutation.mutate({ action: 'share', document })}><Link2 className="h-4 w-4" />{document.token_expires_at ? 'Regenerate Link' : 'Generate Secure Link'}</Button>
                      {shareLinks[document.id] ? (
                        <>
                          <Button type="button" variant="secondary" size="sm" onClick={() => { copyText(shareLinks[document.id]); toast.success('Link copied') }}><Copy className="h-4 w-4" />Copy Link</Button>
                          <a className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-2 py-1 text-xs" href={shareLinks[document.id]} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Open Public Page</a>
                        </>
                      ) : null}
                      {document.token_expires_at && !document.token_revoked_at ? <Button type="button" variant="ghost" size="sm" disabled={actionMutation.isLoading} onClick={() => actionMutation.mutate({ action: 'revoke', document })}>Revoke Link</Button> : null}
                      {document.document_type === 'quotation' ? <Button type="button" variant="secondary" size="sm" disabled={document.status !== 'accepted' || actionMutation.isLoading} onClick={() => actionMutation.mutate({ action: 'contract', document })}>Contract</Button> : null}
                      {document.status !== 'cancelled' ? <Button type="button" variant="ghost" size="sm" onClick={() => actionMutation.mutate({ action: 'cancel', document })}>Cancel</Button> : null}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <CRMEmptyState icon={FileText} title={`No ${editorType}s yet`} description={mode === 'documents' ? 'Create a quotation, contract, or upload an existing PDF.' : `Create or upload a ${editorType} to continue this workspace.`} />}
      </CRMSection>

    </div>
  )
}
