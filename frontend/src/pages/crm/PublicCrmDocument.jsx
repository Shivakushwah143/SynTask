import { useState } from 'react'
import { useMutation, useQuery } from 'react-query'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { publicCrmDocumentsApi } from '../../api/crm'
import { Button, inputClassName } from '../../components/ui'
import { formatCurrency, formatShortDate } from './pipeline/utils'

export default function PublicCrmDocument() {
  const { token } = useParams()
  const [form, setForm] = useState({ name: '', email: '', accepted: false, comment: '' })
  const query = useQuery(['public-crm-document', token], () => publicCrmDocumentsApi.getDocument(token), { retry: false })
  const document = query.data?.document
  const action = useMutation((kind) => {
    if (kind === 'accept') return publicCrmDocumentsApi.accept(token, form)
    if (kind === 'reject') return publicCrmDocumentsApi.reject(token, form)
    return publicCrmDocumentsApi.requestChanges(token, form)
  }, {
    onSuccess: () => {
      toast.success('Response recorded')
      query.refetch()
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Response failed'),
  })
  const download = useMutation(() => publicCrmDocumentsApi.downloadPdf(token), {
    onSuccess: (response) => {
      const blob = response?.data || response
      const url = URL.createObjectURL(blob)
      const link = globalThis.document.createElement('a')
      link.href = url
      link.download = `${document?.document_number || 'crm-document'}.pdf`
      globalThis.document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Download failed'),
  })

  if (query.isLoading) return <div className="min-h-screen bg-gray-50 p-6 text-gray-700">Loading document...</div>
  if (query.isError || !document) return <div className="min-h-screen bg-gray-50 p-6 text-gray-700">Document link is invalid or expired.</div>

  const items = document.content_snapshot?.items || []
  const lead = document.content_snapshot?.lead || {}

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900">
      <section className="mx-auto max-w-4xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">SynTask</p>
            <h1 className="mt-2 text-2xl font-semibold">{document.title}</h1>
            <p className="mt-1 text-sm text-gray-500">{document.document_number} · {document.document_type}</p>
          </div>
          <div className="text-right text-sm text-gray-600">
            <p>Status: <span className="font-semibold capitalize">{document.status}</span></p>
            <p>Valid until: {formatShortDate(document.valid_until)}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Recipient</h2>
            <p className="mt-2 font-medium">{lead.company_name || lead.name || 'Lead'}</p>
            <p className="text-sm text-gray-500">{lead.email || lead.phone || ''}</p>
          </div>
          <div className="md:text-right">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Total</h2>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(Number(document.grand_total || 0))}</p>
          </div>
        </div>

        {items.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2">Description</th><th>Qty</th><th>Rate</th><th>Tax</th><th>Total</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item, index) => (
                  <tr key={index}><td className="py-2">{item.description}</td><td>{item.quantity} {item.unit}</td><td>{item.unit_price}</td><td>{item.tax_rate}%</td><td>{item.line_total}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-gray-50 p-4"><p className="text-xs uppercase text-gray-500">Subtotal</p><p className="font-semibold">{formatCurrency(Number(document.subtotal || 0))}</p></div>
          <div className="rounded-lg bg-gray-50 p-4"><p className="text-xs uppercase text-gray-500">Tax</p><p className="font-semibold">{formatCurrency(Number(document.tax_total || 0))}</p></div>
          <div className="rounded-lg bg-gray-50 p-4"><p className="text-xs uppercase text-gray-500">Grand total</p><p className="font-semibold">{formatCurrency(Number(document.grand_total || 0))}</p></div>
        </div>

        {document.terms || document.notes ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div><h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Terms</h2><p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{document.terms}</p></div>
            <div><h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Notes</h2><p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{document.notes}</p></div>
          </div>
        ) : null}

        <div className="mt-8 border-t border-gray-200 pt-6">
          <Button type="button" variant="secondary" disabled={download.isLoading} onClick={() => download.mutate()}>Download PDF</Button>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <input className={inputClassName} placeholder="Full name" value={form.name} onChange={(event) => setForm((s) => ({ ...s, name: event.target.value }))} />
            <input className={inputClassName} placeholder="Email" value={form.email} onChange={(event) => setForm((s) => ({ ...s, email: event.target.value }))} />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.accepted} onChange={(event) => setForm((s) => ({ ...s, accepted: event.target.checked }))} />
            I understand this records electronic acceptance, not a certified digital signature.
          </label>
          <textarea className={`${inputClassName} mt-3 min-h-24`} placeholder="Comment for rejection or requested changes" value={form.comment} onChange={(event) => setForm((s) => ({ ...s, comment: event.target.value }))} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={action.isLoading || document.status === 'accepted'} onClick={() => action.mutate('accept')}>Accept</Button>
            <Button type="button" variant="secondary" disabled={action.isLoading} onClick={() => action.mutate('changes')}>Request changes</Button>
            <Button type="button" variant="ghost" disabled={action.isLoading} onClick={() => action.mutate('reject')}>Reject</Button>
          </div>
        </div>
      </section>
    </main>
  )
}
