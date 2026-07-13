import { useMemo } from 'react'
import { useQuery } from 'react-query'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Activity, Building2, CalendarDays, Clock3, DollarSign, ExternalLink, FileText, FolderKanban, Mail, Phone, Users } from 'lucide-react'
import { format } from 'date-fns'
import { clientsAPI } from '../api/clients'
import { Button, EmptyState, Skeleton } from '../components/ui'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../components/crm'
import { CompanyTimeline } from './crm/companies/components'
import { formatCurrency } from './crm/pipeline/utils'

const TAB_KEY = 'tab'
const TABS = [
  { key: 'overview', label: 'Overview' },
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
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'N/A'
  return format(parsed, 'MMM d, yyyy')
}

function formatDateTime(value) {
  if (!value) return 'N/A'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'N/A'
  return format(parsed, 'MMM d, yyyy h:mm a')
}

function clientFileUrl(url) {
  const baseUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000'
  return `${baseUrl}${url}`
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

export default function ClientWorkspacePage() {
  const navigate = useNavigate()
  const { clientId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab = searchParams.get(TAB_KEY) || 'overview'

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
  const timeline = workspace.timeline || {}
  const summary = workspace.summary || {}
  const errorStatus = workspaceQuery.error?.response?.status

  const setTab = (tab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (tab && tab !== 'overview') next.set(TAB_KEY, tab)
      else next.delete(TAB_KEY)
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
    projects: totalProjects,
    tasks: totalTasks,
    leads: totalLeads,
    documents: totalDocuments,
    invoices: totalInvoices,
    meetings: meetings.length,
    timeline: Array.isArray(timeline?.grouped_by_day) ? timeline.grouped_by_day.length : 0,
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
  const workspaceHealth = totalInvoices > 0
    ? `${formatCurrency(outstandingAmount || 0)} outstanding`
    : 'No billing activity yet'

  let tabBody
  if (activeTab === 'projects') {
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
                        <p className="font-medium text-gray-900 dark:text-gray-100">{project.name}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{project.key || project.project_id || project.id}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{project.status || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{project.budget ? formatCurrency(project.budget) : 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDate(project.start_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{formatDate(project.delivery_date)}</td>
                      <td className="px-4 py-3">
                        <Link className="btn btn-secondary btn-sm inline-flex items-center gap-2" to={`/projects/${project.project_id || project.id}/board`}>
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
                        <p className="font-medium text-gray-900 dark:text-gray-100">{task.title}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{task.id}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{task.status || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{task.priority || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-200">{task.project_id || 'N/A'}</td>
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
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 shadow-sm dark:border-gray-700 dark:bg-gray-900/90 dark:text-emerald-300">
              Active account workspace
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CRMStatCard icon={Building2} label="Client" value={client.name || '-'} tone="blue" helper={client.company_name || 'Client account'} />
        <CRMStatCard icon={FolderKanban} label="Projects" value={String(totalProjects)} tone="emerald" helper={projects[0]?.name || 'Linked projects'} />
        <CRMStatCard icon={DollarSign} label="Invoices" value={String(totalInvoices)} tone="amber" helper={formatCurrency(outstandingAmount || 0)} />
        <CRMStatCard icon={Clock3} label="Updated" value={formatDate(client.updated_at)} tone="slate" helper="Workspace freshness" />
      </div>

      <WorkspaceTabs activeTab={activeTab} onTabChange={setTab} counts={tabCounts} />

      {tabBody}
    </CRMPage>
  )
}
