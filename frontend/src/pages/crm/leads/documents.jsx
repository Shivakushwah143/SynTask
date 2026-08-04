import { useMemo, useState } from 'react'
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

export function LeadDocumentsTab({ leadId, lead }) {
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
  const [shareLinks, setShareLinks] = useState({})

  const documentsQuery = useQuery([LEAD_DOCUMENTS_QUERY_KEY, leadId], () => crmApi.getLeadDocuments(leadId), { enabled: Boolean(leadId), staleTime: 60_000 })
  const documents = useMemo(() => documentsQuery.data?.documents || [], [documentsQuery.data])

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
    onError: (error) => toast.error(error?.response?.data?.detail || 'Document create failed'),
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
    onError: (error) => toast.error(error?.response?.data?.detail || 'Document action failed'),
  })
  const uploadMutation = useMutation(() => {
    const body = new FormData()
    body.append('file', uploadFile)
    return crmApi.uploadLeadDocumentPdf(leadId, body)
  }, {
    onSuccess: () => {
      toast.success('PDF uploaded')
      setUploadFile(null)
      refetch()
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'PDF upload failed'),
  })

  const updateItem = (index, field, value) => {
    setForm((state) => ({
      ...state,
      items: state.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }))
  }

  const submit = () => {
    createMutation.mutate({
      ...form,
      title: form.title || `${form.document_type === 'contract' ? 'Contract' : 'Quotation'} for ${lead?.company_name || lead?.prospect_name || 'Lead'}`,
      valid_until: form.valid_until || undefined,
      items: form.items.filter((item) => item.description.trim()),
      clauses: form.clauses.split('\n').map((item) => item.trim()).filter(Boolean),
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
      <CRMSection title="Documents" description="Quotations and contracts for this lead.">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setForm((s) => ({ ...s, document_type: 'quotation' }))}>Create Quotation</Button>
          <Button type="button" variant="secondary" onClick={() => setForm((s) => ({ ...s, document_type: 'contract' }))}>Create Contract</Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200">
            <Upload className="h-4 w-4" />
            Upload Existing PDF
            <input className="hidden" type="file" accept="application/pdf" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} />
          </label>
          {uploadFile ? <Button type="button" variant="primary" disabled={uploadMutation.isLoading} onClick={() => uploadMutation.mutate()}>Upload {uploadFile.name}</Button> : null}
        </div>
      </CRMSection>

      <CRMSection title={`${form.document_type === 'contract' ? 'Contract' : 'Quotation'} editor`} description="Backend saves this as a lead-linked CRM document.">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Title</span>
            <input className={inputClassName} value={form.title} onChange={(event) => setForm((s) => ({ ...s, title: event.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Valid until</span>
            <input className={inputClassName} type="date" value={form.valid_until} onChange={(event) => setForm((s) => ({ ...s, valid_until: event.target.value }))} />
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
                <textarea className={`${inputClassName} min-h-20`} value={form[key]} onChange={(event) => setForm((s) => ({ ...s, [key]: event.target.value }))} />
              </label>
            ))}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Start date</span>
              <input className={inputClassName} type="date" value={form.start_date} onChange={(event) => setForm((s) => ({ ...s, start_date: event.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">End date</span>
              <input className={inputClassName} type="date" value={form.end_date} onChange={(event) => setForm((s) => ({ ...s, end_date: event.target.value }))} />
            </label>
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Additional clauses</span>
              <textarea className={`${inputClassName} min-h-24`} placeholder="One clause per line" value={form.clauses} onChange={(event) => setForm((s) => ({ ...s, clauses: event.target.value }))} />
            </label>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
          {form.items.map((item, index) => (
            <div key={index} className="grid gap-3 rounded-xl border border-surface-border p-3 dark:border-gray-800 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]">
              <input className={inputClassName} placeholder="Description" value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} />
              <input className={inputClassName} placeholder="Qty" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} />
              <input className={inputClassName} placeholder="Unit" value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)} />
              <input className={inputClassName} placeholder="Rate" value={item.unit_price} onChange={(event) => updateItem(index, 'unit_price', event.target.value)} />
              <input className={inputClassName} placeholder="Discount" value={item.discount} onChange={(event) => updateItem(index, 'discount', event.target.value)} />
              <input className={inputClassName} placeholder="GST %" value={item.tax_rate} onChange={(event) => updateItem(index, 'tax_rate', event.target.value)} />
            </div>
          ))}
          </div>
        )}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <textarea className={`${inputClassName} min-h-24`} placeholder="Terms" value={form.terms} onChange={(event) => setForm((s) => ({ ...s, terms: event.target.value }))} />
          <textarea className={`${inputClassName} min-h-24`} placeholder="Notes" value={form.notes} onChange={(event) => setForm((s) => ({ ...s, notes: event.target.value }))} />
        </div>
        <div className="mt-4 flex justify-between gap-2">
          {form.document_type === 'quotation' ? <Button type="button" variant="secondary" onClick={() => setForm((s) => ({ ...s, items: [...s.items, { ...emptyItem }] }))}>Add line</Button> : <span />}
          <Button type="button" variant="primary" onClick={submit} disabled={createMutation.isLoading}>Save document</Button>
        </div>
      </CRMSection>

      <CRMSection title="Previously created documents" description="Status, totals, sent date, and actions.">
        {documentsQuery.isLoading ? <div className="h-28 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" /> : documents.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
              <thead><tr className="text-left text-xs uppercase text-gray-500"><th className="py-2">Document</th><th>Status</th><th>Total</th><th>Created</th><th>Link expiry</th><th>Actions</th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td className="py-3"><div className="font-medium text-gray-900 dark:text-gray-100">{document.document_number}</div><div className="text-gray-500">{document.title}</div></td>
                    <td><Badge label={document.status} colorKey={document.status === 'accepted' ? 'completed' : document.status === 'rejected' ? 'critical' : 'scheduled'} /></td>
                    <td>{formatCurrency(Number(document.grand_total || 0))}</td>
                    <td>{formatShortDate(document.created_at)}</td>
                    <td>{formatShortDate(document.token_expires_at)}</td>
                    <td><div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" size="sm" disabled={actionMutation.isLoading} onClick={() => actionMutation.mutate({ action: 'pdf', document })}><FileText className="h-4 w-4" />Generate PDF</Button>
                      <a className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-2 py-1 text-xs" href={crmApi.leadDocumentPdfUrl(leadId, document.id)} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Preview</a>
                      <Button type="button" variant="secondary" size="sm" disabled={actionMutation.isLoading} onClick={() => actionMutation.mutate({ action: 'download', document })}><Download className="h-4 w-4" />Download</Button>
                      <Button type="button" variant="secondary" size="sm" disabled={actionMutation.isLoading} onClick={() => actionMutation.mutate({ action: 'share', document })}><Link2 className="h-4 w-4" />{document.token_expires_at ? 'Regenerate Link' : 'Generate Secure Link'}</Button>
                      {shareLinks[document.id] ? (
                        <>
                          <Button type="button" variant="secondary" size="sm" onClick={() => { copyText(shareLinks[document.id]); toast.success('Link copied') }}><Copy className="h-4 w-4" />Copy Link</Button>
                          <a className="inline-flex items-center gap-1 rounded-lg border border-surface-border px-2 py-1 text-xs" href={shareLinks[document.id]} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Open Public Page</a>
                        </>
                      ) : null}
                      {document.token_expires_at && !document.token_revoked_at ? <Button type="button" variant="ghost" size="sm" disabled={actionMutation.isLoading} onClick={() => actionMutation.mutate({ action: 'revoke', document })}>Revoke Link</Button> : null}
                      {document.document_type === 'quotation' ? <Button type="button" variant="secondary" size="sm" onClick={() => actionMutation.mutate({ action: 'contract', document })}>Contract</Button> : null}
                      {document.status !== 'cancelled' ? <Button type="button" variant="ghost" size="sm" onClick={() => actionMutation.mutate({ action: 'cancel', document })}>Cancel</Button> : null}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <CRMEmptyState icon={FileText} title="No documents yet" description="Create a quotation, contract, or upload an existing PDF." />}
      </CRMSection>

    </div>
  )
}
