import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { CheckCircle2, FileText, Save } from 'lucide-react'
import { crmApi } from '../../../api/crm'
import { CRMEmptyState, CRMSection } from '../../../components/crm'
import { Badge, Button, inputClassName } from '../../../components/ui'
import { formatCurrency, formatShortDate } from '../pipeline/utils'
import { LEAD_DOCUMENTS_QUERY_KEY } from './documents'

const STATUS_OPTIONS = [
  { value: '', label: 'Not Started' },
  { value: 'negotiation_started', label: 'Negotiation Started' },
  { value: 'waiting_client', label: 'Waiting on Client' },
  { value: 'waiting_internal', label: 'Waiting Internally' },
  { value: 'discount_approval', label: 'Discount Approval' },
  { value: 'final_offer', label: 'Final Offer' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
]

const buildForm = (lead = {}, acceptedQuotation = null, negotiation = null) => {
  const source = negotiation || lead || {}
  return {
    accepted_quotation_reference: source.accepted_quotation_reference || acceptedQuotation?.document_number || '',
    negotiation_status: source.negotiation_status || '',
    customer_counter_offer: source.customer_counter_offer ?? '',
    final_agreed_amount: source.final_agreed_amount ?? source.won_amount ?? '',
    discount: source.discount ?? '',
    final_scope: source.final_scope || '',
    payment_terms: source.payment_terms || '',
    delivery_timeline: source.delivery_timeline || source.timeline || '',
    client_conditions: source.client_conditions || '',
    negotiation_notes: source.negotiation_notes || '',
    next_follow_up_at: (source.next_follow_up || source.next_follow_up_at) ? String(source.next_follow_up || source.next_follow_up_at).slice(0, 10) : '',
  }
}

const pickAcceptedQuotation = (documents = []) => (
  documents.find((document) => document.document_type === 'quotation' && document.status === 'accepted')
  || documents.find((document) => document.document_type === 'quotation')
  || null
)

const CommercialContext = ({ quotation, lead }) => (
  <CRMSection title="Commercial context" description="Read-only quotation and lead values available for this negotiation.">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <ContextTile label="Accepted quotation" value={quotation?.document_number || 'Not available'} />
      <ContextTile label="Quotation status" value={quotation?.status || lead?.proposal_status || '-'} />
      <ContextTile label="Quotation total" value={quotation ? formatCurrency(Number(quotation.grand_total || 0)) : formatCurrency(Number(lead?.budget || lead?.won_amount || 0))} />
      <ContextTile label="Decision maker" value={lead?.decision_maker || '-'} />
    </div>
    {quotation ? (
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge label={quotation.title || 'Quotation'} colorKey="draft" />
        <Badge label={`Created ${formatShortDate(quotation.created_at)}`} colorKey="scheduled" />
        {quotation.valid_until ? <Badge label={`Valid ${formatShortDate(quotation.valid_until)}`} colorKey="scheduled" /> : null}
      </div>
    ) : (
      <CRMEmptyState
        icon={FileText}
        title="No quotation context yet"
        description="Accepted quotation details will appear here after the Proposal workspace records one."
      />
    )}
  </CRMSection>
)

export function LeadNegotiationTab({ leadId, lead, onSaved, onScheduleFollowUp }) {
  const queryClient = useQueryClient()
  const documentsQuery = useQuery([LEAD_DOCUMENTS_QUERY_KEY, leadId], () => crmApi.getLeadDocuments(leadId), { enabled: Boolean(leadId), staleTime: 60_000 })
  const negotiationQuery = useQuery(['crm-lead-negotiation', leadId], () => crmApi.getLeadNegotiation(leadId), { enabled: Boolean(leadId), staleTime: 60_000 })
  const documents = useMemo(() => documentsQuery.data?.documents || [], [documentsQuery.data])
  const acceptedQuotation = useMemo(() => pickAcceptedQuotation(documents), [documents])
  const negotiation = negotiationQuery.data?.negotiation || null
  const [form, setForm] = useState(() => buildForm(lead, acceptedQuotation, negotiation))

  useEffect(() => {
    setForm(buildForm(lead, acceptedQuotation, negotiation))
  }, [lead, acceptedQuotation, negotiation])

  const updateField = (field, value) => {
    setForm((state) => ({ ...state, [field]: value }))
  }

  const saveMutation = useMutation((payload) => crmApi.updateLeadNegotiation(leadId, payload), {
    onSuccess: () => {
      toast.success('Negotiation saved')
      queryClient.invalidateQueries(['crm-lead-negotiation', leadId], { exact: true })
      queryClient.invalidateQueries(['crm-lead-workspace', leadId], { exact: true })
      queryClient.invalidateQueries(['crm-lead-workspace', leadId, 'timeline'], { exact: true })
      queryClient.invalidateQueries('crm-pipeline-board')
      onSaved?.()
    },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Negotiation save failed'),
  })

  const handleSave = () => {
    saveMutation.mutate({
      accepted_quotation_reference: form.accepted_quotation_reference,
      negotiation_status: form.negotiation_status,
      negotiation_notes: form.negotiation_notes,
      next_follow_up: form.next_follow_up_at,
      customer_counter_offer: form.customer_counter_offer === '' ? null : Number(form.customer_counter_offer),
      final_agreed_amount: form.final_agreed_amount === '' ? null : Number(form.final_agreed_amount),
      discount: form.discount === '' ? null : Number(form.discount),
      final_scope: form.final_scope,
      payment_terms: form.payment_terms,
      delivery_timeline: form.delivery_timeline,
      client_conditions: form.client_conditions,
    })
  }

  return (
    <div className="space-y-6">
      <CommercialContext quotation={acceptedQuotation} lead={lead} />

      <CRMSection title="Negotiation workspace" description="Manual commercial terms and status for the Negotiation stage.">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Accepted Quotation reference</span>
            <input className={inputClassName} value={form.accepted_quotation_reference} onChange={(event) => updateField('accepted_quotation_reference', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Negotiation Status</span>
            <select className={inputClassName} value={form.negotiation_status} onChange={(event) => updateField('negotiation_status', event.target.value)}>
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Next Follow-up</span>
            <input className={inputClassName} type="date" value={form.next_follow_up_at} onChange={(event) => updateField('next_follow_up_at', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Customer Counter Offer</span>
            <input className={inputClassName} type="number" value={form.customer_counter_offer} onChange={(event) => updateField('customer_counter_offer', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Final Agreed Amount</span>
            <input className={inputClassName} type="number" value={form.final_agreed_amount} onChange={(event) => updateField('final_agreed_amount', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Discount</span>
            <input className={inputClassName} value={form.discount} onChange={(event) => updateField('discount', event.target.value)} />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Payment Terms</span>
            <input className={inputClassName} value={form.payment_terms} onChange={(event) => updateField('payment_terms', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Delivery Timeline</span>
            <input className={inputClassName} value={form.delivery_timeline} onChange={(event) => updateField('delivery_timeline', event.target.value)} />
          </label>
          <label className="block lg:col-span-3">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Final Scope</span>
            <textarea className={`${inputClassName} min-h-24`} value={form.final_scope} onChange={(event) => updateField('final_scope', event.target.value)} />
          </label>
          <label className="block lg:col-span-3">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Client Conditions</span>
            <textarea className={`${inputClassName} min-h-24`} value={form.client_conditions} onChange={(event) => updateField('client_conditions', event.target.value)} />
          </label>
          <label className="block lg:col-span-3">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Negotiation Notes</span>
            <textarea className={`${inputClassName} min-h-28`} value={form.negotiation_notes} onChange={(event) => updateField('negotiation_notes', event.target.value)} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {onScheduleFollowUp ? (
            <Button type="button" variant="secondary" onClick={onScheduleFollowUp}>
              Schedule Follow-up
            </Button>
          ) : null}
          <Button type="button" variant="primary" loading={saveMutation.isLoading} onClick={handleSave}>
            <Save className="h-4 w-4" />
            Save Negotiation
          </Button>
        </div>
      </CRMSection>

      <CRMSection title="Agreement gate" description="Agreement unlocks after Negotiation Status is Accepted.">
        <div className="flex items-center gap-3 rounded-xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900/60">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Manual status remains authoritative</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Authorized users can edit Negotiation Status here; later automation must not remove that manual control.</p>
          </div>
        </div>
      </CRMSection>
    </div>
  )
}

function ContextTile({ label, value }) {
  return (
    <article className="rounded-xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </article>
  )
}
