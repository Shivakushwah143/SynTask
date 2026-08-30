import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Activity, Building2, CalendarDays, Clock3, DollarSign, ExternalLink, FileText, FolderKanban, Mail, Phone, Users } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { clientsAPI } from '../api/clients'
import { crmApi } from '../api/crm'
import { meetingsApi } from '../api/meetings'
import { projectsApi } from '../api/projects'
import { tasksAPI } from '../api/tasks'
import { Button, EmptyState, Modal, Skeleton } from '../components/ui'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../components/crm'
import { formatCurrency } from './crm/pipeline/utils'
import { toFormData } from './phase4Utils'
import { onboardingBlockerDestination } from './clientOnboardingNavigation'
import { timeService } from '@/services/timeService'

const TAB_KEY = 'tab'
const ONBOARDING_TAB_KEY = 'onboardingTab'
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'details', label: 'Details' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'services', label: 'Services' },
  { key: 'deliverables', label: 'Deliverables' },
  { key: 'communication', label: 'Communication' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'projects', label: 'Projects' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'documents', label: 'Files/Documents' },
  { key: 'invoices', label: 'Finance' },
  { key: 'timeline', label: 'Activity' },
]

const CONTACT_ROLE_OPTIONS = ['Primary Contact', 'Decision Maker', 'Finance Contact', 'Project Contact', 'Technical Contact', 'Approver']
const DELIVERABLE_STATUSES = ['planned', 'in_production', 'internal_review', 'client_review', 'revision_required', 'approved', 'delivered']
const ACTIVITY_FILTERS = ['all', 'communication', 'meetings', 'work', 'files', 'finance']
const RENEWAL_STATUSES = ['upcoming', 'discussion_started', 'terms_sent', 'renewed', 'renewal_failed', 'churned']
const CHURN_REASONS = ['Price', 'Budget', 'Poor Service', 'Delivery Delay', 'Communication Issue', 'Competitor', 'No Longer Needed', 'Business Closed', 'Other']
const HEALTH_TONES = {
  healthy: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200',
  attention_needed: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
  at_risk: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200',
  critical: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200',
}

function formatDate(value) {
  if (!value) return 'N/A'
  const parsed = timeService.instant(value)
  if (Number.isNaN(parsed.getTime())) return 'N/A'
  return format(parsed, 'MMM d, yyyy')
}

function formatDateTime(value) {
  if (!value) return 'N/A'
  const parsed = timeService.instant(value)
  if (Number.isNaN(parsed.getTime())) return 'N/A'
  return format(parsed, 'MMM d, yyyy h:mm a')
}

function clientFileUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  const baseUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000'
  return `${baseUrl}${url}`
}

function apiErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  return detail?.message || fallback
}

function projectSeed(client) {
  const source = client?.company_name || client?.name || 'Client Project'
  const key = source.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 12).toUpperCase() || 'CLIENT'
  const suffix = String(Date.now()).slice(-4)
  return {
    name: `${source} Onboarding Project`,
    key: `${key}-${suffix}`,
    project_id: `${key}-${suffix}`,
  }
}

const CLIENT_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'active', label: 'Active' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'renewal_due', label: 'Renewal Due' },
  { value: 'churned', label: 'Churned' },
  { value: 'archived', label: 'Archived' },
]

const ONBOARDING_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'documents', label: 'Documents' },
  { key: 'assets-access', label: 'Assets & Access' },
  { key: 'project-team', label: 'Project & Team' },
  { key: 'kickoff', label: 'Kickoff' },
  { key: 'onboarding-document', label: 'Onboarding Document' },
]

function formatClientType(value) {
  if (value === 'monthly') return 'Monthly'
  if (value === 'one_time') return 'One Time'
  return 'N/A'
}

function clientStatusClass(status) {
  if (status === 'new') return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300'
  if (status === 'onboarding') return 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300'
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300'
  if (status === 'at_risk') return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/50 dark:text-orange-300'
  if (status === 'on_hold') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300'
  if (status === 'renewal_due') return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/50 dark:text-violet-300'
  if (status === 'churned') return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300'
  if (status === 'archived') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300'
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300'
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value || 0)
    if (number > 0) return number
  }
  return 0
}

function projectBoardId(project) {
  return project?.id || project?.project_id || project?.key
}

function WorkspaceTabs({ activeTab, onTabChange, counts = {} }) {
  return (
    <nav aria-label="Client workspace sections" className="overflow-x-auto rounded-2xl border border-surface-border/80 bg-white/90 p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900/85">
      <div className="flex min-w-max items-center gap-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          const count = counts[tab.key]
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange?.(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
              }`}
            >
              {tab.label}
              {typeof count === 'number' ? (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-white/80 text-primary-700 dark:bg-gray-950/60 dark:text-primary-200' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300'}`}>
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function statusText(value) {
  return String(value || 'missing').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function OnboardingProgress({ onboarding }) {
  const percent = Number(onboarding?.progress_percent || 0)
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/25">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-700 dark:text-indigo-300">Onboarding</p>
          <h3 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
            {onboarding?.required_completed || 0}/{onboarding?.required_total || 0} ready, {percent}%
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{onboarding?.next_action || 'Ready for next step'}</p>
        </div>
        <div className="h-16 w-16 rounded-full border-4 border-white bg-white text-center text-sm font-bold leading-[3.5rem] text-indigo-700 shadow-sm dark:border-gray-900 dark:bg-gray-900 dark:text-indigo-300">
          {percent}%
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-white dark:bg-gray-900">
        <div className="h-2 rounded-full bg-indigo-600" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  )
}

function OnboardingItemCard({ item, onOpenTab }) {
  const complete = Number(item.completion_percent || 0) >= 100
  return (
    <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.required ? 'Required' : 'Optional'} · {statusText(item.status)}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${complete ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
          {item.completion_percent || 0}%
        </span>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
        <div className={`h-1.5 rounded-full ${complete ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, Math.max(0, Number(item.completion_percent || 0)))}%` }} />
      </div>
      {!complete ? (
        <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={() => onOpenTab?.(item.tab)}>
          {item.action_label || 'Open'}
        </Button>
      ) : null}
    </article>
  )
}

