/* eslint-disable react-refresh/only-export-components */
import { memo, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BadgeInfo, CalendarClock, CheckCircle2, Clock3, FileText, History, Layers3, Lock, Mail, MessageSquare, Pencil, Route, Save, Sparkles, StickyNote, Video, Wand2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { salesApi } from '../../../api/sales'
import { usersAPI } from '../../../api/users'
import { CRMContent, CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, EmptyState, LoadingSpinner, inputClassName } from '../../../components/ui'
import { formatCurrency, formatShortDate, getCanonicalPipelineStageKey, getLeadContactLabel, getLeadOwnerLabel, getLeadTags } from '../pipeline/utils'
import { asArray } from '../../phase4Utils'
import { LeadFilesTab } from './files'

export const LEAD_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'notes', label: 'Notes' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'emails', label: 'Emails' },
  { key: 'files', label: 'Files' },
  { key: 'call_logs', label: 'Calls' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'ai', label: 'AI' },
]
const PRIMARY_LEAD_TAB_KEYS = new Set(['overview', 'notes', 'tasks', 'meetings', 'emails'])

const leadTone = (value) => {
  const key = String(value || '').toLowerCase()
  if (['critical', 'high', 'hot', 'lost', 'dead'].some((item) => key.includes(item))) return 'rose'
  if (['warm', 'medium', 'proposal', 'qualified', 'contacted'].some((item) => key.includes(item))) return 'amber'
  if (['won', 'active', 'low', 'cold', 'new'].some((item) => key.includes(item))) return 'emerald'
  return 'slate'
}

const LEAD_STAGE_STEPS = ['New', 'Contacted', 'Qualified', 'Discovery', 'Proposal', 'Negotiation', 'Won']
const LEAD_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'closed', label: 'Closed' },
]
const LEAD_PRIORITY_OPTIONS = [
  { value: 'cold', label: 'Cold' },
  { value: 'warm', label: 'Warm' },
  { value: 'hot', label: 'Hot' },
]

const formatUserName = (user) => `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || user?.id || ''

const findOptionLabel = (options, value, fallback = '-') => options.find((option) => String(option.value) === String(value))?.label || fallback

export const buildLeadEditFields = (lead = {}, stages = [], users = []) => {
  const stageValue = getCanonicalPipelineStageKey(lead.current_stage || '')
  const stageOptions = stages.map((stage) => ({
    value: stage.key || getCanonicalPipelineStageKey(stage.name),
    label: stage.name,
  }))
  const ownerOptions = users.map((user) => ({
    value: user.id,
    label: formatUserName(user),
  }))
  const tagValue = Array.isArray(lead.tag) ? lead.tag.join('|') : (lead.tag || '')

  return [
    { key: 'current_stage', type: 'select', label: 'Stage', value: stageValue, displayValue: findOptionLabel(stageOptions, stageValue, stageValue || '-'), options: stageOptions },
    { key: 'status', type: 'select', label: 'Status', value: lead.status || '', displayValue: findOptionLabel(LEAD_STATUS_OPTIONS, lead.status, lead.status || '-'), options: LEAD_STATUS_OPTIONS },
    { key: 'assigned_to', type: 'select', label: 'Owner', value: lead.assigned_to || '', displayValue: findOptionLabel(ownerOptions, lead.assigned_to, getLeadOwnerLabel(lead)), options: ownerOptions },
    { key: 'interest_level', type: 'select', label: 'Priority', value: lead.interest_level || '', displayValue: findOptionLabel(LEAD_PRIORITY_OPTIONS, lead.interest_level, lead.interest_level || '-'), options: LEAD_PRIORITY_OPTIONS },
    { key: 'channel', type: 'text', label: 'Source', value: lead.channel || '', displayValue: lead.channel || '-' },
    { key: 'tag', type: 'text', label: 'Tags', value: tagValue, displayValue: tagValue || '-' },
  ]
}

export const buildLeadOverviewSections = (lead = {}) => {
  const customFields = lead?.custom_fields && typeof lead.custom_fields === 'object' ? lead.custom_fields : {}
  const contactItems = [
    { label: 'Contact', value: lead?.crm_contact_name || lead?.primary_contact || lead?.contact_name || lead?.prospect_name || '-' },
    { label: 'Email', value: lead?.email || '-' },
    { label: 'Phone', value: lead?.phone || '-' },
  ]
  const pipelineItems = [
    { label: 'Source', value: lead?.channel || '-' },
    { label: 'Estimated close', value: formatShortDate(lead?.estimated_close_date) },
    { label: 'Days in stage', value: String(Math.max(Number(lead?.days_in_stage || 0), 0)) },
  ]
  const sections = [
    { title: 'Contact Snapshot', tone: 'emerald', items: contactItems },
    { title: 'Pipeline Signals', tone: 'amber', items: pipelineItems },
  ]
  const customItems = Object.entries(customFields).map(([key, value]) => ({ label: key, value: String(value) }))
  if (customItems.length) sections.push({ title: 'Custom Fields', tone: 'blue', items: customItems })
  return sections
}

const toneClass = (tone) => ({
  rose: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-200 dark:ring-rose-900/50',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900/50',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900/50',
  slate: 'bg-slate-50 text-slate-700 ring-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800',
}[tone] || 'bg-slate-50 text-slate-700 ring-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-800')

function LeadPill({ label, value }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${toneClass(leadTone(value))}`}>
      {label ? <span className="text-current/70">{label}</span> : null}
      {value || '-'}
    </span>
  )
}

