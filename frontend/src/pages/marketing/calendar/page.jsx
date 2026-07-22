import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { CalendarDays, CheckCircle2, FileText, Filter, LayoutGrid, PencilLine, Send, Sparkles } from 'lucide-react'
import { format, isValid, parseISO } from 'date-fns'
import { contentCalendarApi } from '../../../api/contentCalendar'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Skeleton } from '../../../components/ui'
import { useAuthStore } from '../../../store/authStore'
import { normalizeRole } from '../../../utils/roles'
import { asArray } from '../../phase4Utils'

const QUERY_KEY = 'marketing-calendar'

const TAB_DEFS = [
  { key: 'plan', label: 'Plan', statuses: ['draft', 'planned', 'shoot_scheduled'], icon: PencilLine },
  { key: 'review', label: 'Review', statuses: ['shot', 'editing', 'internal_review'], icon: LayoutGrid },
  { key: 'approve', label: 'Approve', statuses: ['client_review', 'approved'], icon: CheckCircle2 },
  { key: 'publish', label: 'Publish', statuses: ['scheduled', 'published'], icon: Send },
]

const STATUS_TONE = {
  draft: 'draft',
  planned: 'scheduled',
  shoot_scheduled: 'scheduled',
  shot: 'completed',
  editing: 'draft',
  internal_review: 'draft',
  client_review: 'warning',
  approved: 'completed',
  scheduled: 'scheduled',
  published: 'completed',
}

const ROLE_LABEL = {
  admin: 'Admin',
  manager: 'Manager',
  lead: 'Team Lead',
  employee: 'Content Creator',
  client: 'Client',
}

function safeDate(value) {
  if (!value) return null
  const date = parseISO(String(value))
  return isValid(date) ? date : null
}

export default function MarketingCalendarPage() {
  const { user } = useAuthStore()
  const role = normalizeRole(user?.role)
  const isClient = role === 'client'
  const [activeTab, setActiveTab] = useState('plan')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading, isError, refetch } = useQuery(
    [QUERY_KEY],
    () => contentCalendarApi.getCalendar(),
    { staleTime: 60 * 1000 }
  )

  const items = asArray(data, ['items'])
  const groupedCounts = useMemo(() => {
    const counts = { plan: 0, review: 0, approve: 0, publish: 0 }
    items.forEach((item) => {
      const group = TAB_DEFS.find((tab) => tab.statuses.includes(String(item.status || '').toLowerCase()))
      if (group) counts[group.key] += 1
    })
    return counts
  }, [items])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      const status = String(item.status || '').toLowerCase()
      const currentTab = TAB_DEFS.find((tab) => tab.key === activeTab)
      const matchesTab = currentTab ? currentTab.statuses.includes(status) : true
      const matchesStatus = !statusFilter || status === statusFilter
      const matchesSearch = !q || [item.title, item.campaign, item.platform, item.content_type, item.description, item.caption, item.tags?.join(', ')].some((value) => String(value || '').toLowerCase().includes(q))
      return matchesTab && matchesStatus && matchesSearch
    })
  }, [activeTab, items, search, statusFilter])

  const visibleFields = (item) => ({
    title: item.title || 'Untitled',
    status: String(item.status || 'draft').toLowerCase(),
    publishDate: safeDate(item.publish_date),
    dueDate: safeDate(item.due_date),
    clientApprovalStatus: item.clientApprovalStatus || item.client_approval_status || item.status || 'pending',
    campaign: item.campaign || '-',
    platform: item.platform || '-',
    contentType: item.content_type || '-',
    assignedWriter: item.assignedWriter || item.assigned_writer || item.assignee_name || item.assignee_id || '-',
    assignedReviewer: item.assignedReviewer || item.assigned_reviewer || '-',
    caption: item.caption || '-',
    hashtags: Array.isArray(item.tags) ? item.tags.join(' ') : item.hashtags || '-',
    mediaPreview: item.mediaPreview || item.media_preview || item.file_urls?.[0] || null,
    feedback: item.feedback || item.client_feedback || '-',
    internalNotes: item.notes || item.internal_notes || '-',
    referenceLinks: Array.isArray(item.file_urls) ? item.file_urls : Array.isArray(item.referenceLinks) ? item.referenceLinks : [],
  })

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="Marketing"
        title="Content Calendar"
        description={isClient ? 'Client view of approved and pending content.' : 'One calendar for planning, review, approval, and publishing.'}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge label={ROLE_LABEL[role] || role || 'Viewer'} colorKey="draft" />
            <Badge label={`${items.length} items`} colorKey="draft" />
          </div>
        )}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <CRMStatCard icon={PencilLine} label="Plan" value={String(groupedCounts.plan)} tone="blue" />
        <CRMStatCard icon={LayoutGrid} label="Review" value={String(groupedCounts.review)} tone="amber" />
        <CRMStatCard icon={CheckCircle2} label="Approve" value={String(groupedCounts.approve)} tone="emerald" />
        <CRMStatCard icon={Send} label="Publish" value={String(groupedCounts.publish)} tone="slate" />
      </section>

      <CRMSection title="Workflow" description="Use one source of truth and switch by stage instead of duplicating calendars.">
        <div className="flex flex-wrap items-center gap-2">
          {TAB_DEFS.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-900 dark:bg-primary-950/60 dark:text-primary-200'
                    : 'border-surface-border bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {groupedCounts[tab.key]}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Search</span>
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, caption, platform, campaign" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Status</span>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              {['draft', 'planned', 'shoot_scheduled', 'shot', 'editing', 'internal_review', 'client_review', 'approved', 'scheduled', 'published'].map((status) => (
                <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </label>
        </div>
      </CRMSection>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <CRMSection
          title={`${TAB_DEFS.find((tab) => tab.key === activeTab)?.label || 'Plan'} items`}
          description={isClient ? 'Client-safe details only. Internal notes are hidden.' : 'Internal and client-facing sections are split for clarity.'}
        >
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-36 w-full rounded-3xl" />)}
            </div>
          ) : isError ? (
            <CRMEmptyState
              icon={Filter}
              title="Unable to load calendar"
              description="Try again after reloading."
              action={<button type="button" className="btn btn-secondary" onClick={() => refetch()}>Retry</button>}
            />
          ) : filteredItems.length ? (
            <div className="space-y-4">
              {filteredItems.map((item) => <MarketingCalendarCard key={item.id} isClient={isClient} fields={visibleFields(item)} />)}
            </div>
          ) : (
            <CRMEmptyState
              icon={CalendarDays}
              title="No items in this stage"
              description="Try another tab or create the first content item."
            />
          )}
        </CRMSection>

        <div className="space-y-6">
          <CRMSection title="Display rules" description="Internal content stays inside the team view.">
            <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <p>Internal section: notes, assignees, reviewer, and workflow actions.</p>
              <p>Client section: caption, preview, references, approval, and feedback only.</p>
              <p>Client users never see internal notes.</p>
            </div>
          </CRMSection>

          <CRMSection title="Recommended use" description="Keep the same route, change the depth by role.">
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <p><span className="font-semibold text-gray-900 dark:text-gray-100">Manager:</span> Review and approve.</p>
              <p><span className="font-semibold text-gray-900 dark:text-gray-100">Lead:</span> Plan and assign work.</p>
              <p><span className="font-semibold text-gray-900 dark:text-gray-100">Client:</span> Approve or request changes only.</p>
            </div>
          </CRMSection>
        </div>
      </section>
    </CRMPage>
  )
}

