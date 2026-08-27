import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Activity, Building2, CalendarDays, Clock3, DollarSign, ExternalLink, FileText, FolderKanban, Mail, Phone, Users } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { clientsAPI } from '../api/clients'
import { meetingsApi } from '../api/meetings'
import { projectsApi } from '../api/projects'
import { Button, EmptyState, Modal, Skeleton } from '../components/ui'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../components/crm'
import { CompanyTimeline } from './crm/companies/components'
import { formatCurrency } from './crm/pipeline/utils'
import { toFormData } from './phase4Utils'
import { timeService } from '@/services/timeService'

const TAB_KEY = 'tab'
const ONBOARDING_TAB_KEY = 'onboardingTab'
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'projects', label: 'Projects' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'leads', label: 'Leads' },
  { key: 'documents', label: 'Documents' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'timeline', label: 'Timeline' },
]

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

function OnboardingWorkspace({ onboarding, activeTab, onTabChange, client, projects, contacts, meetings, documents, onSaveClient, onCreateProject, onCreateMeeting, onGenerateDocument, saving, creatingProject, creatingMeeting, generatingDocument }) {
  const visibleItems = activeTab === 'overview'
    ? onboarding?.items || []
    : (onboarding?.items || []).filter((item) => item.tab === activeTab)
  const onboardingDocument = documents.find((item) => item.type === 'onboarding_document' || item.category === 'onboarding_document')
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
        }}>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Contract / deal value<input name="budget" type="number" step="0.01" defaultValue={client?.budget || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Billing frequency<select name="client_type" defaultValue={client?.client_type || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"><option value="">Select</option><option value="monthly">Monthly</option><option value="one_time">One Time</option></select></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Start date<input name="start_date" type="date" defaultValue={client?.start_date ? String(client.start_date).slice(0, 10) : ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <div className="flex items-end"><Button type="submit" loading={saving} loadingText="Saving">Save Commercial</Button></div>
        </form>
      ) : null}
      {activeTab === 'requirements' ? (
        <form className="mt-5 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900" onSubmit={(event) => {
          event.preventDefault()
          onSaveClient({ notes: event.currentTarget.elements.notes.value })
        }}>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Business objective, scope, deliverables, audience, deadlines, competitors, preferences, special requirements<textarea name="notes" rows={7} defaultValue={client?.notes || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <Button type="submit" className="mt-3" loading={saving} loadingText="Saving">Save Requirements</Button>
        </form>
      ) : null}
      {activeTab === 'contacts' ? (
        <form className="mt-5 grid gap-4 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:grid-cols-2" onSubmit={(event) => {
          event.preventDefault()
          onSaveClient({
            name: event.currentTarget.elements.name.value,
            email: event.currentTarget.elements.email.value,
            contact: event.currentTarget.elements.contact.value,
          })
        }}>
          <div className="md:col-span-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Primary contact</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{contacts.length} CRM contact(s) linked.</p>
          </div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Contact name<input name="name" defaultValue={client?.name || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Email<input name="email" type="email" defaultValue={client?.email || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Phone<input name="contact" defaultValue={client?.contact || ''} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100" /></label>
          <div className="flex items-end"><Button type="submit" loading={saving} loadingText="Saving">Save Primary Contact</Button></div>
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
            <Button type="button" onClick={onGenerateDocument} loading={generatingDocument} loadingText="Generating">{onboardingDocument ? 'Regenerate Document' : 'Generate Document'}</Button>
          </div>
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
              <Button type="button" size="sm" variant="secondary" className="mt-4" onClick={() => onTabChange(item.tab)}>{item.action_label || 'Open linked records'}</Button>
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
  const documents = useMemo(() => (Array.isArray(client?.documents) ? client.documents : []), [client?.documents])
  const invoices = useMemo(() => (Array.isArray(workspace.invoices) ? workspace.invoices : []), [workspace.invoices])
  const meetings = useMemo(() => (Array.isArray(workspace.meetings) ? workspace.meetings : []), [workspace.meetings])
  const onboarding = workspace.onboarding || null
  const onboardingItems = useMemo(() => (Array.isArray(onboarding?.items) ? onboarding.items : []), [onboarding?.items])
  const timeline = workspace.timeline || {}
  const summary = workspace.summary || {}
  const errorStatus = workspaceQuery.error?.response?.status

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
  const totalDocuments = documents.length || 0
  const totalInvoices = invoices.length || 0
  const outstandingAmount = summary.invoices?.outstanding_amount || invoices.reduce((sum, invoice) => sum + Number(invoice.outstanding_amount || 0), 0)
  const tabCounts = {
    overview: 4,
    onboarding: onboardingItems.length,
    projects: totalProjects,
    tasks: totalTasks,
    leads: totalLeads,
    documents: totalDocuments,
    invoices: totalInvoices,
    meetings: meetings.length,
    timeline: Array.isArray(timeline?.grouped_by_day) ? timeline.grouped_by_day.length : 0,
  }
  const transitionMissingFields = Array.isArray(transitionBlocker?.missing_fields) ? transitionBlocker.missing_fields : []

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
  const workspaceHealth = totalInvoices > 0
    ? `${formatCurrency(outstandingAmount || 0)} outstanding`
    : 'No billing activity yet'

  let tabBody
  if (activeTab === 'onboarding') {
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
        onCreateProject={(values) => createProjectMutation.mutate(values)}
        onCreateMeeting={(values) => createMeetingMutation.mutate(values)}
        onGenerateDocument={() => onboardingDocumentMutation.mutate()}
        saving={onboardingSaveMutation.isLoading}
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
      <CRMSection title="Documents" description="Files attached to the client account.">
        {documents.length ? (
          <div className="grid gap-3">
            {documents.map((document, index) => (
              <article key={`${document.url || document.name || index}`} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{document.name || document.original_name || 'Document'}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{document.type || 'file'} - {document.size ? `${(Number(document.size) / 1024).toFixed(2)} KB` : 'Size unavailable'}</p>
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
          <CRMEmptyState icon={FileText} title="No documents yet" description="Uploaded client documents will appear here." />
        )}
      </CRMSection>
    )
  } else if (activeTab === 'invoices') {
    tabBody = (
      <CRMSection title="Invoices" description="Billing raised for this client.">
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
      </CRMSection>
    )
  } else if (activeTab === 'meetings') {
    tabBody = (
      <CRMSection title="Meetings" description="Company meetings relevant to this client.">
        {meetings.length ? (
          <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    {['Meeting', 'Status', 'Date', 'Time', 'Duration', 'Participants'].map((header) => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {meetings.map((meeting) => (
                    <tr key={meeting.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/80">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{meeting.title}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{meeting.description || 'No description'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{meeting.status || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDate(meeting.meeting_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{meeting.meeting_time || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{meeting.duration ? `${meeting.duration} min` : 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{meeting.participant_ids?.length || 0}</td>
                    </tr>
                  ))}
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
      <CRMSection title="Timeline" description="Chronological client activity from the CRM and delivery stack.">
        <CompanyTimeline timeline={timeline} />
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
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">Delivery state</p>
              <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-200">
                <p>{projects.length} project(s)</p>
                <p>{tasks.length} task(s)</p>
                <p>{meetings.length} meeting(s)</p>
                <p>{totalDocuments} document(s)</p>
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
              <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{workspaceHealth}</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{primaryPhone}</p>
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