export const LeadWorkspace = memo(function LeadWorkspace({
  title,
  description,
  breadcrumbs,
  lead,
  activeTab,
  onTabChange,
  onBack,
  onRefresh,
  onSendEmail,
  onSaveLead,
  isSaving = false,
  users = [],
  body,
  sidebar,
}) {
  const stageKey = getCanonicalPipelineStageKey(lead?.current_stage || lead?.stage || 'new')
  const stageIndex = Math.max(0, LEAD_STAGE_STEPS.findIndex((stage) => getCanonicalPipelineStageKey(stage) === stageKey))
  const stageStep = stageIndex + 1
  const stageTotal = LEAD_STAGE_STEPS.length
  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="Lead"
        title={title}
        description={description}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" size="sm" onClick={onSendEmail}>
              <Mail className="h-4 w-4" />
              Send Email
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
              Refresh
            </Button>
          </div>
        )}
      />

      <LeadHeader lead={lead} breadcrumbs={breadcrumbs} onSave={onSaveLead} isSaving={isSaving} users={users} />

      <section className="rounded-2xl border border-surface-border/80 bg-white/90 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/85">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted dark:text-gray-400">Pipeline progress</p>
            <p className="mt-1 text-sm font-semibold text-text-primary dark:text-gray-100">
              Step {stageStep} of {stageTotal}: {LEAD_STAGE_STEPS[stageIndex] || lead?.current_stage || 'New'}
            </p>
          </div>
          <div className="min-w-48 flex-1 sm:max-w-sm">
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted dark:bg-gray-800">
              <div className="h-full rounded-full bg-primary-500" style={{ width: `${(stageStep / stageTotal) * 100}%` }} />
            </div>
          </div>
        </div>
      </section>

      <LeadTabs activeTab={activeTab} onTabChange={onTabChange} />

      <LeadWorkspaceLayout body={body} sidebar={sidebar} />
    </CRMPage>
  )
})

export const LeadWorkspaceLayout = memo(function LeadWorkspaceLayout({ body, sidebar }) {
  return (
    <CRMContent className="xl:grid-cols-[minmax(0,1fr)_320px]" aside={sidebar}>
      {body}
    </CRMContent>
  )
})