function MarketingCalendarCard({ isClient, fields }) {
  const dueDate = fields.dueDate ? format(fields.dueDate, 'PPP p') : '-'
  const publishDate = fields.publishDate ? format(fields.publishDate, 'PPP p') : '-'
  return (
    <article className="rounded-3xl border border-surface-border/80 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fields.title}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{fields.platform} · {fields.campaign}</p>
        </div>
        <Badge label={fields.status.replace(/_/g, ' ')} colorKey={STATUS_TONE[fields.status] || 'draft'} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-surface-border/80 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <Sparkles className="h-4 w-4 text-primary-600" />
            Client section
          </div>
          <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p><span className="font-medium text-gray-900 dark:text-gray-100">Caption:</span> {fields.caption}</p>
            <p><span className="font-medium text-gray-900 dark:text-gray-100">Hashtags:</span> {fields.hashtags}</p>
            <p><span className="font-medium text-gray-900 dark:text-gray-100">Approval:</span> {String(fields.clientApprovalStatus).replace(/_/g, ' ')}</p>
            <p><span className="font-medium text-gray-900 dark:text-gray-100">Feedback:</span> {fields.feedback}</p>
            <p><span className="font-medium text-gray-900 dark:text-gray-100">Preview:</span> {fields.mediaPreview || 'No preview uploaded'}</p>
            {!!fields.referenceLinks.length && (
              <p><span className="font-medium text-gray-900 dark:text-gray-100">References:</span> {fields.referenceLinks.join(', ')}</p>
            )}
          </div>
        </section>

        <section className={`rounded-2xl border border-surface-border/80 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 ${isClient ? 'hidden' : ''}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <FileText className="h-4 w-4 text-amber-600" />
            Internal section
          </div>
          <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p><span className="font-medium text-gray-900 dark:text-gray-100">Assigned writer:</span> {fields.assignedWriter}</p>
            <p><span className="font-medium text-gray-900 dark:text-gray-100">Assigned reviewer:</span> {fields.assignedReviewer}</p>
            <p><span className="font-medium text-gray-900 dark:text-gray-100">Due date:</span> {dueDate}</p>
            <p><span className="font-medium text-gray-900 dark:text-gray-100">Publish date:</span> {publishDate}</p>
            <p><span className="font-medium text-gray-900 dark:text-gray-100">Internal notes:</span> {fields.internalNotes}</p>
          </div>
        </section>
      </div>
    </article>
  )
}
