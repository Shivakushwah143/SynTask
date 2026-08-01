import { memo } from 'react'
import { format } from 'date-fns'
import { Building2, CalendarDays, CircleDot, Clock3, FileText, Phone, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Button, EmptyState } from '../../../components/ui'
import { CRMEmptyState, CRMSection, CRMStatCard } from '../../../components/crm'
import { COMPANY_TABS } from './constants'
import { timeService } from '@/services/timeService'

export const CompanyTabs = memo(function CompanyTabs({ activeTab, onTabChange }) {
  return (
    <nav aria-label="Company workspace sections" className="overflow-x-auto rounded-2xl border border-surface-border/80 bg-white/90 p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900/85">
      <div className="flex min-w-max items-center gap-2">
        {COMPANY_TABS.map((tab) => {
          const isActive = activeTab === tab.key
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
            </button>
          )
        })}
      </div>
    </nav>
  )
})

export const CompanyOverview = memo(function CompanyOverview({ company, contacts = [], leads = [] }) {
  const items = [
    { label: 'Primary contact', value: company?.primary_contact_name || 'Not set' },
    { label: 'Contacts', value: contacts.length },
    { label: 'Leads', value: leads.length },
    { label: 'Industry', value: company?.industry || 'N/A' },
    { label: 'Size', value: company?.company_size || 'N/A' },
    { label: 'Website', value: company?.website || 'N/A' },
    { label: 'Email', value: company?.email || 'N/A' },
    { label: 'Phone', value: company?.phone || 'N/A' },
    { label: 'Created', value: company?.created_at ? timeService.formatPattern(company.created_at, 'MMM d, yyyy') : 'N/A' },
    { label: 'Updated', value: company?.updated_at ? timeService.formatPattern(company.updated_at, 'MMM d, yyyy') : 'N/A' },
  ]

  return (
    <CRMSection title="Overview" description="Company source of truth for CRM accounts and related people.">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article key={item.label} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">{item.label}</p>
            <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{item.value}</p>
          </article>
        ))}
      </div>
    </CRMSection>
  )
})

export const CompanyStats = memo(function CompanyStats({ company, contacts = [], leads = [] }) {
  const openLeads = leads.filter((lead) => !['won', 'lost', 'closed'].includes(String(lead?.status || '').toLowerCase())).length
  const primary = contacts.find((contact) => contact.is_primary_contact)

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <CRMStatCard icon={Building2} label="Company" value={company?.name || '-'} tone="blue" />
      <CRMStatCard icon={Users} label="Contacts" value={String(contacts.length)} tone="emerald" helper={primary ? `${primary.full_name || `${primary.first_name} ${primary.last_name}`}` : 'No primary contact yet'} />
      <CRMStatCard icon={CircleDot} label="Open leads" value={String(openLeads)} tone="amber" helper="Linked leads in active motion." />
      <CRMStatCard icon={Clock3} label="Last updated" value={company?.updated_at ? timeService.formatPattern(company.updated_at, 'MMM d, yyyy') : 'N/A'} tone="slate" />
    </div>
  )
})

export const CompanyPlaceholderTab = memo(function CompanyPlaceholderTab({ title, description, icon: Icon = Sparkles }) {
  return (
    <CRMSection title={title} description={description}>
      <CRMEmptyState
        icon={Icon}
        title={`${title} coming soon`}
        description="This section exists in the company workspace contract and is ready for future data without changing the layout."
      />
    </CRMSection>
  )
})

export const CompanyLeadTable = memo(function CompanyLeadTable({ leads = [] }) {
  if (!leads.length) {
    return (
      <CRMEmptyState
        icon={FileText}
        title="No leads linked"
        description="Leads will appear here once they are connected to this company."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-gray-950">
            <tr>
              {['Lead', 'Stage', 'Owner', 'Value', 'Status', 'Updated'].map((header) => (
                <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/80">
                <td className="px-4 py-3">
                  <Link className="font-medium text-primary-700 hover:underline dark:text-primary-300" to={`/crm/leads/${lead.id}`}>
                    {lead.prospect_name || lead.company_name || 'Lead'}
                  </Link>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{lead.email || lead.phone || 'No contact info'}</p>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{lead.current_stage || 'N/A'}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{lead.owner_name || lead.assigned_to || 'Unassigned'}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{lead.won_amount ? `${lead.won_amount}` : '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{lead.status || 'active'}</td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{lead.updated_at ? timeService.formatPattern(lead.updated_at, 'MMM d, yyyy') : 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
})

export const CompanyTimeline = memo(function CompanyTimeline({ timeline }) {
  const grouped = Array.isArray(timeline?.grouped_by_day) ? timeline.grouped_by_day : []

  if (!grouped.length) {
    return (
      <CRMEmptyState
        icon={CalendarDays}
        title="No timeline activity"
        description="Company, contact and lead actions will appear here once the workspace is used."
      />
    )
  }

  return (
    <div className="space-y-5">
      {grouped.map((group) => (
        <section key={group.date} className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
              {timeService.formatDateOnly(group.date)}
            </h3>
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
          </div>
          <div className="space-y-3">
            {group.items.map((item) => (
              <article key={item.id} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</p>
                      <Badge label={item.category} colorKey="draft" />
                    </div>
                    <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{item.description}</p>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{item.actor || 'System'}</p>
                  </div>
                  <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                    <p>{item.timestamp ? timeService.formatPattern(item.timestamp, 'h:mm a') : ''}</p>
                  </div>
                </div>
                {item.metadata ? (
                  <pre className="mt-4 overflow-x-auto rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-950 dark:text-gray-300">
                    {JSON.stringify(item.metadata, null, 2)}
                  </pre>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
})

export const CompanyAccessDeniedState = memo(function CompanyAccessDeniedState({ onBack }) {
  return (
    <CRMSection title="Company workspace" description="Access is controlled by the Sales module permission.">
      <EmptyState
        icon={Phone}
        title="Access denied"
        description="You do not have access to this CRM company workspace. Ask an administrator to enable the sales module for your account."
        action={<Button variant="primary" onClick={onBack}>Back to companies</Button>}
      />
    </CRMSection>
  )
})