export const LeadHeader = memo(function LeadHeader({ lead, breadcrumbs = [], onSave, isSaving = false, users = [] }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})

  const companyName = lead?.crm_company_name || lead?.company_name || lead?.prospect_name || 'Lead'
  const contactName = getLeadContactLabel(lead)
  const leadTags = getLeadTags(lead)
  const stage = lead?.current_stage || 'Unassigned'
  const priority = lead?.priority || lead?.interest_level || 'medium'
  const status = lead?.status || 'active'
  const createdDate = formatShortDate(lead?.created_at || lead?.createdAt || lead?.created_date)
  const phoneLabel = [lead?.country_code, lead?.phone].filter(Boolean).join(' ') || '-'

  // Resolve owner by assigned id first; fallback labels can be stale or id-shaped.
  const ownerName = useMemo(() => {
    const rawId = String(lead?.assigned_to || lead?.owner_id || lead?.ownerId || '').trim()
    const found = users.find((user) => String(user.id || user._id || user.user_id || '').trim() === rawId)
    if (found) return formatUserName(found) || found.email || '-'
    const rawOwner = getLeadOwnerLabel(lead)
    return rawOwner && rawOwner !== 'Unassigned' ? rawOwner : '-'
  }, [lead, users])

  const ownerOptions = useMemo(() => {
    return [
      { value: '', label: 'Unassigned' },
      ...users.map((user) => ({
        value: String(user.id || user._id || user.user_id),
        label: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || user.id,
      })),
    ]
  }, [users])

  useEffect(() => {
    setForm({
      company_name: lead?.company_name || '',
      prospect_name: lead?.prospect_name || '',
      first_name: lead?.first_name || '',
      last_name: lead?.last_name || '',
      assigned_to: lead?.assigned_to || '',
      won_amount: String(lead?.won_amount ?? lead?.deal_value ?? ''),
    })
  }, [lead])

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (isSaving) return
    const payload = {}
    if (form.company_name !== (lead?.company_name || '')) payload.company_name = form.company_name
    if (form.prospect_name !== (lead?.prospect_name || '')) payload.prospect_name = form.prospect_name
    if (form.first_name !== (lead?.first_name || '')) payload.first_name = form.first_name
    if (form.last_name !== (lead?.last_name || '')) payload.last_name = form.last_name
    if (form.assigned_to !== (lead?.assigned_to || '')) payload.assigned_to = form.assigned_to
    if (form.won_amount !== String(lead?.won_amount ?? lead?.deal_value ?? '')) payload.won_amount = Number(form.won_amount) || 0

    if (Object.keys(payload).length === 0) {
      setEditing(false)
      return
    }

    try {
      await onSave?.(payload)
      setEditing(false)
    } catch {
      // Keep the form open with the entered values so the user can retry.
    }
  }

  const handleCancel = () => {
    setForm({
      company_name: lead?.company_name || '',
      prospect_name: lead?.prospect_name || '',
      first_name: lead?.first_name || '',
      last_name: lead?.last_name || '',
      assigned_to: lead?.assigned_to || '',
      won_amount: String(lead?.won_amount ?? lead?.deal_value ?? ''),
    })
    setEditing(false)
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-100/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="h-1.5 bg-gradient-to-r from-primary-500 via-emerald-400 to-amber-300" />
      <div className="group p-5">
        {/* Edit/Save/Cancel actions */}
        <div className="mb-4 flex justify-end gap-1.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                aria-busy={isSaving || undefined}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? <LoadingSpinner size="sm" label="" /> : <Save className="h-3 w-3" />}
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={isSaving}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/80 px-3 py-1 text-[11px] font-semibold text-gray-500 shadow-sm transition-all hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="Edit header fields"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <LeadPill label="Stage" value={stage} />
              <LeadPill label="Priority" value={priority} />
              <LeadPill label="Status" value={status} />
            </div>

            {editing ? (
              <div className="mt-4 space-y-3">
                {/* Company / Lead Name */}
                <HeaderEditField
                  label="Company name"
                  value={form.company_name}
                  onChange={(v) => updateField('company_name', v)}
                  placeholder="Company name"
                />
                <HeaderEditField
                  label="Lead name"
                  value={form.prospect_name}
                  onChange={(v) => updateField('prospect_name', v)}
                  placeholder="Lead / prospect name"
                />
                <div className="grid grid-cols-2 gap-3">
                  <HeaderEditField
                    label="First name"
                    value={form.first_name}
                    onChange={(v) => updateField('first_name', v)}
                    placeholder="First name"
                  />
                  <HeaderEditField
                    label="Last name"
                    value={form.last_name}
                    onChange={(v) => updateField('last_name', v)}
                    placeholder="Last name"
                  />
                </div>
                <HeaderEditField label="Owner (assigned to)" type="select" value={form.assigned_to} onChange={(v) => updateField('assigned_to', v)} options={ownerOptions} />
                <HeaderEditField
                  label="Deal value"
                  type="number"
                  value={form.won_amount}
                  onChange={(v) => updateField('won_amount', v)}
                  placeholder="0"
                />
              </div>
            ) : (
              <>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                  {companyName}
                </h2>
                <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{contactName || 'Primary contact not available'}</p>
              </>
            )}

            {!editing && breadcrumbs?.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {breadcrumbs.map((crumb, index) => (
                  <span key={`${crumb}-${index}`} className="inline-flex items-center gap-2">
                    {index > 0 ? <ArrowRight className="h-3.5 w-3.5" /> : null}
                    <span>{crumb}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Right side summary chips */}
          <div className="grid min-w-[240px] gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <SummaryChip label="Owner" value={ownerName} compact />
            <SummaryChip label="Phone" value={phoneLabel} compact />
            <SummaryChip label="Created" value={createdDate} compact />
          </div>
        </div>
        {!editing && leadTags.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
            {leadTags.slice(0, 5).map((tag) => <Badge key={tag} label={tag} colorKey="draft" />)}
          </div>
        ) : null}
      </div>
    </section>
  )
})

function HeaderEditField({ label, value, onChange, type = 'text', placeholder, options }) {
  const inputId = `header-edit-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{label}</span>
      {type === 'select' && options ? (
        <select
          id={inputId}
          className={`${inputClassName} text-sm`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={inputId}
          className={`${inputClassName} text-sm`}
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(type === 'number' ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  )
}

export const LeadTabs = memo(function LeadTabs({ activeTab, onTabChange }) {
  const primaryTabs = LEAD_TABS.filter((tab) => PRIMARY_LEAD_TAB_KEYS.has(tab.key))
  const moreTabs = LEAD_TABS.filter((tab) => !PRIMARY_LEAD_TAB_KEYS.has(tab.key))
  const activeMoreTab = moreTabs.find((tab) => tab.key === activeTab)
  return (
    <nav aria-label="Lead workspace sections" className="overflow-x-auto rounded-2xl border border-surface-border/80 bg-white/90 p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900/85">
      <div className="flex min-w-max items-center gap-2">
        {primaryTabs.map((tab) => {
          const isActive = activeTab === tab.key
          const commonClass = `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            isActive
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
          }`

          if (tab.disabled) {
            return (
              <button
                key={tab.key}
                type="button"
                className={`${commonClass} cursor-not-allowed opacity-60`}
                aria-disabled="true"
                title="Coming soon"
              >
                {tab.label}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  Soon
                </span>
              </button>
            )
          }

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange?.(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              className={commonClass}
            >
              {tab.label}
            </button>
          )
        })}
        <label className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          activeMoreTab
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
        }`}
        >
          <span>More</span>
          <select
            className="bg-transparent text-sm font-medium outline-none"
            value={activeMoreTab?.key || ''}
            onChange={(event) => {
              if (event.target.value) onTabChange?.(event.target.value)
            }}
            aria-label="More lead sections"
          >
            <option value="">Select</option>
            {moreTabs.map((tab) => <option key={tab.key} value={tab.key}>{tab.label}</option>)}
          </select>
        </label>
      </div>
    </nav>
  )
})

