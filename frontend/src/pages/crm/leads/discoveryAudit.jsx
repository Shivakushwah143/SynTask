import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { AlertCircle, CheckCircle2, FileText, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { crmApi } from '../../../api/crm'
import { CRMEmptyState, CRMSection } from '../../../components/crm'
import { Button, inputClassName } from '../../../components/ui'

const blankDiscovery = {
  business_information: {},
  current_marketing: {},
  problems: { selected: [], notes: '' },
  goals: { primary_goal: '', secondary_goals: [], expected_outcome: '', target_timeframe: '' },
  budget: {},
  decision_maker: {},
  competitors: [],
  timeline: {},
  summary: {},
}

const blankAudit = {
  audit_source: 'manual',
  website: {},
  google_presence: {},
  social_media: {},
  seo: {},
  competitors: [],
  swot: { strengths: [], weaknesses: [], opportunities: [], risks: [] },
  recommendations: [],
  findings: [],
}

const PROBLEMS = ['low lead generation', 'poor Google visibility', 'poor website ranking', 'weak social media', 'poor engagement', 'low conversion', 'expensive ads', 'inconsistent branding', 'poor website', 'low local visibility', 'no marketing strategy', 'lack of tracking', 'other']
const GOALS = ['increase leads', 'rank on Google', 'improve local visibility', 'improve website', 'increase sales', 'grow Instagram', 'improve brand awareness', 'reduce acquisition cost', 'launch campaigns', 'improve conversion', 'other']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']
const IMPACTS = ['High', 'Medium', 'Low']

const mergeWorkspace = (base, value) => ({ ...base, ...(value || {}) })
const arrayText = (value) => Array.isArray(value) ? value.join('\n') : ''
const textArray = (value) => String(value || '').split('\n').map((item) => item.trim()).filter(Boolean)

function completionLabel(workspace) {
  const percent = workspace?.completion?.percent ?? 0
  return `${percent}% Complete`
}

function EditableChecklist({ workspace, value = [], onChange, addPlaceholder = 'Add checklist item' }) {
  const [editing, setEditing] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const baseItems = workspace?.completion?.checklist || []
  const items = value.length > 0
    ? value.map((item, index) => ({ key: item.key || `custom-${index}`, label: item.label || item.title || '', complete: Boolean(item.complete), custom: Boolean(item.custom) }))
    : baseItems.map((item) => ({ key: item.key, label: item.label, complete: Boolean(item.complete), custom: false }))

  const commit = (next) => onChange(next.map((item) => ({ key: item.key, label: item.label, complete: Boolean(item.complete), custom: Boolean(item.custom) })))
  const toggle = (key) => commit(items.map((item) => item.key === key ? { ...item, complete: !item.complete } : item))
  const remove = (key) => commit(items.filter((item) => item.key !== key))
  const add = () => {
    const label = newLabel.trim()
    if (!label) return
    commit([...items, { key: `custom-${Date.now()}`, label, complete: false, custom: true }])
    setNewLabel('')
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing((state) => !state)}>
          {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          {editing ? 'Done' : 'Edit'}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm dark:border-gray-800">
            <button
              type="button"
              onClick={() => toggle(item.key)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              aria-pressed={item.complete}
            >
              {item.complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <span className="h-4 w-4 shrink-0 rounded-full border border-gray-300" />}
              <span className={item.complete ? 'truncate text-gray-900 dark:text-gray-100' : 'truncate text-gray-500'}>{item.label}</span>
            </button>
            {editing && item.custom ? (
              <button type="button" onClick={() => remove(item.key)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800" aria-label={`Remove ${item.label}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {editing ? (
        <div className="flex max-w-xl gap-2">
          <input className={inputClassName} value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder={addPlaceholder} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add() } }} />
          <Button type="button" variant="secondary" onClick={add}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', textarea = false, options, error }) {
  const controlClassName = `${inputClassName} ${error ? 'border-red-400 bg-red-50/60 text-red-900 focus:border-red-500 focus:ring-red-500 dark:border-red-700 dark:bg-red-950/20 dark:text-red-100' : ''}`
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      {options ? (
        <select className={controlClassName} value={value || ''} aria-invalid={error ? 'true' : undefined} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : textarea ? (
        <textarea className={`${controlClassName} min-h-24`} value={value || ''} aria-invalid={error ? 'true' : undefined} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input className={controlClassName} type={type} value={value || ''} aria-invalid={error ? 'true' : undefined} onChange={(event) => onChange(event.target.value)} />
      )}
      {error ? <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-300">{error}</p> : null}
    </label>
  )
}

function MultiChoice({ label, options, value = [], onChange, error }) {
  const selected = new Set(value || [])
  return (
    <div>
      <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      <div className={`flex flex-wrap gap-2 rounded-lg ${error ? 'border border-red-300 bg-red-50/50 p-2 dark:border-red-800 dark:bg-red-950/20' : ''}`}>
        {options.map((option) => {
          const active = selected.has(option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => {
                const next = new Set(selected)
                if (next.has(option)) next.delete(option)
                else next.add(option)
                onChange(Array.from(next))
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-surface-border text-gray-600 dark:border-gray-800 dark:text-gray-300'}`}
            >
              {option}
            </button>
          )
        })}
      </div>
      {error ? <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  )
}

function RecommendationEditor({ recommendations = [], onChange }) {
  const update = (index, field, value) => onChange(recommendations.map((item, i) => i === index ? { ...item, [field]: value } : item))
  const add = () => onChange([...recommendations, { title: '', category: '', description: '', priority: 'Medium', expected_impact: 'Medium', suggested_service: '', estimated_timeframe: '', include_in_proposal: true }])
  return (
    <div className="space-y-3">
      {recommendations.map((item, index) => (
        <div key={index} className="grid gap-3 rounded-lg border border-surface-border p-3 dark:border-gray-800 lg:grid-cols-3">
          <Field label="Title" value={item.title} onChange={(value) => update(index, 'title', value)} />
          <Field label="Category" value={item.category} onChange={(value) => update(index, 'category', value)} />
          <Field label="Suggested service" value={item.suggested_service} onChange={(value) => update(index, 'suggested_service', value)} />
          <Field label="Priority" value={item.priority} options={PRIORITIES} onChange={(value) => update(index, 'priority', value)} />
          <Field label="Impact" value={item.expected_impact} options={IMPACTS} onChange={(value) => update(index, 'expected_impact', value)} />
          <Field label="Timeframe" value={item.estimated_timeframe} onChange={(value) => update(index, 'estimated_timeframe', value)} />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" checked={Boolean(item.include_in_proposal)} onChange={(event) => update(index, 'include_in_proposal', event.target.checked)} />
            Include in proposal
          </label>
          <div className="lg:col-span-2">
            <Field label="Description" textarea value={item.description} onChange={(value) => update(index, 'description', value)} />
          </div>
          <div className="lg:col-span-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(recommendations.filter((_, i) => i !== index))}>
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={add}>
        <Plus className="h-4 w-4" />
        Add recommendation
      </Button>
    </div>
  )
}

function ValidationMessage({ error }) {
  const detail = error?.response?.data?.detail
  if (!detail?.missing_items) return null
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4" />{detail.message || 'Complete these items first'}</div>
      <ul className="mt-2 list-disc pl-5">
        {detail.missing_items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}

const missingItems = (error) => error?.response?.data?.detail?.missing_items || []
const hasValue = (value) => {
  if (Array.isArray(value)) return value.some((item) => hasValue(item))
  if (value && typeof value === 'object') return Object.values(value).some((item) => hasValue(item))
  return String(value ?? '').trim().length > 0
}

function discoveryFieldErrors(error, form, lead) {
  const missing = new Set(missingItems(error))
  const errors = {}
  if (missing.has('Business information') && !hasValue(form.business_information)) {
    errors.business_name = 'Enter at least one business detail.'
    errors.business_model = 'Enter at least one business detail.'
  }
  if (missing.has('Primary problem') && !hasValue(form.problems?.selected) && !hasValue(form.problems?.notes)) {
    errors.primary_problem = 'Select a pain point or write the primary problem.'
    errors.problem_notes = 'Select a pain point or write the primary problem.'
  }
  if (missing.has('Primary business goal') && !hasValue(form.goals?.primary_goal)) {
    errors.primary_goal = 'Select the primary business goal.'
  }
  if (missing.has('Budget status') && !hasValue(form.budget?.budget_confirmed)) {
    errors.budget_confirmed = 'Choose whether the budget is confirmed.'
  }
  if (missing.has('Decision maker') && !hasValue(form.decision_maker?.identified) && !hasValue(form.decision_maker?.name || lead?.decision_maker)) {
    errors.decision_maker_identified = 'Choose whether the decision maker is identified.'
    errors.decision_maker_name = 'Enter the decision maker name if known.'
  }
  return errors
}

export function LeadDiscoveryTab({ leadId, lead, onScheduleFollowUp }) {
  const queryClient = useQueryClient()
  const query = useQuery(['crm-lead-discovery', leadId], () => crmApi.getLeadDiscovery(leadId), { enabled: Boolean(leadId), staleTime: 60_000 })
  const [form, setForm] = useState(blankDiscovery)
  useEffect(() => setForm(mergeWorkspace(blankDiscovery, query.data?.discovery)), [query.data])
  const save = useMutation((payload) => crmApi.updateLeadDiscovery(leadId, payload), {
    onSuccess: (data) => { toast.success('Discovery saved'); queryClient.setQueryData(['crm-lead-discovery', leadId], data); queryClient.invalidateQueries(['crm-lead-workspace', leadId, 'timeline']) },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Discovery save failed'),
  })
  const complete = useMutation(() => crmApi.completeLeadDiscovery(leadId), {
    onSuccess: (data) => { toast.success('Discovery completed'); queryClient.setQueryData(['crm-lead-discovery', leadId], data); queryClient.invalidateQueries(['crm-lead-workspace', leadId]) },
    onError: () => {},
  })
  const update = (section, key, value) => setForm((state) => ({ ...state, [section]: { ...(state[section] || {}), [key]: value } }))
  if (query.isLoading) return <div className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
  const fieldErrors = discoveryFieldErrors(complete.error, form, lead)
  return (
    <div className="space-y-6">
      <CRMSection title="Discovery" description={completionLabel(form)}>
        <EditableChecklist
          workspace={form}
          value={form.summary?.discovery_checklist || []}
          addPlaceholder="Add discovery checklist item"
          onChange={(value) => setForm((state) => ({ ...state, summary: { ...(state.summary || {}), discovery_checklist: value } }))}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="primary" loading={save.isLoading} onClick={() => save.mutate(form)}><Save className="h-4 w-4" />Save Draft</Button>
          <Button type="button" variant="secondary" loading={complete.isLoading} onClick={() => complete.mutate()}>Complete Discovery</Button>
          <Button type="button" variant="secondary" onClick={onScheduleFollowUp}>Schedule Follow-up</Button>
        </div>
        <ValidationMessage error={complete.error} />
      </CRMSection>
      <CRMSection title="Business information">
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="Business name" value={form.business_information.business_name || lead?.company_name || ''} error={fieldErrors.business_name} onChange={(value) => update('business_information', 'business_name', value)} />
          <Field label="Business model / type" value={form.business_information.business_model} error={fieldErrors.business_model} onChange={(value) => update('business_information', 'business_model', value)} />
          <Field label="Industry" value={form.business_information.industry || lead?.industry || ''} onChange={(value) => update('business_information', 'industry', value)} />
          <Field label="Products/services" value={form.business_information.products_services} onChange={(value) => update('business_information', 'products_services', value)} />
          <Field label="Target audience" value={form.business_information.target_audience} onChange={(value) => update('business_information', 'target_audience', value)} />
          <Field label="Service locations" value={form.business_information.service_locations} onChange={(value) => update('business_information', 'service_locations', value)} />
          <Field label="Description" textarea value={form.business_information.description} onChange={(value) => update('business_information', 'description', value)} />
        </div>
      </CRMSection>
      <CRMSection title="Current marketing">
        <div className="grid gap-4 lg:grid-cols-3">
          {['current_website', 'google_business_profile_url', 'instagram_url', 'facebook_url', 'linkedin_url', 'youtube_url', 'current_lead_sources'].map((key) => <Field key={key} label={key.replace(/_/g, ' ')} value={form.current_marketing[key]} onChange={(value) => update('current_marketing', key, value)} />)}
          <Field label="Monthly lead volume" value={form.current_marketing.monthly_lead_volume} onChange={(value) => update('current_marketing', 'monthly_lead_volume', value)} />
          <Field label="Marketing spend" value={form.current_marketing.marketing_spend} onChange={(value) => update('current_marketing', 'marketing_spend', value)} />
          <Field label="Marketing notes" textarea value={form.current_marketing.notes} onChange={(value) => update('current_marketing', 'notes', value)} />
        </div>
      </CRMSection>
      <CRMSection title="Problems and goals">
        <div className="space-y-5">
          <MultiChoice label="Pain points" options={PROBLEMS} value={form.problems.selected} error={fieldErrors.primary_problem} onChange={(value) => update('problems', 'selected', value)} />
          <Field label="Pain-point notes" textarea value={form.problems.notes} error={fieldErrors.problem_notes} onChange={(value) => update('problems', 'notes', value)} />
          <Field label="Primary goal" value={form.goals.primary_goal} options={GOALS} error={fieldErrors.primary_goal} onChange={(value) => update('goals', 'primary_goal', value)} />
          <MultiChoice label="Secondary goals" options={GOALS} value={form.goals.secondary_goals} onChange={(value) => update('goals', 'secondary_goals', value)} />
          <Field label="Expected outcome" textarea value={form.goals.expected_outcome} onChange={(value) => update('goals', 'expected_outcome', value)} />
        </div>
      </CRMSection>
      <CRMSection title="Budget, decision maker, timeline">
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="Expected budget" type="number" value={form.budget.expected_budget || lead?.budget || ''} onChange={(value) => update('budget', 'expected_budget', value)} />
          <Field label="Budget range" value={form.budget.budget_range} onChange={(value) => update('budget', 'budget_range', value)} />
          <Field label="Budget confirmed?" value={form.budget.budget_confirmed} options={['yes', 'no', 'unknown']} error={fieldErrors.budget_confirmed} onChange={(value) => update('budget', 'budget_confirmed', value)} />
          <Field label="Decision maker identified?" value={form.decision_maker.identified} options={['yes', 'no', 'unknown']} error={fieldErrors.decision_maker_identified} onChange={(value) => update('decision_maker', 'identified', value)} />
          <Field label="Decision maker name" value={form.decision_maker.name || lead?.decision_maker || ''} error={fieldErrors.decision_maker_name} onChange={(value) => update('decision_maker', 'name', value)} />
          <Field label="Final approver" value={form.decision_maker.final_approver} onChange={(value) => update('decision_maker', 'final_approver', value)} />
          <Field label="Desired start date" type="date" value={form.timeline.desired_start_date} onChange={(value) => update('timeline', 'desired_start_date', value)} />
          <Field label="Expected decision date" type="date" value={form.timeline.expected_decision_date} onChange={(value) => update('timeline', 'expected_decision_date', value)} />
          <Field label="Expected duration" value={form.timeline.expected_duration || lead?.timeline || ''} onChange={(value) => update('timeline', 'expected_duration', value)} />
        </div>
      </CRMSection>
      <CRMSection title="Competitors and summary">
        <Field label="Competitors, one per line" textarea value={arrayText((form.competitors || []).map((item) => item.name || item))} onChange={(value) => setForm((state) => ({ ...state, competitors: textArray(value).map((name) => ({ name })) }))} />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field label="Salesperson summary" textarea value={form.summary.salesperson_summary} onChange={(value) => update('summary', 'salesperson_summary', value)} />
          <Field label="Next recommended action" textarea value={form.summary.next_recommended_action} onChange={(value) => update('summary', 'next_recommended_action', value)} />
        </div>
      </CRMSection>
    </div>
  )
}

export function LeadAuditTab({ leadId, lead, onScheduleFollowUp, onQuotationGenerated }) {
  const queryClient = useQueryClient()
  const query = useQuery(['crm-lead-audit', leadId], () => crmApi.getLeadAudit(leadId), { enabled: Boolean(leadId), staleTime: 60_000 })
  const discoveryQuery = useQuery(['crm-lead-discovery', leadId], () => crmApi.getLeadDiscovery(leadId), { enabled: Boolean(leadId), staleTime: 60_000 })
  const [form, setForm] = useState(blankAudit)
  const [prerequisites, setPrerequisites] = useState({
    businessName: '',
    primaryProblem: '',
    primaryGoal: '',
  })
  useEffect(() => setForm(mergeWorkspace(blankAudit, query.data?.audit)), [query.data])
  useEffect(() => {
    const discovery = mergeWorkspace(blankDiscovery, discoveryQuery.data?.discovery)
    setPrerequisites({
      businessName: discovery.business_information?.business_name || lead?.company_name || lead?.prospect_name || '',
      primaryProblem: discovery.problems?.notes || (discovery.problems?.selected || [])[0] || lead?.pain_points || lead?.requirement || '',
      primaryGoal: discovery.goals?.primary_goal || lead?.requirement || lead?.next_action || '',
    })
  }, [discoveryQuery.data, lead])
  const save = useMutation((payload) => crmApi.updateLeadAudit(leadId, payload), {
    onSuccess: (data) => { toast.success('Audit saved'); queryClient.setQueryData(['crm-lead-audit', leadId], data); queryClient.invalidateQueries(['crm-lead-workspace', leadId, 'timeline']) },
    onError: (error) => toast.error(error?.response?.data?.detail || 'Audit save failed'),
  })
  const complete = useMutation(() => crmApi.completeLeadAudit(leadId), {
    onSuccess: (data) => { toast.success('Audit completed'); queryClient.setQueryData(['crm-lead-audit', leadId], data) },
    onError: () => {},
  })
  const generate = useMutation(() => crmApi.generateQuotationFromDiscoveryAudit(leadId), {
    onSuccess: (data) => { toast.success('Quotation draft generated'); queryClient.invalidateQueries(['crm-lead-documents', leadId]); onQuotationGenerated?.(data?.document) },
    onError: () => {},
  })
  const savePrerequisites = async () => {
    const payload = {
      business_information: { business_name: prerequisites.businessName },
      problems: { notes: prerequisites.primaryProblem },
      goals: { primary_goal: prerequisites.primaryGoal },
    }
    const saved = await crmApi.updateLeadDiscovery(leadId, payload)
    queryClient.setQueryData(['crm-lead-discovery', leadId], saved)
    return saved
  }
  const handleSave = async () => {
    try {
      await savePrerequisites()
      save.mutate(form)
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Discovery save failed')
    }
  }
  const handleGenerate = async () => {
    try {
      await savePrerequisites()
      const saved = await crmApi.updateLeadAudit(leadId, form)
      queryClient.setQueryData(['crm-lead-audit', leadId], saved)
      generate.mutate()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Audit save failed')
    }
  }
  const update = (section, key, value) => setForm((state) => ({ ...state, [section]: { ...(state[section] || {}), [key]: value } }))
  const updatePrerequisite = (key, value) => setPrerequisites((state) => ({ ...state, [key]: value }))
  const included = useMemo(() => (form.recommendations || []).filter((item) => item.include_in_proposal), [form.recommendations])
  if (query.isLoading || discoveryQuery.isLoading) return <div className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
  return (
    <div className="space-y-6">
      <CRMSection title="Audit" description={completionLabel(form)}>
        <EditableChecklist
          workspace={form}
          value={form.findings || []}
          addPlaceholder="Add audit checklist item"
          onChange={(value) => setForm((state) => ({ ...state, findings: value }))}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="primary" loading={save.isLoading} onClick={handleSave}><Save className="h-4 w-4" />Save Draft</Button>
          <Button type="button" variant="secondary" loading={complete.isLoading} onClick={() => complete.mutate()}>Complete Audit</Button>
          <Button type="button" variant="secondary" onClick={onScheduleFollowUp}>Schedule Follow-up</Button>
          <Button type="button" variant="primary" loading={generate.isLoading} onClick={handleGenerate}><FileText className="h-4 w-4" />Generate Quotation Draft</Button>
        </div>
        <ValidationMessage error={complete.error || generate.error} />
        {included.length === 0 ? <CRMEmptyState title="No proposal recommendations selected" description="Mark at least one recommendation as included before generating a quotation draft." /> : null}
      </CRMSection>
      <CRMSection title="Quotation prerequisites">
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="Business / customer identity" value={prerequisites.businessName} onChange={(value) => updatePrerequisite('businessName', value)} />
          <Field label="Primary problem" textarea value={prerequisites.primaryProblem} onChange={(value) => updatePrerequisite('primaryProblem', value)} />
          <Field label="Primary business goal" textarea value={prerequisites.primaryGoal} onChange={(value) => updatePrerequisite('primaryGoal', value)} />
        </div>
      </CRMSection>
      <CRMSection title="Website, Google presence, SEO">
        <div className="grid gap-4 lg:grid-cols-3">
          <Field label="Website URL" value={form.website.website_url} onChange={(value) => update('website', 'website_url', value)} />
          <Field label="Mobile usability" value={form.website.mobile_usability} onChange={(value) => update('website', 'mobile_usability', value)} />
          <Field label="HTTPS" value={form.website.https} options={['yes', 'no', 'unknown']} onChange={(value) => update('website', 'https', value)} />
          <Field label="GBP URL" value={form.google_presence.gbp_url} onChange={(value) => update('google_presence', 'gbp_url', value)} />
          <Field label="Rating" value={form.google_presence.rating} onChange={(value) => update('google_presence', 'rating', value)} />
          <Field label="Review count" value={form.google_presence.review_count} onChange={(value) => update('google_presence', 'review_count', value)} />
          <Field label="SEO recommendations" textarea value={form.seo.recommendations} onChange={(value) => update('seo', 'recommendations', value)} />
          <Field label="Technical issues" textarea value={form.seo.technical_issues} onChange={(value) => update('seo', 'technical_issues', value)} />
          <Field label="Content gaps" textarea value={form.seo.content_gaps} onChange={(value) => update('seo', 'content_gaps', value)} />
        </div>
      </CRMSection>
      <CRMSection title="Social and competitor audit">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Social media observations" textarea value={form.social_media.observations} onChange={(value) => update('social_media', 'observations', value)} />
          <Field label="Competitors, one per line" textarea value={arrayText((form.competitors || []).map((item) => item.name || item))} onChange={(value) => setForm((state) => ({ ...state, competitors: textArray(value).map((name) => ({ name })) }))} />
        </div>
      </CRMSection>
      <CRMSection title="SWOT summary">
        <div className="grid gap-4 lg:grid-cols-2">
          {['strengths', 'weaknesses', 'opportunities', 'risks'].map((key) => <Field key={key} label={key} textarea value={arrayText(form.swot?.[key])} onChange={(value) => update('swot', key, textArray(value))} />)}
        </div>
      </CRMSection>
      <CRMSection title="Recommendations">
        <RecommendationEditor recommendations={form.recommendations || []} onChange={(value) => setForm((state) => ({ ...state, recommendations: value }))} />
      </CRMSection>
    </div>
  )
}