function OnboardingWorkspace({ onboarding, activeTab, onTabChange, client, projects, contacts, meetings, documents, onSaveClient, onSaveOnboarding, onSaveAssetsAccess, onSetPrimaryContact, onCreateContact, onCreateProject, onCreateMeeting, onGenerateDocument, saving, creatingContact, creatingProject, creatingMeeting, generatingDocument }) {
  const visibleItems = activeTab === 'overview'
    ? onboarding?.items || []
    : (onboarding?.items || []).filter((item) => item.tab === activeTab)
  const onboardingDocument = documents.find((item) => item.type === 'onboarding_document' || item.category === 'onboarding_document')
  const onboardingData = client?.lifecycle_metadata?.onboarding || {}
  const requirements = onboardingData.requirements || {}
  const commercial = onboardingData.commercial || {}
  const assets = onboardingData.assets || []
  const access = onboardingData.access || []
  const primaryContact = contacts.find((contact) => contact.is_primary_contact)
  const [showContactForm, setShowContactForm] = useState(!contacts.length)
  const projectDefaults = projectSeed(client)
  const tomorrow = timeService.toUtcISOString(timeService.addDays(timeService.now(), 1)).slice(0, 10)

  return (
    <CRMSection title="Onboarding" description="Complete the required layers while keeping existing CRM, delivery, and meeting records as the source of truth.">
      <div className="mb-5 flex gap-2 overflow-x-auto border-b border-gray-200 pb-2 dark:border-gray-800">
        {ONBOARDING_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${activeTab === tab.key ? 'bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'overview' ? <OnboardingProgress onboarding={onboarding} /> : null}
      {activeTab === 'commercial' ? (
        <form className="mt-5 grid gap-4 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:grid-cols-2" onSubmit={(event) => {
          event.preventDefault()
          onSaveClient({
            budget: event.currentTarget.elements.budget.value,
            client_type: event.currentTarget.elements.client_type.value,
            start_date: event.currentTarget.elements.start_date.value,
          })
          onSaveOnboarding({ commercial: {
            deal_value: event.currentTarget.elements.budget.value,
            billing_frequency: event.currentTarget.elements.client_type.value,
            payment_terms: event.currentTarget.elements.payment_terms.value,
            engagement_start_date: event.currentTarget.elements.start_date.value,
            billing_contact: event.currentTarget.elements.billing_contact.value,
          } })
        }}>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Contract / deal value<input name="budget" type="number" step="0.01" defaultValue={client?.budget || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Billing frequency<select name="client_type" defaultValue={client?.client_type || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">Select</option><option value="monthly">Monthly</option><option value="one_time">One Time</option></select></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Start date<input name="start_date" type="date" defaultValue={client?.start_date ? String(client.start_date).slice(0, 10) : ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Payment terms<input name="payment_terms" defaultValue={commercial.payment_terms || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 md:col-span-2">Billing contact / details<input name="billing_contact" defaultValue={commercial.billing_contact || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <div className="flex items-end"><Button type="submit" loading={saving} loadingText="Saving">Save Commercial</Button></div>
        </form>
      ) : null}
      {activeTab === 'requirements' ? (
        <form className="mt-5 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900" onSubmit={(event) => {
          event.preventDefault()
          onSaveOnboarding({ requirements: Object.fromEntries(new FormData(event.currentTarget).entries()) })
        }}>
          {['business_objective', 'scope', 'expected_deliverables', 'target_audience', 'important_deadlines', 'competitors_references', 'preferences', 'special_requirements', 'client_facing_notes'].map((field) => (
            <label key={field} className="mb-3 block text-sm font-medium text-gray-700 dark:text-gray-200">{field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}<textarea name={field} rows={2} defaultValue={requirements[field] || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          ))}
          <Button type="submit" className="mt-3" loading={saving} loadingText="Saving">Save Requirements</Button>
        </form>
      ) : null}
      {activeTab === 'contacts' ? (
        <div className="mt-5 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Primary contact</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{primaryContact ? `${primaryContact.full_name} · ${primaryContact.designation || 'No designation'} · ${primaryContact.email || 'No email'} · ${primaryContact.phone || 'No phone'}` : `${contacts.length} CRM contact(s) linked.`}</p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => setShowContactForm((value) => !value)}>{showContactForm ? 'Select Existing' : 'Add Contact'}</Button>
          </div>
          {!showContactForm ? (
            <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => {
              event.preventDefault()
              onSetPrimaryContact(event.currentTarget.elements.contact_id.value)
            }}>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200 md:col-span-2">Select existing CRM contact<select name="contact_id" defaultValue={primaryContact?.id || ''} required className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">Select contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name} · {contact.designation || 'No designation'} · {contact.email || 'No email'} · {contact.phone || 'No phone'}</option>)}</select></label>
              <div className="flex items-end"><Button type="submit" loading={saving} loadingText="Saving">Save Primary Contact</Button></div>
            </form>
          ) : (
            <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(event) => {
              event.preventDefault()
              const form = event.currentTarget
              onCreateContact({
                first_name: form.elements.first_name.value,
                last_name: form.elements.last_name.value,
                designation: form.elements.designation.value,
                email: form.elements.email.value || null,
                country_code: form.elements.country_code.value || '+91',
                phone: form.elements.phone.value,
                crm_company_id: client?.crm_company_id,
                is_primary_contact: true,
              })
            }}>
              {!client?.crm_company_id ? <p className="text-sm font-medium text-amber-700 dark:text-amber-300 md:col-span-2">Link this client to a CRM Company before adding CRM contacts.</p> : null}
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">First name<input name="first_name" required disabled={!client?.crm_company_id} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Last name<input name="last_name" required disabled={!client?.crm_company_id} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Designation<input name="designation" disabled={!client?.crm_company_id} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Email<input name="email" type="email" disabled={!client?.crm_company_id} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Country code<input name="country_code" defaultValue="+91" required disabled={!client?.crm_company_id} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Phone<input name="phone" required disabled={!client?.crm_company_id} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
              <div className="md:col-span-2"><Button type="submit" disabled={!client?.crm_company_id} loading={creatingContact} loadingText="Creating">Create & Mark Primary</Button></div>
            </form>
          )}
        </div>
      ) : null}
      {activeTab === 'assets-access' ? (
        <form className="mt-5 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900" onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const row = (prefix) => [0, 1, 2, 3].map((index) => ({
            name: form.elements[`${prefix}_name_${index}`]?.value,
            status: form.elements[`${prefix}_status_${index}`]?.value,
            reference: form.elements[`${prefix}_reference_${index}`]?.value,
            file: form.elements[`${prefix}_file_${index}`]?.files?.[0],
          })).filter((item) => item.name)
          onSaveAssetsAccess({ assets: row('asset'), access: row('access') })
        }}>
          <div className="border-b border-gray-100 pb-4 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Collect launch materials and access</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Track what the client must provide before work starts. Use references for uploaded file names, ticket links, or secure vault/integration references only.</p>
          </div>

          <div className="mt-5 space-y-5">
            <section>
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Brand assets to collect</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Mark each asset as requested, received, or verified after checking it is usable.</p>
              </div>
              <div className="space-y-3">
                {['Logo', 'Brand Guidelines', 'Images / Media', 'Reference Material'].map((name, index) => (
                  <div key={name} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                    <div className="grid gap-3 md:grid-cols-[1.1fr_160px_1.2fr_1.2fr]">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Asset needed<input name={`asset_name_${index}`} defaultValue={assets[index]?.name || name} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Stage<select name={`asset_status_${index}`} defaultValue={assets[index]?.status || 'missing'} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="missing">Missing</option><option value="requested">Requested</option><option value="received">Received</option><option value="verified">Verified</option></select></label>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Upload file<input name={`asset_file_${index}`} type="file" className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100 dark:text-gray-300 dark:file:bg-primary-950 dark:file:text-primary-200" /></label>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Uploaded file / reference<input name={`asset_reference_${index}`} defaultValue={assets[index]?.reference || ''} placeholder="Auto-filled after upload" className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
                    </div>
                    {assets[index]?.file_url ? <a className="mt-2 inline-flex text-xs font-semibold text-primary-700 hover:underline dark:text-primary-300" href={clientFileUrl(assets[index].file_url)} target="_blank" rel="noopener noreferrer">Open uploaded file</a> : null}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Access to request</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Record only the access status and safe reference. Do not paste passwords, tokens, or recovery codes here.</p>
              </div>
              <div className="space-y-3">
                {['Website', 'Instagram', 'Facebook', 'Google Business'].map((name, index) => (
                  <div key={name} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
                    <div className="grid gap-3 md:grid-cols-[1.2fr_180px_1.4fr]">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Access needed<input name={`access_name_${index}`} defaultValue={access[index]?.name || name} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Stage<select name={`access_status_${index}`} defaultValue={access[index]?.status || 'missing'} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="missing">Missing</option><option value="requested">Requested</option><option value="received">Received</option><option value="verified">Verified</option></select></label>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Safe reference<input name={`access_reference_${index}`} defaultValue={access[index]?.reference || ''} placeholder="Example: vault item or invite sent" className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-5 flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
            <Button type="submit" loading={saving} loadingText="Saving">Save Asset & Access Status</Button>
          </div>
        </form>
      ) : null}
      {activeTab === 'project-team' ? (
        <>
          <form className="mt-5 grid gap-4 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:grid-cols-2" onSubmit={(event) => {
            event.preventDefault()
            onCreateProject({
              name: event.currentTarget.elements.project_name.value,
              key: event.currentTarget.elements.project_key.value,
              project_id: event.currentTarget.elements.project_id.value,
              description: event.currentTarget.elements.description.value,
              start_date: event.currentTarget.elements.start_date.value,
              delivery_date: event.currentTarget.elements.delivery_date.value,
              client_id: client?.id,
            })
          }}>
            <div className="md:col-span-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Create linked project</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{projects.length} project(s) linked.</p>
            </div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Project name<input name="project_name" defaultValue={projectDefaults.name} required className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Project key<input name="project_key" defaultValue={projectDefaults.key} required className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm uppercase dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Project ID<input name="project_id" defaultValue={projectDefaults.project_id} required className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm uppercase dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Start date<input name="start_date" type="date" defaultValue={client?.start_date ? String(client.start_date).slice(0, 10) : ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Delivery date<input name="delivery_date" type="date" defaultValue={client?.delivery_date ? String(client.delivery_date).slice(0, 10) : ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200 md:col-span-2">Description<textarea name="description" rows={3} defaultValue={`Onboarding delivery for ${client?.company_name || client?.name || 'client'}.`} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <div className="md:col-span-2"><Button type="submit" loading={creatingProject} loadingText="Creating">Create Project</Button></div>
          </form>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <OnboardingItemCard item={{ label: 'Projects', status: projects.length ? 'created' : 'not_started', completion_percent: projects.length ? 100 : 0, required: true, action_label: 'Open Projects', tab: 'project-team' }} onOpenTab={() => onTabChange('project-team')} />
            <OnboardingItemCard item={{ label: 'Team / owner', status: client?.assigned_to || client?.account_owner_id ? 'team_assigned' : 'missing', completion_percent: client?.assigned_to || client?.account_owner_id ? 100 : 0, required: true, action_label: 'Assign Team', tab: 'project-team' }} onOpenTab={() => onTabChange('project-team')} />
          </div>
          <div className="mt-5 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Start readiness</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Confirm only after the project, team, kickoff, commercial, contact, and requirements are operationally ready.</p>
            <Button type="button" className="mt-3" loading={saving} loadingText="Saving" onClick={() => onSaveOnboarding({ start_readiness: { ready: true } })}>Confirm Ready</Button>
          </div>
        </>
      ) : null}
      {activeTab === 'kickoff' ? (
        <form className="mt-5 grid gap-4 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:grid-cols-2" onSubmit={(event) => {
          event.preventDefault()
          onCreateMeeting({
            title: event.currentTarget.elements.title.value,
            description: event.currentTarget.elements.description.value,
            meeting_date: event.currentTarget.elements.meeting_date.value,
            meeting_time: event.currentTarget.elements.meeting_time.value,
            duration: event.currentTarget.elements.duration.value,
          })
        }}>
          <div className="md:col-span-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Kickoff meeting</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{meetings[0]?.meeting_date ? `Scheduled ${formatDateTime(meetings[0].meeting_date)}` : 'Schedule kickoff to complete this requirement.'}</p>
          </div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Title<input name="title" defaultValue={`Kickoff - ${client?.company_name || client?.name || 'Client'}`} required className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Date<input name="meeting_date" type="date" defaultValue={tomorrow} required className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Time<input name="meeting_time" type="time" defaultValue="10:00" required className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Duration<input name="duration" type="number" min="1" max="60" defaultValue="30" required className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 md:col-span-2">Description<textarea name="description" rows={3} defaultValue={`Kickoff meeting for client ${client?.id}.`} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <div className="md:col-span-2"><Button type="submit" loading={creatingMeeting} loadingText="Scheduling">Schedule Kickoff</Button></div>
        </form>
      ) : null}
      {activeTab === 'onboarding-document' ? (
        <div className="mt-5 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Client-facing onboarding document</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Generated from verified onboarding data. Sensitive credentials and internal-only fields excluded.</p>
            </div>
            <Button type="button" onClick={onGenerateDocument} loading={generatingDocument} loadingText="Generating">{onboardingDocument ? 'Regenerate PDF' : 'Generate PDF'}</Button>
          </div>
          {onboardingDocument?.freshness === 'stale' ? <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-300">Update Available / Regeneration Required</p> : null}
          {onboardingDocument?.url ? (
            <a className="mt-4 inline-flex text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300" href={clientFileUrl(onboardingDocument.url)} target="_blank" rel="noopener noreferrer">Preview / Download</a>
          ) : null}
        </div>
      ) : null}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {visibleItems.map((item) => {
          return (
            <article key={item.key} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.required ? 'Required' : 'Optional'} · {statusText(item.status)}</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-200">{item.completion_percent || 0}%</span>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-1.5 rounded-full bg-primary-500" style={{ width: `${Math.min(100, Math.max(0, Number(item.completion_percent || 0)))}%` }} /></div>
              {item.linked_entity_id ? <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Linked {item.linked_entity_type}: {item.linked_entity_id}</p> : null}
              <Button type="button" size="sm" variant="secondary" className="mt-4" onClick={() => onTabChange(onboardingBlockerDestination(item))}>{item.action_label || 'Open linked records'}</Button>
            </article>
          )
        })}
      </div>
      {!visibleItems.length ? <CRMEmptyState title="No onboarding items" description="This layer has no configured items yet." /> : null}
    </CRMSection>
  )
}

export default function ClientWorkspacePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { clientId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [transitionBlocker, setTransitionBlocker] = useState(null)

  const activeTab = searchParams.get(TAB_KEY) || 'overview'
  const activeOnboardingTab = searchParams.get(ONBOARDING_TAB_KEY) || 'overview'
  const [editingContactId, setEditingContactId] = useState(null)
  const [editingServiceId, setEditingServiceId] = useState(null)
  const [deliverableFilters, setDeliverableFilters] = useState({ project: '', service: '', status: '', approval: '', due: '' })
  const [activityFilter, setActivityFilter] = useState('all')
  const [activityLimit, setActivityLimit] = useState(25)
  const [communicationFilter, setCommunicationFilter] = useState('all')
  const [fileFilter, setFileFilter] = useState('all')

  const workspaceQuery = useQuery(
    ['client-workspace', clientId],
    () => clientsAPI.getWorkspace(clientId),
    {
      enabled: Boolean(clientId),
      retry: false,
      staleTime: 60 * 1000,
    }
  )

  const workspace = workspaceQuery.data || {}
  const client = workspace.client || null
  const projects = useMemo(() => (Array.isArray(workspace.projects) ? workspace.projects : []), [workspace.projects])
  const tasks = useMemo(() => (Array.isArray(workspace.tasks) ? workspace.tasks : []), [workspace.tasks])
  const leads = useMemo(() => (Array.isArray(workspace.leads) ? workspace.leads : []), [workspace.leads])
  const contacts = useMemo(() => (Array.isArray(workspace.contacts) ? workspace.contacts : []), [workspace.contacts])
  const services = useMemo(() => (Array.isArray(workspace.services) ? workspace.services : []), [workspace.services])
  const deliverables = useMemo(() => (Array.isArray(workspace.deliverables) ? workspace.deliverables : []), [workspace.deliverables])
  const documents = useMemo(() => (Array.isArray(client?.documents) ? client.documents : []), [client?.documents])
  const communication = useMemo(() => (Array.isArray(workspace.communication) ? workspace.communication : []), [workspace.communication])
  const internalNotes = useMemo(() => (Array.isArray(workspace.internal_notes) ? workspace.internal_notes : []), [workspace.internal_notes])
  const files = useMemo(() => (Array.isArray(workspace.files) ? workspace.files : documents), [workspace.files, documents])
  const invoices = useMemo(() => (Array.isArray(workspace.invoices) ? workspace.invoices : []), [workspace.invoices])
  const finance = workspace.finance || {}
  const renewal = workspace.renewal || client?.lifecycle_metadata?.renewal || {}
  const churn = workspace.churn || client?.lifecycle_metadata?.churn || {}
  const health = workspace.health || client?.lifecycle_metadata?.client_health || {}
  const nextAction = workspace.next_action || client?.lifecycle_metadata?.client_next_action || health.next_action || {}
  const activeEscalation = workspace.active_escalation || client?.lifecycle_metadata?.client_health_escalation || health.active_escalation || null
  const meetings = useMemo(() => (Array.isArray(workspace.meetings) ? workspace.meetings : []), [workspace.meetings])
  const onboarding = workspace.onboarding || null
  const onboardingItems = useMemo(() => (Array.isArray(onboarding?.items) ? onboarding.items : []), [onboarding?.items])
  const timeline = workspace.timeline || {}
  const activityFeed = workspace.activity || { items: [] }
  const summary = workspace.summary || {}
  const errorStatus = workspaceQuery.error?.response?.status

  const activityQuery = useQuery(
    ['client-activity', clientId, activityFilter, activityLimit],
    () => clientsAPI.getActivity(clientId, { category: activityFilter, limit: activityLimit }),
    {
      enabled: Boolean(clientId) && activeTab === 'timeline',
      keepPreviousData: true,
      staleTime: 60 * 1000,
    }
  )

  const statusMutation = useMutation(
    (nextStatus) => clientsAPI.updateClientStatus(clientId, nextStatus),
    {
      onSuccess: () => {
        setTransitionBlocker(null)
        toast.success('Client status updated')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries('clients')
      },
      onError: (error) => {
        const detail = error?.response?.data?.detail
        if (detail?.code === 'CLIENT_TRANSITION_BLOCKED') {
          setTransitionBlocker(detail)
          return
        }
        toast.error(apiErrorMessage(error, 'Failed to update client status'))
      },
    }
  )

  const onboardingSaveMutation = useMutation(
    (values) => clientsAPI.saveOnboardingData(clientId, values),
    {
      onSuccess: () => {
        toast.success('Onboarding data saved')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries('clients')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to save onboarding data')),
    }
  )

  const structuredOnboardingMutation = useMutation(
    (values) => clientsAPI.updateOnboardingData(clientId, values),
    {
      onSuccess: () => {
        toast.success('Onboarding data saved')
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to save onboarding data')),
    }
  )

  const assetsAccessMutation = useMutation(
    async ({ assets: assetRows = [], access: accessRows = [] }) => {
      const uploadedAssets = []
      for (const asset of assetRows) {
        const { file, ...rest } = asset
        if (file) {
          const result = await clientsAPI.uploadDocument(clientId, file, `Brand Asset - ${rest.name}`)
          const document = result?.document || {}
          uploadedAssets.push({
            ...rest,
            status: rest.status === 'missing' || rest.status === 'requested' ? 'received' : rest.status,
            reference: document.name || document.original_name || rest.reference,
            file_url: document.url,
            file_name: document.original_name || document.name,
          })
        } else {
          uploadedAssets.push(rest)
        }
      }
      return clientsAPI.updateOnboardingData(clientId, { assets: uploadedAssets, access: accessRows.map(({ file, ...rest }) => rest) })
    },
    {
      onSuccess: () => {
        toast.success('Assets and access updated')
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to save assets and access')),
    }
  )

  const primaryContactMutation = useMutation(
    (contactId) => clientsAPI.setPrimaryContact(clientId, contactId),
    {
      onSuccess: () => {
        toast.success('Primary contact updated')
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update primary contact')),
    }
  )

  const createContactMutation = useMutation(
    (payload) => crmApi.createContact(payload),
    {
      onSuccess: () => {
        toast.success('Primary contact created')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries('crm-contacts')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to create primary contact')),
    }
  )

  const updateContactMutation = useMutation(
    ({ contactId, payload }) => crmApi.updateContact(contactId, payload),
    {
      onSuccess: () => {
        toast.success('Contact updated')
        setEditingContactId(null)
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries('crm-contacts')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update contact')),
    }
  )

  const contactRolesMutation = useMutation(
    ({ contactId, roles }) => clientsAPI.updateContactRoles(clientId, contactId, roles),
    {
      onSuccess: () => {
        toast.success('Contact roles updated')
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update contact roles')),
    }
  )

  const profileMutation = useMutation(
    ({ clientValues, profileValues }) => Promise.all([
      clientsAPI.updateClient(clientId, toFormData(clientValues)),
      clientsAPI.updateProfile(clientId, profileValues),
    ]),
    {
      onSuccess: () => {
        toast.success('Client details saved')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries('clients')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to save client details')),
    }
  )

  const createProjectMutation = useMutation(
    (values) => projectsApi.createProject(values),
    {
      onSuccess: () => {
        toast.success('Project created')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries('projects')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to create project')),
    }
  )

  const serviceMutation = useMutation(
    ({ serviceId, payload }) => serviceId ? clientsAPI.updateService(clientId, serviceId, payload) : clientsAPI.createService(clientId, payload),
    {
      onSuccess: () => {
        toast.success('Client service saved')
        setEditingServiceId(null)
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to save client service')),
    }
  )

  const serviceStatusMutation = useMutation(
    ({ serviceId, action }) => clientsAPI.updateServiceStatus(clientId, serviceId, action),
    {
      onSuccess: () => {
        toast.success('Service status updated')
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update service status')),
    }
  )

  const serviceProjectMutation = useMutation(
    ({ serviceId, projectId }) => clientsAPI.linkServiceProject(clientId, serviceId, projectId),
    {
      onSuccess: () => {
        toast.success('Project linked to service')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries('projects')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to link project')),
    }
  )

  const serviceProjectUnlinkMutation = useMutation(
    ({ serviceId, projectId }) => clientsAPI.unlinkServiceProject(clientId, serviceId, projectId),
    {
      onSuccess: () => {
        toast.success('Project unlinked from service')
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Project cannot be unlinked')),
    }
  )

  const createServiceProjectMutation = useMutation(
    async ({ serviceId, values }) => {
      const response = await projectsApi.createProject(values)
      const projectId = response?.data?.id || response?.data?.project_id || response?.id || response?.project_id
      if (projectId) await clientsAPI.linkServiceProject(clientId, serviceId, projectId)
      return response
    },
    {
      onSuccess: () => {
        toast.success('Project created and linked')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries('projects')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to create service project')),
    }
  )

  const deliverableMutation = useMutation(
    (payload) => clientsAPI.createDeliverable(clientId, payload),
    {
      onSuccess: () => {
        toast.success('Deliverable created')
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to create deliverable')),
    }
  )

  const deliverableStatusMutation = useMutation(
    ({ deliverableId, nextStatus }) => clientsAPI.updateDeliverableStatus(clientId, deliverableId, nextStatus),
    {
      onSuccess: () => {
        toast.success('Deliverable status updated')
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update deliverable status')),
    }
  )

  const deliverableReviewMutation = useMutation(
    ({ deliverableId, action, payload }) => {
      if (action === 'approve') return clientsAPI.approveDeliverable(clientId, deliverableId, payload)
      if (action === 'revision') return clientsAPI.requestDeliverableRevision(clientId, deliverableId, payload)
      return clientsAPI.sendDeliverableReview(clientId, deliverableId, payload)
    },
    {
      onSuccess: () => {
        toast.success('Approval workflow updated')
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update approval workflow')),
    }
  )

  const deliverableTaskMutation = useMutation(
    async ({ deliverableId, taskPayload }) => {
      const result = await tasksAPI.createTask(taskPayload)
      const taskId = result?.task_id || result?.id || result?.task?.id
      if (taskId) await clientsAPI.linkDeliverableTasks(clientId, deliverableId, [taskId])
      return result
    },
    {
      onSuccess: () => {
        toast.success('Task created and linked')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries('tasks')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to create deliverable task')),
    }
  )

  const createMeetingMutation = useMutation(
    (values) => meetingsApi.create(toFormData(values)),
    {
      onSuccess: () => {
        toast.success('Kickoff meeting scheduled')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries('meetings')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to schedule kickoff meeting')),
    }
  )

  const completeMeetingMutation = useMutation(
    (meetingId) => meetingsApi.complete(meetingId),
    {
      onSuccess: () => {
        toast.success('Meeting completed')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries('meetings')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to complete meeting')),
    }
  )

  const renewalMutation = useMutation(
    ({ action, payload }) => {
      if (action === 'start') return clientsAPI.startRenewal(clientId, payload)
      if (action === 'renewed') return clientsAPI.markRenewed(clientId, payload)
      return clientsAPI.updateRenewal(clientId, payload)
    },
    {
      onSuccess: () => {
        toast.success('Renewal updated')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries(['client-activity', clientId])
        queryClient.invalidateQueries('clients')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update renewal')),
    }
  )

  const churnMutation = useMutation(
    (payload) => clientsAPI.markChurned(clientId, payload),
    {
      onSuccess: () => {
        toast.success('Client churned')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries(['client-activity', clientId])
        queryClient.invalidateQueries('clients')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to churn client')),
    }
  )

  const archiveMutation = useMutation(
    (payload) => clientsAPI.archiveClient(clientId, payload),
    {
      onSuccess: () => {
        toast.success('Client archived')
        queryClient.invalidateQueries(['client-workspace', clientId])
        queryClient.invalidateQueries(['client-activity', clientId])
        queryClient.invalidateQueries('clients')
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to archive client')),
    }
  )

  const nextActionMutation = useMutation(
    () => clientsAPI.updateNextActionStatus(clientId, { status: 'completed' }),
    {
      onSuccess: () => {
        toast.success('Next action completed')
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to update next action')),
    }
  )

  const onboardingDocumentMutation = useMutation(
    () => clientsAPI.generateOnboardingDocument(clientId),
    {
      onSuccess: () => {
        toast.success('Onboarding document generated')
        queryClient.invalidateQueries(['client-workspace', clientId])
      },
      onError: (error) => toast.error(apiErrorMessage(error, 'Failed to generate onboarding document')),
    }
  )

  const setTab = (tab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (tab && tab !== 'overview') next.set(TAB_KEY, tab)
      else next.delete(TAB_KEY)
      return next
    }, { replace: true })
  }

  const setOnboardingTab = (tab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set(TAB_KEY, 'onboarding')
      if (tab && tab !== 'overview') next.set(ONBOARDING_TAB_KEY, tab)
      else next.delete(ONBOARDING_TAB_KEY)
      return next
    }, { replace: true })
  }

  const totalProjects = projects.length || client?.project_ids?.length || 0
  const totalTasks = tasks.length || 0
  const totalLeads = leads.length || 0
  const totalContacts = contacts.length || 0
  const totalServices = services.length || 0
  const activeServices = services.filter((service) => service.status === 'active')
  const totalDeliverables = deliverables.length || 0
  const totalFiles = files.length || 0
  const totalInvoices = invoices.length || 0
  const outstandingAmount = finance.outstanding ?? summary.invoices?.outstanding_amount ?? invoices.reduce((sum, invoice) => sum + Number(invoice.outstanding_amount || 0), 0)
  const activityData = activityQuery.data || (activityFilter === 'all' ? activityFeed : { items: [], total: 0, has_more: false })
  const activityItems = Array.isArray(activityData.items) ? activityData.items : []
  const communicationChannels = ['all', ...Array.from(new Set(communication.map((item) => item.channel || item.type).filter(Boolean)))]
  const visibleCommunication = communication.filter((item) => communicationFilter === 'all' || (item.channel || item.type) === communicationFilter)
  const fileCategories = ['all', ...Array.from(new Set(files.map((item) => item.category || 'Other').filter(Boolean)))]
  const visibleFiles = files.filter((item) => fileFilter === 'all' || (item.category || 'Other') === fileFilter)
  const tabCounts = {
    overview: 4,
    details: 1,
    contacts: totalContacts,
    services: totalServices,
    deliverables: totalDeliverables,
    communication: communication.length,
    onboarding: onboardingItems.length,
    projects: totalProjects,
    tasks: totalTasks,
    leads: totalLeads,
    documents: totalFiles,
    invoices: totalInvoices,
    meetings: meetings.length,
    timeline: activityData.total || activityItems.length || (Array.isArray(timeline?.grouped_by_day) ? timeline.grouped_by_day.length : 0),
  }
  const transitionMissingFields = Array.isArray(transitionBlocker?.missing_fields) ? transitionBlocker.missing_fields : []
  const primaryContact = contacts.find((contact) => contact.is_primary_contact)
  const upcomingMeeting = meetings
    .filter((meeting) => meeting.meeting_date)
    .sort((a, b) => new Date(a.meeting_date) - new Date(b.meeting_date))[0]
  const serviceValue = summary.services?.total_value || services.reduce((sum, service) => sum + Number(service.pricing_value || 0), 0)
  const visibleDeliverables = deliverables.filter((item) => {
    const dueDate = item.due_date ? new Date(item.due_date) : null
    const isOverdue = dueDate && dueDate < new Date() && !['approved', 'delivered'].includes(item.status)
    return (!deliverableFilters.project || item.project_id === deliverableFilters.project)
      && (!deliverableFilters.service || item.service_id === deliverableFilters.service)
      && (!deliverableFilters.status || item.status === deliverableFilters.status)
      && (!deliverableFilters.approval || item.approval_status === deliverableFilters.approval)
      && (!deliverableFilters.due || (deliverableFilters.due === 'overdue' ? isOverdue : Boolean(dueDate)))
  })

  const handleDetailsSubmit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    profileMutation.mutate({
      clientValues: {
        name: data.get('name'),
        company_name: data.get('company_name'),
        account_owner_id: data.get('account_owner_id'),
        sales_owner_id: data.get('sales_owner_id'),
        client_type: data.get('client_type'),
        budget: data.get('budget'),
        start_date: data.get('start_date'),
        address: data.get('address'),
        city: data.get('city'),
        state: data.get('state'),
        country: data.get('country'),
        zip_code: data.get('zip_code'),
        industry: data.get('industry'),
      },
      profileValues: {
        commercial_summary: data.get('commercial_summary'),
        relationship_information: data.get('relationship_information'),
      },
    })
  }

  const handleContactSubmit = (event, contactId = null) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const payload = {
      first_name: data.get('first_name'),
      last_name: data.get('last_name'),
      email: data.get('email') || undefined,
      country_code: data.get('country_code') || '+91',
      phone: data.get('phone'),
      designation: data.get('designation') || undefined,
      crm_company_id: client?.crm_company_id,
      company_name: client?.company_name || client?.name,
    }
    if (contactId) {
      updateContactMutation.mutate({ contactId, payload })
    } else {
      createContactMutation.mutate(payload)
      event.currentTarget.reset()
    }
  }

  const handleServiceSubmit = (event, serviceId = null) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const linkedProjectIds = data.get('linked_project_id') ? [data.get('linked_project_id')] : []
    serviceMutation.mutate({
      serviceId,
      payload: {
        name: data.get('name'),
        service_type: data.get('service_type') || undefined,
        status: data.get('status') || undefined,
        pricing_value: data.get('pricing_value') ? Number(data.get('pricing_value')) : undefined,
        billing_cycle: data.get('billing_cycle') || undefined,
        start_date: data.get('start_date') || undefined,
        end_date: data.get('end_date') || undefined,
        service_owner_id: data.get('service_owner_id') || undefined,
        linked_project_ids: linkedProjectIds,
        notes: data.get('notes') || undefined,
      },
    })
  }

  const handleCreateServiceProject = (event, service) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    createServiceProjectMutation.mutate({
      serviceId: service.id,
      values: {
        name: data.get('name'),
        key: data.get('key'),
        project_id: data.get('project_id'),
        description: data.get('description'),
        client_id: client.id,
      },
    })
    event.currentTarget.reset()
  }

  const handleDeliverableSubmit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    deliverableMutation.mutate({
      title: data.get('title'),
      description: data.get('description') || undefined,
      service_id: data.get('service_id'),
      project_id: data.get('project_id'),
      owner_id: data.get('owner_id') || undefined,
      due_date: data.get('due_date') || undefined,
      linked_task_ids: data.get('task_id') ? [data.get('task_id')] : [],
    })
    event.currentTarget.reset()
  }

  const handleCreateDeliverableTask = (event, deliverable) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const project = projects.find((item) => item.id === deliverable.project_id || item.project_id === deliverable.project_id)
    deliverableTaskMutation.mutate({
      deliverableId: deliverable.id,
      taskPayload: {
        title: data.get('title'),
        description: data.get('description') || undefined,
        assigned_to: data.get('assigned_to') || undefined,
        priority: data.get('priority') || 'medium',
        due_date: data.get('due_date') || undefined,
        project_id: project?.project_id || project?.id || deliverable.project_id,
      },
    })
    event.currentTarget.reset()
  }

  const handleMeetingSubmit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    createMeetingMutation.mutate({
      title: data.get('title'),
      description: data.get('description') || undefined,
      meeting_date: data.get('meeting_date'),
      meeting_time: data.get('meeting_time'),
      duration: data.get('duration') || 30,
      client_id: client.id,
      project_id: data.get('project_id') || undefined,
      contact_id: data.get('contact_id') || undefined,
      participant_ids: '',
    })
    event.currentTarget.reset()
  }

  const renewalPayloadFromForm = (form) => {
    const data = new FormData(form)
    return {
      renewal_date: data.get('renewal_date') || undefined,
      contract_end_date: data.get('contract_end_date') || undefined,
      renewal_owner_id: data.get('renewal_owner_id') || undefined,
      renewal_status: data.get('renewal_status') || undefined,
      renewal_value: data.get('renewal_value') ? Number(data.get('renewal_value')) : undefined,
      payment_terms: data.get('payment_terms') || undefined,
      billing_frequency: data.get('billing_frequency') || undefined,
      notes: data.get('notes') || undefined,
    }
  }

  const handleRenewalSubmit = (event, action = 'update') => {
    event.preventDefault()
    renewalMutation.mutate({ action, payload: renewalPayloadFromForm(event.currentTarget) })
  }

  const submitRenewalFormAction = (form, action) => {
    if (!form) return
    renewalMutation.mutate({ action, payload: renewalPayloadFromForm(form) })
  }

  const handleChurnSubmit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    churnMutation.mutate({
      churn_reason: data.get('churn_reason'),
      end_date: data.get('end_date'),
      notes: data.get('notes') || undefined,
      revenue_lost: data.get('revenue_lost') ? Number(data.get('revenue_lost')) : undefined,
      end_active_services: data.get('end_active_services') === 'on',
    })
  }

  const handleArchiveSubmit = (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    archiveMutation.mutate({ reason: data.get('reason') })
  }

  if (!clientId) {
    return (
      <CRMPage>
        <CRMSection title="Client workspace" description="Open a client from the client directory to view its workspace.">
          <CRMEmptyState
            icon={Building2}
            title="No client selected"
            description="Go to the clients page and open any client record."
            action={<Button onClick={() => navigate('/clients')}>Open clients</Button>}
          />
        </CRMSection>
      </CRMPage>
    )
  }

  if (workspaceQuery.isLoading) {
    return (
      <CRMPage>
        <CRMSection title="Client workspace" description="Loading client data.">
          <div className="space-y-4">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-24 w-full" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-28 w-full" />
              ))}
            </div>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </CRMSection>
      </CRMPage>
    )
  }

  if (errorStatus === 403) {
    return (
      <CRMPage>
        <CRMSection title="Client workspace" description="Access denied.">
          <EmptyState
            icon={Building2}
            title="Access denied"
            description="You do not have access to this client workspace."
            action={<Button onClick={() => navigate('/clients')}>Back to clients</Button>}
          />
        </CRMSection>
      </CRMPage>
    )
  }

  if (workspaceQuery.isError || !client) {
    return (
      <CRMPage>
        <CRMSection title="Client workspace" description="Could not load the selected client.">
          <EmptyState
            icon={Building2}
            title="Client not found"
            description="The selected client does not exist or could not be loaded."
            action={<Button onClick={() => navigate('/clients')}>Back to clients</Button>}
          />
        </CRMSection>
      </CRMPage>
    )
  }

  const companySummary = client.company_name || client.name || 'Client'
  const primaryEmail = client.email || 'No email on file'
  const primaryPhone = client.contact || 'No phone on file'
  const leadBudgetFallback = leads.find((l) => l.won_amount || l.budget)?.won_amount || leads.find((l) => l.won_amount || l.budget)?.budget
  const projectsBudgetFallback = projects.reduce((sum, p) => sum + Number(p.budget || 0), 0)
  const clientBudget = firstPositiveNumber(client.budget, client.total_budget, leadBudgetFallback, projectsBudgetFallback)
  const budgetLabel = clientBudget > 0 ? formatCurrency(clientBudget) : 'N/A'
  const budgetSourceHelper = client.source_budget === 'sales_lead' || (!client.budget && leadBudgetFallback)
    ? 'From won sales lead'
    : client.source_budget === 'projects' || (!client.budget && projectsBudgetFallback > 0)
    ? 'Sum of project budgets'
    : clientBudget > 0
    ? 'Client account value'
    : 'No budget set'
  const clientTypeLabel = formatClientType(client.client_type)
  const clientStatus = client.status || 'active'
  const clientStatusLabel = CLIENT_STATUS_OPTIONS.find((item) => item.value === clientStatus)?.label || clientStatus
  const healthLevel = health.level || 'healthy'
  const healthLabel = health.label || statusText(healthLevel)
  const healthScore = Number.isFinite(Number(health.score)) ? Number(health.score) : 100
  const healthReasons = Array.isArray(health.reasons) ? health.reasons : []
  const healthTone = HEALTH_TONES[healthLevel] || HEALTH_TONES.healthy
  const healthHistory = client.lifecycle_metadata?.client_health_history || []
  const openNextAction = nextAction?.status !== 'completed' ? nextAction : null

  let tabBody
  if (activeTab === 'details') {
    const profile = client.profile || client.lifecycle_metadata?.profile || {}
    tabBody = (
      <CRMSection title="Client Details" description="Maintain the account profile used by delivery, finance, and CRM handoff.">
        <form onSubmit={handleDetailsSubmit} className="rounded-2xl border border-surface-border/80 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Client name<input name="name" defaultValue={client.name || ''} required className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Company<input name="company_name" defaultValue={client.company_name || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Industry<input name="industry" defaultValue={client.industry || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Account Owner ID<input name="account_owner_id" defaultValue={client.account_owner_id || client.assigned_to || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Sales Owner ID<input name="sales_owner_id" defaultValue={client.sales_owner_id || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Client type<select name="client_type" defaultValue={client.client_type || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">Select type</option><option value="monthly">Monthly</option><option value="one_time">One Time</option></select></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Start date<input name="start_date" type="date" defaultValue={client.start_date ? String(client.start_date).slice(0, 10) : ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Client value<input name="budget" type="number" min="0" step="0.01" defaultValue={client.budget || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Address<input name="address" defaultValue={client.address || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">City<input name="city" defaultValue={client.city || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">State<input name="state" defaultValue={client.state || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Country<input name="country" defaultValue={client.country || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">ZIP / Postal code<input name="zip_code" defaultValue={client.zip_code || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200 md:col-span-2">Commercial summary<textarea name="commercial_summary" rows={4} defaultValue={profile.commercial_summary || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200 md:col-span-2">Relationship information<textarea name="relationship_information" rows={4} defaultValue={profile.relationship_information || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          </div>
          <div className="mt-5 flex justify-end"><Button type="submit" disabled={profileMutation.isLoading}>Save details</Button></div>
        </form>
      </CRMSection>
    )
  } else if (activeTab === 'contacts') {
    tabBody = (
      <CRMSection title="Contacts" description="Use CRM contacts linked to this client's CRM Company.">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            {contacts.map((contact) => (
              <article key={contact.id} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{contact.full_name}</p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{contact.designation || 'No designation'} · {contact.email || 'No email'} · {contact.phone || 'No phone'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => primaryContactMutation.mutate(contact.id)} disabled={contact.is_primary_contact || primaryContactMutation.isLoading}>{contact.is_primary_contact ? 'Primary' : 'Make primary'}</Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingContactId(editingContactId === contact.id ? null : contact.id)}>Edit</Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CONTACT_ROLE_OPTIONS.map((role) => {
                    const checked = (contact.roles || []).includes(role) || (role === 'Primary Contact' && contact.is_primary_contact)
                    return (
                      <label key={role} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
                        <input type="checkbox" checked={checked} onChange={(event) => {
                          const currentRoles = new Set(contact.roles || [])
                          if (event.target.checked) currentRoles.add(role)
                          else currentRoles.delete(role)
                          contactRolesMutation.mutate({ contactId: contact.id, roles: Array.from(currentRoles) })
                        }} />
                        {role}
                      </label>
                    )
                  })}
                </div>
                {editingContactId === contact.id ? (
                  <form onSubmit={(event) => handleContactSubmit(event, contact.id)} className="mt-4 grid gap-3 md:grid-cols-2">
                    <input name="first_name" defaultValue={contact.first_name || ''} required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                    <input name="last_name" defaultValue={contact.last_name || ''} required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                    <input name="email" type="email" defaultValue={contact.email || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                    <input name="phone" defaultValue={contact.phone || ''} required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                    <input name="country_code" defaultValue={contact.country_code || '+91'} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                    <input name="designation" defaultValue={contact.designation || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                    <div className="md:col-span-2 flex justify-end"><Button type="submit" size="sm" disabled={updateContactMutation.isLoading}>Save contact</Button></div>
                  </form>
                ) : null}
              </article>
            ))}
            {!contacts.length ? <CRMEmptyState icon={Users} title="No CRM contacts yet" description="Add a contact to the linked CRM Company." /> : null}
          </div>
          <form onSubmit={(event) => handleContactSubmit(event)} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add CRM contact</p>
            <div className="mt-3 space-y-3">
              <input name="first_name" placeholder="First name" required className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <input name="last_name" placeholder="Last name" required className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <input name="designation" placeholder="Role/title" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <input name="email" type="email" placeholder="Email" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <div className="grid grid-cols-[90px_1fr] gap-2">
                <input name="country_code" defaultValue="+91" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <input name="phone" placeholder="Phone" required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              </div>
              <Button type="submit" className="w-full" disabled={createContactMutation.isLoading || !client?.crm_company_id}>Add contact</Button>
            </div>
          </form>
        </div>
      </CRMSection>
    )
  } else if (activeTab === 'services') {
    tabBody = (
      <CRMSection title="Services" description="Manage purchased services and link them to delivery projects.">
        <div className="space-y-4">
          <form onSubmit={(event) => handleServiceSubmit(event)} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input name="name" placeholder="Service name" required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <input name="service_type" placeholder="Service type/category" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <select name="status" defaultValue="planned" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="planned">Planned</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select>
              <input name="pricing_value" type="number" min="0" step="0.01" placeholder="Pricing/value" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <input name="billing_cycle" placeholder="Billing cycle" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <input name="start_date" type="date" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <input name="end_date" type="date" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <input name="service_owner_id" placeholder="Service owner ID" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <select name="linked_project_id" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">Link existing project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
              <textarea name="notes" rows={2} placeholder="Notes" className="md:col-span-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
            </div>
            <div className="mt-4 flex justify-end"><Button type="submit" disabled={serviceMutation.isLoading}>Add service</Button></div>
          </form>
          {services.map((service) => (
            <article key={service.id} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{service.name}</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{service.service_type || 'General service'} · {formatCurrency(service.pricing_value || 0)} · {service.billing_cycle || 'No billing cycle'}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{service.linked_project_ids?.length || 0} linked project(s)</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => serviceStatusMutation.mutate({ serviceId: service.id, action: 'activate' })}>Activate</Button>
                  <Button size="sm" variant="secondary" onClick={() => serviceStatusMutation.mutate({ serviceId: service.id, action: 'pause' })}>Pause</Button>
                  <Button size="sm" variant="secondary" onClick={() => serviceStatusMutation.mutate({ serviceId: service.id, action: 'end' })}>End</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditingServiceId(editingServiceId === service.id ? null : service.id)}>Edit</Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <span className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold uppercase dark:border-gray-700">{service.status || 'planned'}</span>
                <span>Start {formatDate(service.start_date)}</span>
                <span>End {formatDate(service.end_date)}</span>
              </div>
              {service.linked_project_ids?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {service.linked_project_ids.map((linkedProjectId) => {
                    const linkedProject = projects.find((project) => project.id === linkedProjectId || project.project_id === linkedProjectId)
                    return (
                      <span key={linkedProjectId} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-200">
                        {linkedProject?.name || linkedProjectId}
                        {linkedProject ? <Link to={`/projects/${projectBoardId(linkedProject)}/board`} className="font-semibold text-primary-600 hover:underline dark:text-primary-400">Open</Link> : null}
                        <button type="button" className="font-semibold text-rose-600 dark:text-rose-300" onClick={() => serviceProjectUnlinkMutation.mutate({ serviceId: service.id, projectId: linkedProjectId })}>Unlink</button>
                      </span>
                    )
                  })}
                </div>
              ) : null}
              <form onSubmit={(event) => {
                event.preventDefault()
                const selected = new FormData(event.currentTarget).get('project_id')
                if (selected) serviceProjectMutation.mutate({ serviceId: service.id, projectId: selected })
              }} className="mt-3 flex flex-wrap gap-2">
                <select name="project_id" className="min-w-60 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">Link another project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                <Button type="submit" size="sm" variant="secondary" disabled={serviceProjectMutation.isLoading}>Link project</Button>
              </form>
              <form onSubmit={(event) => handleCreateServiceProject(event, service)} className="mt-3 grid gap-2 md:grid-cols-4">
                <input name="name" placeholder="New Work project name" required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <input name="key" placeholder="Key" required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <input name="project_id" placeholder="Project ID" required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <Button type="submit" size="sm" variant="secondary" disabled={createServiceProjectMutation.isLoading}>Create project</Button>
                <textarea name="description" rows={2} placeholder="Project description" className="md:col-span-4 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              </form>
              {editingServiceId === service.id ? (
                <form onSubmit={(event) => handleServiceSubmit(event, service.id)} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <input name="name" defaultValue={service.name || ''} required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                  <input name="service_type" defaultValue={service.service_type || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                  <select name="status" defaultValue={service.status || 'planned'} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="planned">Planned</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select>
                  <input name="pricing_value" type="number" min="0" step="0.01" defaultValue={service.pricing_value || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                  <input name="billing_cycle" defaultValue={service.billing_cycle || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                  <input name="start_date" type="date" defaultValue={service.start_date ? String(service.start_date).slice(0, 10) : ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                  <input name="end_date" type="date" defaultValue={service.end_date ? String(service.end_date).slice(0, 10) : ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                  <input name="service_owner_id" defaultValue={service.service_owner_id || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                  <textarea name="notes" rows={2} defaultValue={service.notes || ''} className="md:col-span-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                  <div className="xl:col-span-4 flex justify-end"><Button type="submit" size="sm" disabled={serviceMutation.isLoading}>Save service</Button></div>
                </form>
              ) : null}
            </article>
          ))}
          {!services.length ? <CRMEmptyState icon={FolderKanban} title="No services yet" description="Add the services sold to this client before linking delivery projects." /> : null}
        </div>
      </CRMSection>
    )
  } else if (activeTab === 'deliverables') {
    tabBody = (
      <CRMSection title="Deliverables" description="Client-facing outputs linked to services, projects, and Work tasks.">
        <div className="space-y-4">
          <div className="grid gap-2 rounded-2xl border border-surface-border/80 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:grid-cols-5">
            <select value={deliverableFilters.project} onChange={(event) => setDeliverableFilters((state) => ({ ...state, project: event.target.value }))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
            <select value={deliverableFilters.service} onChange={(event) => setDeliverableFilters((state) => ({ ...state, service: event.target.value }))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">All services</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select>
            <select value={deliverableFilters.status} onChange={(event) => setDeliverableFilters((state) => ({ ...state, status: event.target.value }))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">All statuses</option>{DELIVERABLE_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>
            <select value={deliverableFilters.approval} onChange={(event) => setDeliverableFilters((state) => ({ ...state, approval: event.target.value }))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">All approvals</option>{['not_sent', 'sent', 'viewed', 'approved', 'revision_requested'].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>
            <select value={deliverableFilters.due} onChange={(event) => setDeliverableFilters((state) => ({ ...state, due: event.target.value }))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">Any due date</option><option value="due">Has due date</option><option value="overdue">Overdue</option></select>
          </div>

          <form onSubmit={handleDeliverableSubmit} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input name="title" placeholder="Deliverable title" required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <select name="service_id" required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">Service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select>
              <select name="project_id" required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">Project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
              <input name="owner_id" placeholder="Owner ID" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <input name="due_date" type="date" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              <select name="task_id" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">Link existing task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select>
              <textarea name="description" rows={2} placeholder="Description" className="md:col-span-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
            </div>
            <div className="mt-4 flex justify-end"><Button type="submit" disabled={deliverableMutation.isLoading}>Add deliverable</Button></div>
          </form>

          {visibleDeliverables.length ? (
            <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-950">
                    <tr>{['Deliverable', 'Service', 'Project', 'Owner', 'Due Date', 'Status', 'Approval', 'Revisions', 'Actions'].map((header) => <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{header}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {visibleDeliverables.map((deliverable) => {
                      const project = projects.find((item) => item.id === deliverable.project_id)
                      const service = services.find((item) => item.id === deliverable.service_id)
                      return (
                        <tr key={deliverable.id} className="align-top hover:bg-gray-50 dark:hover:bg-gray-800/80">
                          <td className="px-4 py-3"><p className="font-medium text-gray-900 dark:text-gray-100">{deliverable.title}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{deliverable.linked_task_ids?.length || 0} task(s)</p></td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{service?.name || deliverable.service_name || deliverable.service_id}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{project ? <Link className="font-medium text-primary-600 hover:underline dark:text-primary-400" to={`/projects/${projectBoardId(project)}/board`}>{project.name}</Link> : deliverable.project_name || deliverable.project_id}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{deliverable.owner_id || 'Unassigned'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDate(deliverable.due_date)}</td>
                          <td className="px-4 py-3"><select value={deliverable.status || 'planned'} onChange={(event) => deliverableStatusMutation.mutate({ deliverableId: deliverable.id, nextStatus: event.target.value })} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">{DELIVERABLE_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{(deliverable.approval_status || 'not_sent').replaceAll('_', ' ')}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{deliverable.revision_count || 0}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" size="sm" variant="secondary" onClick={() => deliverableReviewMutation.mutate({ deliverableId: deliverable.id, action: 'send', payload: {} })}>Send review</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => deliverableReviewMutation.mutate({ deliverableId: deliverable.id, action: 'approve', payload: {} })}>Approve</Button>
                              <Button type="button" size="sm" variant="secondary" onClick={() => deliverableReviewMutation.mutate({ deliverableId: deliverable.id, action: 'revision', payload: { revision_note: 'Revision requested from client workspace' } })}>Revision</Button>
                              {project ? <Link className="btn btn-secondary btn-sm inline-flex items-center gap-2" to={`/projects/${projectBoardId(project)}/board`}><ExternalLink className="h-3 w-3" />Work</Link> : null}
                            </div>
                            <form onSubmit={(event) => handleCreateDeliverableTask(event, deliverable)} className="mt-3 grid gap-2">
                              <input name="title" placeholder="New task for this deliverable" required className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                              <div className="grid grid-cols-2 gap-2">
                                <select name="priority" defaultValue="medium" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
                                <input name="due_date" type="date" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                              </div>
                              <input name="assigned_to" placeholder="Assignee ID" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                              <textarea name="description" rows={2} placeholder="Task notes" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                              <Button type="submit" size="sm" variant="secondary" disabled={deliverableTaskMutation.isLoading}>Create task</Button>
                            </form>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <CRMEmptyState icon={FileText} title="No deliverables yet" description="Create deliverables under a service and project to track client review." />}
        </div>
      </CRMSection>
    )
  } else if (activeTab === 'communication') {
    tabBody = (
      <CRMSection title="Communication" description="Client-facing communication from CRM activity and connected inboxes.">
        <div className="mb-4 flex flex-wrap gap-2">
          {communicationChannels.map((channel) => (
            <Button key={channel} type="button" size="sm" variant={communicationFilter === channel ? 'primary' : 'secondary'} onClick={() => setCommunicationFilter(channel)}>
              {channel === 'all' ? 'All' : channel.replace('_', ' ')}
            </Button>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-3">
            {visibleCommunication.map((item) => (
              <article key={`${item.source}-${item.id}`} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">{item.channel || item.type}</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{item.preview || 'No preview available'}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.contact || 'No contact'} | {item.sender || 'Unknown sender'} to {item.receiver || 'Unknown receiver'}</p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(item.timestamp)}</p>
                </div>
              </article>
            ))}
            {!visibleCommunication.length ? <CRMEmptyState icon={Mail} title="No client communication" description="Emails, calls, meetings, and connected messages linked to this client will appear here." /> : null}
          </div>
          <div className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Internal notes</p>
            <div className="mt-3 space-y-3">
              {internalNotes.map((note) => (
                <div key={note.id} className="rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-800">
                  <p className="text-gray-700 dark:text-gray-200">{note.preview || 'No note text'}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(note.timestamp)} | {note.sender || 'Unknown actor'}</p>
                </div>
              ))}
              {!internalNotes.length ? <p className="text-sm text-gray-500 dark:text-gray-400">No internal notes linked to this client.</p> : null}
            </div>
          </div>
        </div>
      </CRMSection>
    )
  } else if (activeTab === 'onboarding') {
    tabBody = onboarding ? (
      <OnboardingWorkspace
        onboarding={onboarding}
        activeTab={activeOnboardingTab}
        onTabChange={setOnboardingTab}
        client={client}
        projects={projects}
        contacts={workspace.contacts || []}
        meetings={meetings}
        documents={documents}
        onSaveClient={(values) => onboardingSaveMutation.mutate(values)}
        onSaveOnboarding={(values) => structuredOnboardingMutation.mutate(values)}
        onSaveAssetsAccess={(values) => assetsAccessMutation.mutate(values)}
        onSetPrimaryContact={(contactId) => primaryContactMutation.mutate(contactId)}
        onCreateContact={(values) => createContactMutation.mutate(values)}
        onCreateProject={(values) => createProjectMutation.mutate(values)}
        onCreateMeeting={(values) => createMeetingMutation.mutate(values)}
        onGenerateDocument={() => onboardingDocumentMutation.mutate()}
        saving={onboardingSaveMutation.isLoading || structuredOnboardingMutation.isLoading || primaryContactMutation.isLoading || assetsAccessMutation.isLoading}
        creatingContact={createContactMutation.isLoading}
        creatingProject={createProjectMutation.isLoading}
        creatingMeeting={createMeetingMutation.isLoading}
        generatingDocument={onboardingDocumentMutation.isLoading}
      />
    ) : <CRMEmptyState title="Onboarding is not active" description="Start onboarding from the New client stage to create the onboarding workspace." />
  } else if (activeTab === 'projects') {
    tabBody = (
      <CRMSection title="Projects" description="Projects linked to this client account.">
        {projects.length ? (
          <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    {['Project', 'Status', 'Budget', 'Start', 'Delivery', 'Actions'].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {projects.map((project) => (
                    <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/80">
                      <td className="px-4 py-3">
                        <Link
                          to={`/projects/${projectBoardId(project)}/board`}
                          className="font-medium text-gray-900 hover:text-primary-600 hover:underline dark:text-gray-100 dark:hover:text-primary-400"
                        >
                          {project.name}
                        </Link>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{project.key || project.project_id || project.id}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{project.status || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{project.budget ? formatCurrency(project.budget) : 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDate(project.start_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDate(project.delivery_date)}</td>
                      <td className="px-4 py-3">
                        <Link className="btn btn-secondary btn-sm inline-flex items-center gap-2" to={`/projects/${projectBoardId(project)}/board`}>
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <CRMEmptyState icon={FolderKanban} title="No projects yet" description="Projects will appear here once they are linked to this client." />
        )}
      </CRMSection>
    )
  } else if (activeTab === 'tasks') {
    tabBody = (
      <CRMSection title="Tasks" description="Delivery tasks associated with the client projects.">
        {tasks.length ? (
          <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    {['Task', 'Status', 'Priority', 'Project', 'Due', 'Updated'].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {tasks.map((task) => (
                    <tr key={task.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/80">
                      <td className="px-4 py-3">
                        <Link
                          to={
                            task.project_object_id || task.project_id
                              ? `/projects/${task.project_object_id || task.project_id}/tasks/${task.id}`
                              : `/tasks/${task.id}`
                          }
                          className="font-medium text-gray-900 hover:text-primary-600 hover:underline dark:text-gray-100 dark:hover:text-primary-400"
                        >
                          {task.title}
                        </Link>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{task.id}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{task.status || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{task.priority || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                        {task.project_object_id || task.project_id ? (
                          <Link
                            to={`/projects/${task.project_object_id || task.project_id}/board`}
                            className="font-medium text-primary-600 hover:underline dark:text-primary-400"
                          >
                            {task.project_id || task.project_object_id}
                          </Link>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDate(task.due_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDate(task.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <CRMEmptyState icon={Activity} title="No tasks yet" description="Tasks linked to client projects will appear here." />
        )}
      </CRMSection>
    )
  } else if (activeTab === 'leads') {
    tabBody = (
      <CRMSection title="Leads" description="Leads associated with this client.">
        {leads.length ? (
          <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    {['Lead', 'Stage', 'Status', 'Owner', 'Value', 'Updated'].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/80">
                      <td className="px-4 py-3">
                        <Link className="font-medium text-primary-700 hover:underline dark:text-primary-300" to={`/crm/leads/${lead.id}`}>
                          {lead.prospect_name || 'Lead'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{lead.current_stage || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{lead.status || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{lead.assigned_to || 'Unassigned'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{lead.won_amount ? formatCurrency(lead.won_amount) : 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDate(lead.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <CRMEmptyState icon={Users} title="No leads yet" description="Leads matched to this client will appear here." />
        )}
      </CRMSection>
    )
  } else if (activeTab === 'documents') {
    tabBody = (
      <CRMSection title="Files" description="Referenced client files and documents from onboarding, delivery, finance, and approvals.">
        <div className="mb-4 flex flex-wrap gap-2">
          {fileCategories.map((category) => (
            <Button key={category} type="button" size="sm" variant={fileFilter === category ? 'primary' : 'secondary'} onClick={() => setFileFilter(category)}>
              {category === 'all' ? 'All' : category}
            </Button>
          ))}
        </div>
        {visibleFiles.length ? (
          <div className="grid gap-3">
            {visibleFiles.map((document, index) => (
              <article key={`${document.url || document.name || index}`} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{document.name || document.original_name || 'Document'}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{document.category || 'Other'} | {document.type || 'file'} | {document.size ? `${(Number(document.size) / 1024).toFixed(2)} KB` : 'Size unavailable'}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(document.uploaded_at)}</p>
                  </div>
                  {document.url ? (
                    <a className="btn btn-secondary btn-sm inline-flex items-center gap-2" href={clientFileUrl(document.url)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <CRMEmptyState icon={FileText} title="No files yet" description="Client agreements, requirements, assets, reports, invoices, and deliverable references will appear here." />
        )}
      </CRMSection>
    )
  } else if (activeTab === 'invoices') {
    tabBody = (
      <CRMSection title="Finance" description="Commercial lifecycle, invoices, payments, renewal, and churn controls.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CRMStatCard icon={DollarSign} label="Contract value" value={formatCurrency(finance.contract_value || 0)} tone="emerald" helper={finance.payment_terms || 'No payment terms'} />
          <CRMStatCard icon={DollarSign} label="Monthly value" value={formatCurrency(finance.monthly_value || 0)} tone="blue" helper={finance.billing_frequency || 'No billing frequency'} />
          <CRMStatCard icon={DollarSign} label="Paid" value={formatCurrency(finance.total_paid || 0)} tone="green" helper={`${formatCurrency(finance.total_invoiced || 0)} invoiced`} />
          <CRMStatCard icon={AlertTriangle} label="Outstanding" value={formatCurrency(finance.outstanding || 0)} tone="amber" helper={`${formatCurrency(finance.overdue || 0)} overdue`} />
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
        {invoices.length ? (
          <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    {['Invoice', 'Type', 'Status', 'Total', 'Outstanding', 'Due'].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/80">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{invoice.invoice_number}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDate(invoice.invoice_date)}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{invoice.invoice_type || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{invoice.status || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatCurrency(invoice.total_amount || 0)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatCurrency(invoice.outstanding_amount || 0)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDate(invoice.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <CRMEmptyState icon={DollarSign} title="No invoices yet" description="Invoices generated for this client will appear here." />
        )}
            <div className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Next invoice</p>
              {finance.next_invoice ? (
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{finance.next_invoice.invoice_number}</p>
                  <p>Due {formatDate(finance.next_invoice.due_date)} | {formatCurrency(finance.next_invoice.outstanding_amount || 0)} outstanding</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No upcoming unpaid invoice.</p>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <form onSubmit={(event) => handleRenewalSubmit(event, 'update')} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Renewal</p>
              <div className="mt-3 grid gap-3">
                <input name="renewal_date" type="date" defaultValue={renewal.renewal_date ? String(renewal.renewal_date).slice(0, 10) : ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <input name="contract_end_date" type="date" defaultValue={renewal.contract_end_date ? String(renewal.contract_end_date).slice(0, 10) : ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <input name="renewal_owner_id" placeholder="Renewal owner ID" defaultValue={renewal.renewal_owner_id || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <select name="renewal_status" defaultValue={renewal.status || 'upcoming'} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">
                  {RENEWAL_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
                </select>
                <input name="renewal_value" type="number" min="0" step="0.01" placeholder="Renewal value" defaultValue={renewal.renewal_value || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <input name="payment_terms" placeholder="Payment terms" defaultValue={renewal.payment_terms || finance.payment_terms || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <input name="billing_frequency" placeholder="Billing frequency" defaultValue={renewal.billing_frequency || finance.billing_frequency || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <textarea name="notes" rows={3} placeholder="Renewal notes" defaultValue={renewal.notes || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="submit" size="sm" variant="secondary" disabled={renewalMutation.isLoading}>Save</Button>
                <Button type="button" size="sm" variant="secondary" onClick={(event) => submitRenewalFormAction(event.currentTarget.closest('form'), 'start')} disabled={renewalMutation.isLoading}>Start renewal</Button>
                <Button type="button" size="sm" onClick={(event) => submitRenewalFormAction(event.currentTarget.closest('form'), 'renewed')} disabled={renewalMutation.isLoading}>Mark renewed</Button>
              </div>
            </form>
            <form onSubmit={handleChurnSubmit} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Churn</p>
              <div className="mt-3 grid gap-3">
                <select name="churn_reason" defaultValue={churn.reason || ''} required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">
                  <option value="">Select churn reason</option>
                  {CHURN_REASONS.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                </select>
                <input name="end_date" type="date" defaultValue={churn.end_date ? String(churn.end_date).slice(0, 10) : ''} required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <input name="revenue_lost" type="number" min="0" step="0.01" placeholder="Revenue/value lost" defaultValue={churn.revenue_lost || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <textarea name="notes" rows={3} placeholder="Churn notes" defaultValue={churn.notes || ''} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200"><input name="end_active_services" type="checkbox" defaultChecked /> End active services safely</label>
              </div>
              <Button type="submit" size="sm" variant="secondary" className="mt-3" disabled={churnMutation.isLoading}>Mark churned</Button>
            </form>
            {client.status === 'churned' ? (
              <form onSubmit={handleArchiveSubmit} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Archive</p>
                <input name="reason" required placeholder="Archive reason" className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
                <Button type="submit" size="sm" variant="secondary" className="mt-3" disabled={archiveMutation.isLoading}>Archive client</Button>
              </form>
            ) : null}
          </div>
        </div>
      </CRMSection>
    )
  } else if (activeTab === 'meetings') {
    tabBody = (
      <CRMSection title="Meetings" description="Meetings explicitly connected to this client, project, or client contact.">
        <form onSubmit={handleMeetingSubmit} className="mb-5 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input name="title" placeholder="Meeting title" required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
            <input name="meeting_date" type="date" required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
            <input name="meeting_time" type="time" required className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
            <input name="duration" type="number" min="15" step="15" defaultValue="30" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
            <select name="project_id" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">
              <option value="">No linked project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <select name="contact_id" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100">
              <option value="">No linked contact</option>
              {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email}</option>)}
            </select>
            <textarea name="description" rows={2} placeholder="Notes or expected result" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm md:col-span-2 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" />
          </div>
          <Button type="submit" size="sm" className="mt-3" disabled={createMeetingMutation.isLoading}>Schedule meeting</Button>
        </form>
        {meetings.length ? (
          <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    {['Meeting', 'Status', 'Date', 'Time', 'Duration', 'Linked', 'Actions'].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {meetings.map((meeting) => {
                    const linkedProject = projects.find((project) => project.id === meeting.project_id || project.project_id === meeting.project_id)
                    const linkedContact = contacts.find((contact) => contact.id === meeting.contact_id)
                    return (
                      <tr key={meeting.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/80">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{meeting.title}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{meeting.description || 'No notes recorded'}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{meeting.status || 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDate(meeting.meeting_date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{meeting.meeting_time || 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{meeting.duration ? `${meeting.duration} min` : 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                          <p>{linkedProject?.name || (meeting.project_id ? 'Project linked' : 'No project')}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{linkedContact?.full_name || (meeting.contact_id ? 'Contact linked' : 'No contact')}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {meeting.join_url ? <a className="btn btn-secondary btn-sm inline-flex items-center gap-2" href={meeting.join_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" />Open</a> : null}
                            {meeting.status !== 'completed' ? <Button type="button" size="sm" variant="secondary" onClick={() => completeMeetingMutation.mutate(meeting.id)} disabled={completeMeetingMutation.isLoading}>Complete</Button> : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <CRMEmptyState icon={CalendarDays} title="No meetings yet" description="Meetings connected to this client account will appear here." />
        )}
      </CRMSection>
    )
  } else if (activeTab === 'timeline') {
    tabBody = (
      <CRMSection title="Activity" description="Chronological client activity from CRM, delivery, meetings, files, and finance.">
        <div className="mb-4 flex flex-wrap gap-2">
          {ACTIVITY_FILTERS.map((filter) => (
            <Button key={filter} type="button" size="sm" variant={activityFilter === filter ? 'primary' : 'secondary'} onClick={() => { setActivityFilter(filter); setActivityLimit(25) }}>
              {filter === 'all' ? 'All' : filter}
            </Button>
          ))}
        </div>
        {activityQuery.isLoading && activeTab === 'timeline' ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : activityQuery.isError ? (
          <CRMEmptyState icon={AlertTriangle} title="Activity could not load" description={apiErrorMessage(activityQuery.error, 'Refresh the workspace and try again.')} />
        ) : activityItems.length ? (
          <div className="space-y-3">
            {activityItems.map((event, index) => (
              <article key={`${event.related_type}-${event.related_id}-${index}`} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{event.action}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{event.kind} | {event.related_type} | {event.actor || 'System'}</p>
                    {event.context?.title || event.context?.name || event.context?.preview ? (
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{event.context.title || event.context.name || event.context.preview}</p>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(event.timestamp)}</p>
                </div>
              </article>
            ))}
            {activityData.has_more ? (
              <Button type="button" variant="secondary" onClick={() => setActivityLimit((value) => value + 25)} disabled={activityQuery.isFetching}>
                Load more
              </Button>
            ) : null}
          </div>
        ) : (
          <CRMEmptyState icon={Activity} title="No activity yet" description="Client lifecycle, communication, work, meetings, files, and finance events will appear here." />
        )}
      </CRMSection>
    )
  } else {
    tabBody = (
      <div className="space-y-6">
        <CRMSection title="Overview" description="Client account details and delivery signals.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Primary details</p>
              <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                <p className="font-medium text-gray-900 dark:text-gray-100">{client.name}</p>
                <p>{client.company_name || 'No company name'}</p>
                <p>Status: {client.status || 'N/A'}</p>
                <p>Owner: {client.assigned_to_name || client.assigned_to || 'Unassigned'}</p>
                <p>Type: <span className="font-medium">{clientTypeLabel}</span></p>
              </div>
            </article>
            <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Contact</p>
              <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" /> {client.email || 'No email'}</p>
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400" /> {client.contact || 'No phone'}</p>
                <p className="text-gray-500 dark:text-gray-400">{client.address || 'No address'}</p>
              </div>
            </article>
            <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Financial & Schedule</p>
              <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                <p>Budget: <span className="font-medium">{budgetLabel}</span></p>
                <p>Start: {formatDate(client.start_date)}</p>
                <p>Delivery: {formatDate(client.delivery_date)}</p>
              </div>
            </article>
            <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Client health</p>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${healthTone}`}>{healthScore} - {healthLabel}</span>
              </div>
              <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                {healthReasons.slice(0, 3).map((reason) => (
                  <button key={`${reason.type}-${reason.related_id || reason.message}`} type="button" onClick={() => setTab(reason.tab || 'overview')} className="block text-left text-sm font-medium text-primary-700 hover:underline dark:text-primary-300">
                    {reason.message}
                  </button>
                ))}
                {!healthReasons.length ? <p>No active risk reasons.</p> : null}
                <p className="text-xs text-gray-500 dark:text-gray-400">{healthHistory.length ? `${healthHistory.length} health snapshot(s)` : 'First health snapshot'}</p>
              </div>
            </article>
          </div>
        </CRMSection>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CRMStatCard icon={FolderKanban} label="Projects" value={String(totalProjects)} tone="blue" helper={projects[0]?.name || 'No linked project yet'} />
          <CRMStatCard icon={Activity} label="Tasks" value={String(totalTasks)} tone="emerald" helper={summary.tasks ? `${Object.keys(summary.tasks).length} task states` : 'Task activity will appear here'} />
          <CRMStatCard icon={Users} label="Leads" value={String(totalLeads)} tone="amber" helper={summary.leads ? `${summary.leads.active || 0} active` : 'No linked leads yet'} />
          <CRMStatCard icon={DollarSign} label="Outstanding" value={formatCurrency(outstandingAmount || 0)} tone="slate" helper={`${totalInvoices} invoice(s)`} />
        </div>

        <CRMSection title="Next Action" description="Generated from current client risk signals; lifecycle status remains separate.">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <article className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{openNextAction?.action || 'No open action'}</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Owner: {openNextAction?.owner_id || 'Unassigned'} | Due: {formatDate(openNextAction?.due_date)} | Priority: {openNextAction?.priority || 'low'}
                  </p>
                </div>
                {openNextAction ? <Button size="sm" variant="secondary" onClick={() => nextActionMutation.mutate()} disabled={nextActionMutation.isLoading}>Complete</Button> : null}
              </div>
              {openNextAction?.related_entity?.tab ? (
                <button type="button" onClick={() => setTab(openNextAction.related_entity.tab)} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300">
                  Open source <ExternalLink className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </article>
            <article className={`rounded-2xl border p-4 shadow-sm ${activeEscalation ? 'border-orange-200 bg-orange-50 dark:border-orange-900/60 dark:bg-orange-950/30' : 'border-surface-border/80 bg-white dark:border-gray-800 dark:bg-gray-900'}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Escalation</p>
              {activeEscalation ? (
                <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{activeEscalation.reason || 'Active health escalation'}</p>
                  <p>Assigned: {activeEscalation.assigned_to || 'Unassigned'}</p>
                  <p>Due: {formatDate(activeEscalation.due_date)}</p>
                  <p>Action: {activeEscalation.recommended_action || 'Review client risk'}</p>
                </div>
              ) : <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No active escalation.</p>}
            </article>
          </div>
        </CRMSection>
      </div>
    )
  }

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="Client Workspace"
        title={client.name}
        description={`Source of truth for ${companySummary}, linked projects, billing and delivery signals.`}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/clients')}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Link className="btn btn-secondary" to="/invoices">
              <ExternalLink className="h-4 w-4" />
              Invoices
            </Link>
          </div>
        )}
      />

      <section className="overflow-hidden rounded-[2rem] border border-emerald-100/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 shadow-sm dark:border-gray-800 dark:from-gray-950 dark:via-gray-900 dark:to-gray-900">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
          <div className="space-y-4">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] shadow-sm ${clientStatusClass(clientStatus)}`}>
              {clientStatusLabel} account workspace
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{client.name}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                One place for delivery, finance, and CRM context for this client account.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTab('projects')}>
                <FolderKanban className="h-4 w-4" />
                Projects
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTab('invoices')}>
                <DollarSign className="h-4 w-4" />
                Invoices
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTab('timeline')}>
                <Activity className="h-4 w-4" />
                Timeline
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/85">
              <label className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400" htmlFor="client-workspace-status">
                Status
              </label>
              <select
                id="client-workspace-status"
                value={clientStatus}
                disabled={statusMutation.isLoading}
                onChange={(event) => {
                  if (event.target.value !== clientStatus) statusMutation.mutate(event.target.value)
                }}
                className="mt-2 h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-900 shadow-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-primary-900/50"
              >
                {CLIENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Update account state</p>
            </article>
            <article className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/85">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Budget</p>
              <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{budgetLabel}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{budgetSourceHelper}</p>
            </article>
            <article className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/85">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Type</p>
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{clientTypeLabel}</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{formatDate(client.start_date)}</p>
            </article>
            <article className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/85">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Workspace owner</p>
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{client.assigned_to_name || client.assigned_to || 'Unassigned'}</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{primaryEmail}</p>
            </article>
            <article className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/85">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Health</p>
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{healthScore} - {healthLabel}</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{healthReasons[0]?.message || primaryPhone}</p>
            </article>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <CRMStatCard icon={Building2} label="Client" value={client.name || '-'} tone="blue" helper={client.company_name || 'Client account'} />
        <CRMStatCard icon={DollarSign} label="Budget" value={budgetLabel} tone="emerald" helper={budgetSourceHelper} />
        <CRMStatCard icon={FolderKanban} label="Projects" value={String(totalProjects)} tone="emerald" helper={projects[0]?.name || 'Linked projects'} />
        <CRMStatCard icon={DollarSign} label="Invoices" value={String(totalInvoices)} tone="amber" helper={formatCurrency(outstandingAmount || 0)} />
        <CRMStatCard icon={Clock3} label="Updated" value={formatDate(client.updated_at)} tone="slate" helper="Workspace freshness" />
      </div>

      <WorkspaceTabs activeTab={activeTab} onTabChange={setTab} counts={tabCounts} />

      {tabBody}

      <Modal
        isOpen={Boolean(transitionBlocker)}
        onClose={() => setTransitionBlocker(null)}
        title="Cannot activate client yet"
        description={transitionBlocker?.message || 'Complete missing onboarding details before moving this client forward.'}
        size="lg"
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTransitionBlocker(null)}>Close</Button>
            <Button
              type="button"
              onClick={() => {
                const nextTab = transitionMissingFields[0]?.tab || 'overview'
                setTransitionBlocker(null)
                setOnboardingTab(nextTab)
              }}
            >
              Open first missing item
            </Button>
          </div>
        )}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            <p>Activation is blocked by required onboarding records. Fix them here; page will not break.</p>
          </div>
          <div className="space-y-2">
            {transitionMissingFields.map((field) => (
              <div key={`${field.field}-${field.tab}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{field.label || field.field}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{field.reason || statusText(field.current_status)}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setTransitionBlocker(null)
                    setOnboardingTab(field.tab || 'overview')
                  }}
                >
                  {field.action_label || 'Open item'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </CRMPage>
  )
}