const buildLeadOverviewForm = (lead = {}) => ({
  prospect_name: lead?.prospect_name || '',
  company_name: lead?.company_name || '',
  email: lead?.email || '',
  phone: lead?.phone || '',
  channel: lead?.channel || '',
  estimated_close_date: lead?.estimated_close_date ? String(lead.estimated_close_date).slice(0, 10) : '',
})

export const LeadOverview = memo(function LeadOverview({ lead, onSubmit, isSaving = false }) {
  const sections = buildLeadOverviewSections(lead)
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState(() => buildLeadOverviewForm(lead))

  useEffect(() => {
    setForm(buildLeadOverviewForm(lead))
  }, [lead])

  const updateField = (field, value) => {
    setForm((state) => ({ ...state, [field]: value }))
  }

  const saveOverview = () => {
    onSubmit?.(form)
    setIsEditing(false)
  }

  return (
    <CRMSection
      title="Lead overview"
      description="Balanced lead context grouped for quick scanning."
      actions={(
        <Button type="button" variant="secondary" size="sm" onClick={() => setIsEditing((value) => !value)}>
          <Pencil className="h-4 w-4" />
          {isEditing ? 'Close edit' : 'Edit'}
        </Button>
      )}
    >
      {isEditing ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <LeadOverviewInput label="Lead name" value={form.prospect_name} onChange={(value) => updateField('prospect_name', value)} />
            <LeadOverviewInput label="Company" value={form.company_name} onChange={(value) => updateField('company_name', value)} />
            <LeadOverviewInput label="Email" type="email" value={form.email} onChange={(value) => updateField('email', value)} />
            <LeadOverviewInput label="Phone" type="tel" maxLength={10} value={form.phone} onChange={(value) => updateField('phone', value)} />
            <LeadOverviewInput label="Source" value={form.channel} onChange={(value) => updateField('channel', value)} />
            <LeadOverviewInput label="Estimated close" type="date" value={form.estimated_close_date} onChange={(value) => updateField('estimated_close_date', value)} />
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border/80 pt-4 dark:border-gray-800">
            <Button type="button" variant="secondary" onClick={() => { setForm(buildLeadOverviewForm(lead)); setIsEditing(false) }}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={saveOverview} loading={isSaving}>
              Review changes
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((section, index) => (
            <LeadOverviewPanel
              key={section.title}
              section={section}
              className={sections.length === 3 && index === 2 ? 'lg:col-span-2' : ''}
            />
          ))}
        </div>
      )}
    </CRMSection>
  )
})

function LeadOverviewInput({ label, value, onChange, type = 'text', maxLength }) {
  return (
    <label className="block rounded-xl border border-surface-border/80 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{label}</span>
      <input
        className={`${inputClassName} mt-2`}
        type={type}
        value={value ?? ''}
        maxLength={maxLength}
        onChange={(event) => {
          const raw = event.target.value
          const next = type === 'tel' ? raw.replace(/\D/g, '') : raw
          onChange(next)
        }}
      />
    </label>
  )
}

function LeadOverviewPanel({ section, className = '' }) {
  const tone = {
    emerald: 'border-emerald-200/80 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200',
    amber: 'border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200',
    blue: 'border-sky-200/80 bg-sky-50/80 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-200',
  }[section.tone] || 'border-surface-border/80 bg-white text-text-primary dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100'

  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${tone} ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{section.title}</h3>
        <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-current shadow-sm dark:bg-gray-950/30">
          {section.items.length} fields
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {section.items.map((item) => (
          <article key={item.label} className="rounded-xl border border-white/70 bg-white/80 p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{item.label}</p>
            <p className="mt-2 break-words text-sm font-semibold text-gray-900 dark:text-gray-100">{item.value}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export const LeadSummaryCards = memo(function LeadSummaryCards({ lead }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <CRMStatCard icon={BadgeInfo} label="Priority" value={lead?.priority || lead?.interest_level || 'medium'} tone="blue" />
      <CRMStatCard icon={Clock3} label="Days in stage" value={String(Math.max(Number(lead?.days_in_stage || 0), 0))} tone="emerald" />
      <CRMStatCard icon={CalendarClock} label="Created" value={formatShortDate(lead?.created_at || lead?.createdAt || lead?.created_date)} tone="amber" />
      <CRMStatCard icon={FileText} label="Deal value" value={formatCurrency(lead?.won_amount ?? lead?.deal_value ?? 0)} tone="slate" />
    </div>
  )
})

function LeadEditField({ field, onChange }) {
  const inputId = `lead-edit-${field.key}`
  return (
    <label className="block rounded-xl border border-white/70 bg-white/85 p-3 shadow-sm transition-colors focus-within:border-primary-300 dark:border-gray-800 dark:bg-gray-950/60 dark:focus-within:border-primary-700">
      <span className="flex items-start justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{field.label}</span>
        <span className="max-w-[9rem] truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{field.displayValue}</span>
      </span>
      {field.type === 'select' ? (
        <select id={inputId} className={`${inputClassName} mt-2`} value={field.value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select {field.label.toLowerCase()}</option>
          {field.options.map((option) => <option key={option.value || option.label} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input id={inputId} className={`${inputClassName} mt-2`} value={field.value} onChange={(event) => onChange(event.target.value)} placeholder={field.label === 'Tags' ? 'Tags, pipe-separated' : field.label} />
      )}
    </label>
  )
}

export const LeadSidebar = memo(function LeadSidebar({ lead, onSendEmail }) {
  const navigate = useNavigate()
  const activityPath = lead?.id ? `/crm/activities?entity_type=lead&entity_id=${lead.id}` : '/crm/activities'
  const { data: stagesData } = useQuery('crm-lead-edit-stages', salesApi.getStages)
  const { data: usersData } = useQuery('crm-lead-edit-users', () => usersAPI.getAssignableUsersWithJuniors())
  // Master list endpoints return { total, items }, so read the items (with .stages fallback).
  const stages = asArray(stagesData, ['stages'])
  const users = Array.isArray(usersData?.users) ? usersData.users : []
  const [form, setForm] = useState({ current_stage: '', status: '', assigned_to: '', interest_level: '', channel: '', tag: '' })
  const [customFields, setCustomFields] = useState('{}')
  const editFields = buildLeadEditFields({ ...lead, ...form }, stages, users)
  const sidebarMeta = [
    { label: 'Stage', value: form.current_stage || lead?.current_stage || 'new' },
    { label: 'Priority', value: form.interest_level || lead?.interest_level || 'medium' },
  ]

  useEffect(() => {
    const custom = lead?.custom_fields && typeof lead.custom_fields === 'object' ? lead.custom_fields : {}
    setForm({
      current_stage: getCanonicalPipelineStageKey(lead?.current_stage || ''),
      status: lead?.status || '',
      assigned_to: lead?.assigned_to || '',
      interest_level: lead?.interest_level || '',
      channel: lead?.channel || '',
      tag: Array.isArray(lead?.tag) ? lead.tag.join('|') : (lead?.tag || ''),
    })
    setCustomFields(JSON.stringify(custom, null, 2))
  }, [lead])

  const stageMutation = useMutation((stage) => crmApi.updatePipelineStage(lead?.id, { stage }), {
    onSuccess: () => toast.success('Lead stage updated'),
    onError: (error) => toast.error(error?.response?.data?.detail || 'Stage update failed'),
  })

  const saveMutation = useMutation((payload) => salesApi.updateLeadForm(lead?.id, payload), {
    onSuccess: () => toast.success('Lead updated'),
    onError: (error) => toast.error(error?.response?.data?.detail || 'Update failed'),
  })

  const saveLead = () => {
    const payload = new FormData()
    Object.entries(form).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') payload.append(key, value)
    })
    try {
      const parsed = customFields.trim() ? JSON.parse(customFields) : {}
      payload.append('custom_fields', JSON.stringify(parsed))
    } catch {
      toast.error('Custom fields must be valid JSON')
      return
    }
    const nextStage = getCanonicalPipelineStageKey(form.current_stage)
    const currentStage = getCanonicalPipelineStageKey(lead?.current_stage || '')
    if (nextStage && nextStage !== currentStage) {
      stageMutation.mutate(nextStage)
    }
    saveMutation.mutate(payload)
  }
  return (
    <div className="space-y-4 rounded-2xl border border-primary-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,242,232,0.88))] p-4 shadow-[0_18px_44px_rgba(63,49,37,0.09)] dark:border-[#5a4635] dark:bg-[linear-gradient(180deg,rgba(36,28,20,0.96),rgba(20,16,12,0.94))] dark:shadow-[0_18px_44px_rgba(0,0,0,0.28)]">
      <div className="rounded-xl border border-primary-100/80 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/50">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600 dark:text-primary-300">Lead control</p>
            <h2 className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">Update workspace</h2>
          </div>
          <span className="rounded-xl bg-primary-50 p-2 text-primary-700 ring-1 ring-primary-100 dark:bg-primary-950/50 dark:text-primary-200 dark:ring-primary-900/50">
            <Layers3 className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {sidebarMeta.map((item) => (
            <div key={item.label} className="rounded-xl border border-surface-border/70 bg-white/75 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/70">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{item.label}</p>
              <p className="mt-1 truncate text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <LeadSidebarPanel title="Pipeline edits" description="Ownership, stage and qualification fields.">
        <div className="grid gap-3">
          {editFields.map((field) => (
            <LeadEditField
              key={field.key}
              field={field}
              onChange={(value) => setForm((state) => ({ ...state, [field.key]: value }))}
            />
          ))}
        </div>
        <Button type="button" variant="primary" className="mt-4 w-full justify-center shadow-sm" onClick={saveLead} loading={saveMutation.isLoading || stageMutation.isLoading}>
          <CheckCircle2 className="h-4 w-4" />
          Save lead
        </Button>
        <details className="mt-4 rounded-xl border border-primary-100/80 bg-primary-50/45 p-4 dark:border-gray-800 dark:bg-gray-950/60">
          <summary className="cursor-pointer list-none text-sm font-medium text-gray-700 dark:text-gray-200">
            Advanced fields
          </summary>
          <div className="mt-4 space-y-3">
            <textarea className={`${inputClassName} min-h-28`} value={customFields} onChange={(e) => setCustomFields(e.target.value)} placeholder='{"budget":"10000"}' />
          </div>
        </details>
      </LeadSidebarPanel>

      <LeadSidebarPanel title="Actions" description="Fast links to related CRM areas.">
        <div className="grid gap-3">
          <LeadSidebarAction icon={Mail} title="Send email" description="Start a lead thread." onClick={onSendEmail} />
          <LeadSidebarAction as={Link} to={activityPath} icon={Clock3} title="Activities" description="Open lead activity log." />
          <LeadSidebarAction icon={Route} title="Pipeline" description="Return to pipeline board." onClick={() => navigate('/crm/pipeline')} />
        </div>
      </LeadSidebarPanel>

      <LeadSidebarPanel title="Activity" description="Lead activity and meetings stay visible.">
        <div className="grid gap-3">
          <LeadSidebarMiniTile icon={History} title="Timeline" value="Coming soon" />
          <LeadSidebarMiniTile icon={Video} title="Meetings" value="Schedule later" />
        </div>
      </LeadSidebarPanel>

      <LeadSidebarPanel title="Quick panels" description="Notes, emails, calls and tasks remain available.">
        <div className="grid gap-3">
          <LeadSidebarMiniTile icon={Sparkles} title="Tasks" value="Ready" />
          <LeadSidebarMiniTile icon={Mail} title="Emails" value="Coming soon" />
          <LeadSidebarMiniTile icon={Video} title="Calls" value="No logs yet" />
          <LeadSidebarMiniTile icon={Wand2} title="AI" value="Open AI tab" />
        </div>
      </LeadSidebarPanel>
    </div>
  )
})

function LeadSidebarPanel({ title, description, children }) {
  return (
    <section className="rounded-xl border border-white/75 bg-white/72 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/45">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      {children}
    </section>
  )
}

function LeadSidebarAction({ as: Component = 'button', icon: Icon, title, description, ...props }) {
  const commonClass = 'group flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-surface-border/80 bg-white/85 px-3 py-3 text-left shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50/60 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-800 dark:bg-gray-900/70 dark:hover:border-primary-800 dark:hover:bg-primary-950/30'
  return (
    <Component type={Component === 'button' ? 'button' : undefined} className={commonClass} {...props}>
      <span className="flex min-w-0 items-center gap-3">
        <span className="rounded-lg bg-primary-50 p-2 text-primary-700 ring-1 ring-primary-100 dark:bg-primary-950/60 dark:text-primary-200 dark:ring-primary-900/50">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{description}</span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600 dark:text-gray-500 dark:group-hover:text-primary-300" />
    </Component>
  )
}

function LeadSidebarMiniTile({ icon: Icon, title, value }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-surface-border/70 bg-white/80 p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900/65">
      <span className="rounded-lg bg-gray-50 p-2 text-gray-600 ring-1 ring-gray-100 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{value}</span>
      </span>
    </div>
  )
}

export const LeadActions = memo(function LeadActions() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm">
        <MessageSquare className="h-4 w-4" />
        Quick note
      </Button>
      <Button type="button" variant="secondary" size="sm">
        <Mail className="h-4 w-4" />
        Send email
      </Button>
      <Button type="button" variant="secondary" size="sm">
        <StickyNote className="h-4 w-4" />
        Add note
      </Button>
      <Button type="button" variant="secondary" size="sm" disabled>
        <Wand2 className="h-4 w-4" />
        AI disabled
      </Button>
    </div>
  )
})

export const LeadAccessDeniedState = memo(function LeadAccessDeniedState({ onBack }) {
  return (
    <CRMSection title="Lead workspace" description="Access is controlled by the Sales module permission.">
      <EmptyState
        icon={Lock}
        title="Access denied"
        description="You do not have access to this lead workspace. Ask an administrator to enable the sales module for your account."
        action={(
          <Button type="button" variant="primary" onClick={onBack}>
            Back to pipeline
          </Button>
        )}
      />
    </CRMSection>
  )
})

export const LeadLoadingState = memo(function LeadLoadingState() {
  return (
    <CRMSection title="Loading lead" description="Fetching the selected lead from the Sales domain.">
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
        <div className="h-12 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="h-80 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
            <div className="h-80 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
          </div>
          <div className="space-y-4">
            <div className="h-48 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
            <div className="h-48 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
            <div className="h-48 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
      </div>
    </CRMSection>
  )
})

export const LeadTimelineTab = memo(function LeadTimelineTab() {
  return (
    <CRMSection title="Timeline" description="Timeline is reserved for a future activity stream.">
      <CRMEmptyState
        icon={History}
        title="Timeline coming soon"
        description="Lead activity will appear here once the CRM timeline workspace is introduced."
      />
    </CRMSection>
  )
})

export const LeadMeetingsTab = memo(function LeadMeetingsTab() {
  return (
    <CRMSection title="Meetings" description="Meeting coordination will be added later.">
      <CRMEmptyState
        icon={Video}
        title="Meetings coming soon"
        description="This section will host future meeting scheduling data."
      />
    </CRMSection>
  )
})

export const LeadTasksTab = memo(function LeadTasksTab() {
  return (
    <CRMSection title="Tasks" description="Lead-scoped task links will appear here.">
      <CRMEmptyState
        icon={Sparkles}
        title="Tasks ready"
        description="This tab is reserved for lead tasks without duplicating task records."
      />
    </CRMSection>
  )
})

export const LeadAttachmentsTab = memo(function LeadAttachmentsTab({ leadId, lead }) {
  return <LeadFilesTab leadId={leadId} lead={lead} />
})

export const LeadCallLogsTab = memo(function LeadCallLogsTab() {
  return (
    <CRMSection title="Call Logs" description="Call history will be surfaced here when telephony events are connected.">
      <CRMEmptyState
        icon={Video}
        title="No call logs yet"
        description="Incoming and outgoing call events will appear here."
      />
    </CRMSection>
  )
})

export const LeadEmailsTab = memo(function LeadEmailsTab() {
  return (
    <CRMSection title="Emails" description="Email threads are not implemented yet.">
      <CRMEmptyState
        icon={Mail}
        title="Emails coming soon"
        description="Unified email threads will appear here in a future sprint."
      />
    </CRMSection>
  )
})

export const LeadProposalTab = memo(function LeadProposalTab({
  deal = null,
  proposals = [],
  form,
  onChange,
  onSubmit,
  onArchive,
  isSaving = false,
  isLoading = false,
  errorMessage = '',
  onRetry,
}) {
  if (isLoading) {
    return (
      <CRMSection title="Proposal" description="Loading the deal and proposal history.">
        <div className="space-y-3">
          {[1, 2].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </CRMSection>
    )
  }

  if (errorMessage) {
    return (
      <CRMSection title="Proposal" description="Could not load deal data.">
        <EmptyState
          icon={Wand2}
          title="Proposal unavailable"
          description={errorMessage}
          action={(
            <Button type="button" variant="primary" onClick={onRetry}>
              Retry
            </Button>
          )}
        />
      </CRMSection>
    )
  }

  return (
    <div className="space-y-6">
      <CRMSection title="Deal" description="One deal owns multiple proposal versions.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryChip label="Value" value={formatCurrency(deal?.value ?? 0)} />
          <SummaryChip label="Stage" value={deal?.stage || '-'} />
          <SummaryChip label="Probability" value={`${deal?.probability ?? 0}%`} />
          <SummaryChip label="Expected close" value={formatShortDate(deal?.expected_close_date)} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Decision maker</p>
            <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{deal?.decision_maker || 'Not set'}</p>
          </article>
          <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Competitors</p>
            <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              {Array.isArray(deal?.competitors) && deal.competitors.length ? deal.competitors.join(', ') : 'None recorded'}
            </p>
          </article>
        </div>
      </CRMSection>

      <CRMSection title="Proposal composer" description="Create or update proposal versions without leaving the lead workspace.">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Title</span>
            <input className={inputClassName} value={form.title} onChange={(event) => onChange('title', event.target.value)} placeholder="Proposal v1" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Status</span>
            <select className={inputClassName} value={form.status} onChange={(event) => onChange('status', event.target.value)}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Deal value</span>
            <input className={inputClassName} type="number" value={form.deal_value} onChange={(event) => onChange('deal_value', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Probability %</span>
            <input className={inputClassName} type="number" min="0" max="100" value={form.probability} onChange={(event) => onChange('probability', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Expected close date</span>
            <input className={inputClassName} type="datetime-local" value={form.expected_close_date} onChange={(event) => onChange('expected_close_date', event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Decision maker</span>
            <input className={inputClassName} value={form.decision_maker} onChange={(event) => onChange('decision_maker', event.target.value)} />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Competitors</span>
            <input className={inputClassName} value={form.competitors} onChange={(event) => onChange('competitors', event.target.value)} placeholder="Comma separated competitors" />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Negotiation notes</span>
            <textarea className={`${inputClassName} min-h-28`} value={form.negotiation_notes} onChange={(event) => onChange('negotiation_notes', event.target.value)} />
          </label>
          <label className="block lg:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Summary</span>
            <textarea className={`${inputClassName} min-h-24`} value={form.summary} onChange={(event) => onChange('summary', event.target.value)} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {proposals[0] && !proposals[0].archived ? (
            <Button type="button" variant="secondary" onClick={() => onArchive?.(proposals[0])}>Archive latest</Button>
          ) : null}
          <Button type="button" variant="primary" onClick={onSubmit} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save proposal version'}
          </Button>
        </div>
      </CRMSection>

      <CRMSection title="Proposal versions" description="Version history for the current deal.">
        <div className="space-y-3">
          {proposals.length ? proposals.map((proposal) => (
            <article key={proposal.id} className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{proposal.title}</h3>
                    <Badge label={`v${proposal.version}`} colorKey="draft" />
                    <Badge label={proposal.status} colorKey={proposal.status === 'accepted' ? 'completed' : proposal.status === 'rejected' ? 'critical' : 'scheduled'} />
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{proposal.summary || 'No summary provided.'}</p>
                </div>
                <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                  <p>Created {formatShortDate(proposal.created_at)}</p>
                  <p className="mt-1">{proposal.archived ? 'Archived' : 'Active'}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge label={`Value ${formatCurrency(proposal.deal_value || 0)}`} colorKey="draft" />
                <Badge label={`Close ${formatShortDate(proposal.expected_close_date)}`} colorKey="draft" />
                <Badge label={`Probability ${proposal.probability ?? 0}%`} colorKey="draft" />
              </div>
            </article>
          )) : (
            <CRMEmptyState
              icon={Wand2}
              title="No proposals yet"
              description="Create the first proposal version for this deal."
            />
          )}
        </div>
      </CRMSection>
    </div>
  )
})

export const LeadHistoryTab = memo(function LeadHistoryTab({
  items = [],
  isLoading = false,
  errorMessage = '',
  onRetry,
}) {
  if (isLoading) {
    return (
      <CRMSection title="History" description="Loading the pipeline history.">
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </CRMSection>
    )
  }

  if (errorMessage) {
    return (
      <CRMSection title="History" description="Could not load the pipeline history.">
        <EmptyState
          icon={History}
          title="History unavailable"
          description={errorMessage}
          action={(
            <Button type="button" variant="primary" onClick={onRetry}>
              Retry
            </Button>
          )}
        />
      </CRMSection>
    )
  }

  if (!items.length) {
    return (
      <CRMSection title="History" description="Historical audit views use the pipeline history endpoint.">
        <CRMEmptyState
          icon={History}
          title="No history yet"
          description="Stage transitions and other pipeline changes will appear here over time."
        />
      </CRMSection>
    )
  }

  return (
    <CRMSection title="History" description="Read-only stage transition history from the Sales domain.">
      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {item.previous_stage ? `${item.previous_stage} → ${item.new_stage}` : item.new_stage}
                  </h3>
                  <Badge label="History" colorKey="draft" />
                </div>
                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {item.reason || 'Stage transition recorded.'}
                </p>
              </div>
              <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                <p>{item.user_name || 'System'}</p>
                <p className="mt-1">{formatShortDate(item.timestamp)}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge label={`Days in previous stage: ${item.days_in_previous_stage ?? 0}`} colorKey="draft" />
              {item.previous_stage ? <Badge label={`From: ${item.previous_stage}`} colorKey="draft" /> : null}
              {item.new_stage ? <Badge label={`To: ${item.new_stage}`} colorKey="draft" /> : null}
            </div>
          </article>
        ))}
      </div>
    </CRMSection>
  )
})

export const LeadAITab = memo(function LeadAITab() {
  return (
    <CRMSection title="AI" description="AI Sales is available from the lead workspace.">
      <CRMEmptyState
        icon={Sparkles}
        title="Open the AI Sales tab"
        description="Use the lead workspace AI tab to generate communication, approve drafts, and send through the notification service."
      />
    </CRMSection>
  )
})

function SummaryChip({ label, value, compact = false }) {
  return (
    <article className={`rounded-xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${compact ? 'p-3' : 'p-5'}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`${compact ? 'mt-1 text-sm' : 'mt-2 text-base'} font-semibold text-gray-900 dark:text-gray-100`}>{value}</p>
    </article>
  )
}
