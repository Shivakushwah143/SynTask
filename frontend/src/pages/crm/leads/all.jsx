// SynTask — All Leads (/crm/leads/all).
// A focused, full-list view of every lead in the account. Deliberately chart-free:
// this page exists so the Sales section tabs can offer a plain "all leads appear
// here" destination without the Leads dashboard analytics.
import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  Download,
  FileText,
  Filter,
  Layers,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Users,
  Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { usersAPI } from '../../../api/users'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, Skeleton } from '../../../components/ui'
import { useAuthStore } from '../../../store/authStore'
import { isEmployeeRole, normalizeRole } from '../../../utils/roles'
import {
  buildPipelineBoard,
  formatCurrency,
  getLeadContactLabel,
  getLeadDealValue,
  getLeadOwnerLabel,
  getLeadPriority,
  getLeadStageKey,
  getLeadTags,
  normalizeText,
} from '../pipeline/utils'
import { getOwnerName, parseLeadCustomFields, PriorityPill } from './page'
import { timeService } from '@/services/timeService'

export default function CRMAllLeadsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const userRole = normalizeRole(user?.role)
  const isEmployee = isEmployeeRole(userRole)
  const currentUserId = user?.id || user?._id || ''

  const context = useOutletContext()
  const [localSearch, setLocalSearch] = useState('')
  const leadSearch = context?.searchValue ?? localSearch
  const setLeadSearch = context?.setSearchValue || setLocalSearch
  const [stageFilter, setStageFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')

  const pipelineQuery = useQuery('crm-leads-entry', crmApi.getPipeline, { staleTime: 5 * 60 * 1000 })
  // Same full-list fetch as the Leads dashboard so both pages agree on data.
  const leadsQuery = useQuery(
    ['crm-all-leads', currentUserId],
    () => crmApi.getLeads({ skip: 0, limit: 500 }),
    { enabled: Boolean(currentUserId), staleTime: 60 * 1000 },
  )
  const usersQuery = useQuery('crm-lead-users', () => usersAPI.getAssignableUsers(), { staleTime: 5 * 60 * 1000 })

  const board = useMemo(() => buildPipelineBoard(pipelineQuery.data || {}), [pipelineQuery.data])
  const stages = useMemo(() => (Array.isArray(board?.stages) ? board.stages : []), [board])

  const allLeads = useMemo(() => {
    const direct =
      leadsQuery.data?.prospects ||
      leadsQuery.data?.items ||
      leadsQuery.data?.data?.prospects ||
      leadsQuery.data?.data?.items
    const raw = Array.isArray(direct) && direct.length > 0 ? direct : stages.flatMap((stage) => stage.leads || [])
    // Employees see only leads assigned to them; managers/admins see all (same as the dashboard).
    if (isEmployee && currentUserId) {
      return raw.filter((lead) => String(lead.assigned_to || lead.assignedTo || '').trim() === currentUserId)
    }
    return raw
  }, [leadsQuery.data, stages, isEmployee, currentUserId])

  const stageOptions = useMemo(() => {
    const stageSet = new Map()
    allLeads.forEach((lead) => {
      const key = getLeadStageKey(lead) || normalizeText(lead.current_stage || lead.stage || '')
      const label = lead.current_stage || lead.stage || key
      if (key) stageSet.set(key, label)
    })
    return Array.from(stageSet.entries()).map(([value, label]) => ({ value, label }))
  }, [allLeads])

  const totalPipelineValue = useMemo(() => allLeads.reduce((sum, lead) => sum + getLeadDealValue(lead), 0), [allLeads])
  const hotCount = useMemo(
    () => allLeads.filter((lead) => ['critical', 'high', 'hot'].includes(normalizeText(getLeadPriority(lead)))).length,
    [allLeads],
  )

  const userNameById = useMemo(() => {
    const map = new Map()
    const data = usersQuery.data
    const list = Array.isArray(data) ? data : Array.isArray(data?.users) ? data.users : Array.isArray(data?.items) ? data.items : []
    list.forEach((item) => {
      const id = String(item.id || item._id || '')
      const name = [item.first_name, item.last_name].filter(Boolean).join(' ').trim() || item.email
      if (id && name) map.set(id, name)
    })
    return map
  }, [usersQuery.data])

  const filteredLeads = useMemo(() => {
    const query = normalizeText(leadSearch)
    const stage = normalizeText(stageFilter)
    const priority = normalizeText(priorityFilter)
    return allLeads.filter((lead) => {
      const searchable = [
        lead.company_name,
        lead.prospect_name,
        lead.email,
        lead.phone,
        getLeadContactLabel(lead),
        getLeadOwnerLabel(lead),
        getLeadTags(lead).join(' '),
      ]
        .filter(Boolean)
        .map(normalizeText)
        .join(' ')
      if (query && !searchable.includes(query)) return false
      if (stage && getLeadStageKey(lead) !== stage) return false
      if (priority && getLeadPriority(lead) !== priority) return false
      return true
    })
  }, [allLeads, leadSearch, priorityFilter, stageFilter])

  const exportLeads = () => {
    if (!filteredLeads.length) {
      toast.error('No leads available to export')
      return
    }
    const headers = ['prospect_name', 'first_name', 'last_name', 'email', 'phone', 'country_code', 'company_name', 'current_stage', 'status', 'owner_name', 'tag', 'estimated_close_date']
    const escapeValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const rows = [
      headers.join(','),
      ...filteredLeads.map((lead) =>
        headers
          .map((key) => {
            const value = Array.isArray(lead[key]) ? lead[key].join('|') : lead[key]
            return escapeValue(value)
          })
          .join(','),
      ),
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `all-leads-${timeService.toUtcISOString(timeService.now()).slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success('Leads exported')
  }

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM"
        title="All Leads"
        description="Complete list of every lead in the account."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/crm/leads')}>
              <Plus className="h-4 w-4" />
              Add Lead
            </Button>
            <Button variant="secondary" onClick={exportLeads}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="secondary" onClick={() => leadsQuery.refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button variant="primary" onClick={() => navigate('/crm/pipeline')}>
              Pipeline
            </Button>
          </div>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CRMStatCard icon={Users} label="Total Leads" value={allLeads.length} helper="All records in the account" tone="blue" />
        <CRMStatCard icon={Layers} label="Pipeline Value" value={formatCurrency(totalPipelineValue, pipelineQuery.data?.meta?.currency || 'INR')} helper="Current opportunity value" tone="emerald" />
        <CRMStatCard icon={Zap} label="Hot Leads" value={hotCount} helper="High-intent prospects" tone="amber" />
        <CRMStatCard icon={Filter} label="Visible" value={filteredLeads.length} helper="After search & filters" tone="slate" />
      </div>

      <CRMSection
        title="Every Lead"
        description="Search, filter, and open any lead. Rows show the full list — no truncation."
        actions={<Badge label={`${filteredLeads.length} of ${allLeads.length} leads`} colorKey="draft" />}
      >
        <div className="mb-4 rounded-[24px] border border-primary-200/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-[#5a4635] dark:bg-black/60">
          <div className="grid gap-3 lg:grid-cols-[1fr,160px,160px,auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                className="input min-h-10 pl-10 w-full"
                value={leadSearch}
                onChange={(event) => setLeadSearch(event.target.value)}
                placeholder="Search leads, contacts, owner..."
              />
            </div>
            <select className="input min-h-10" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
              <option value="">All stages</option>
              {stageOptions.map((stage) => (
                <option key={stage.value} value={stage.value}>{stage.label}</option>
              ))}
            </select>
            <select className="input min-h-10" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              <option value="">All priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="hot">Hot</option>
              <option value="medium">Medium</option>
              <option value="warm">Warm</option>
              <option value="low">Low</option>
              <option value="cold">Cold</option>
            </select>
            <Button
              variant="secondary"
              onClick={() => {
                setLeadSearch('')
                setStageFilter('')
                setPriorityFilter('')
              }}
            >
              <Filter className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>

        {leadsQuery.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : leadsQuery.isError ? (
          <CRMEmptyState
            icon={Filter}
            title="Unable to load leads"
            description={leadsQuery.error?.response?.data?.detail || 'Try again after reloading.'}
            action={<Button variant="secondary" onClick={() => leadsQuery.refetch()}>Retry</Button>}
          />
        ) : filteredLeads.length ? (
          <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm dark:bg-black/80">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-surface-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-text-primary">Lead</th>
                    <th className="px-4 py-3 text-left font-semibold text-text-primary">Owner</th>
                    <th className="px-4 py-3 text-left font-semibold text-text-primary">Stage</th>
                    <th className="px-4 py-3 text-left font-semibold text-text-primary">Priority</th>
                    <th className="px-4 py-3 text-left font-semibold text-text-primary">Value</th>
                    <th className="px-4 py-3 text-left font-semibold text-text-primary">Status</th>
                    <th className="px-4 py-3 text-right font-semibold text-text-primary">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLeads.map((lead) => {
                    const leadId = lead.id || lead._id
                    const custom = parseLeadCustomFields(lead)
                    const meetingScheduled = Boolean(custom.meeting_scheduled)
                    const deadEnd = Boolean(custom.dead_end)
                    const priority = getLeadPriority(lead)
                    const key = getLeadStageKey(lead) || normalizeText(lead.current_stage || lead.stage || '')
                    return (
                      <tr
                        key={leadId}
                        className="hover:bg-surface-muted transition-colors cursor-pointer"
                        onClick={() => navigate(`/crm/leads/${leadId}`)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-text-primary">{lead.company_name || lead.prospect_name || 'Lead'}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                            {lead.email && (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {lead.email}
                              </span>
                            )}
                            {lead.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {lead.phone}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-primary">{getOwnerName(lead, userNameById)}</td>
                        <td className="px-4 py-3"><Badge label={lead.current_stage || lead.stage || 'Unstaged'} colorKey="draft" /></td>
                        <td className="px-4 py-3"><PriorityPill priority={priority} /></td>
                        <td className="px-4 py-3 font-semibold text-text-primary">{formatCurrency(getLeadDealValue(lead), pipelineQuery.data?.meta?.currency || 'INR')}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Badge
                              label={meetingScheduled ? 'Meeting' : 'No Meeting'}
                              colorKey={meetingScheduled ? 'scheduled' : 'draft'}
                            />
                            {deadEnd && <Badge label="Dead End" colorKey="danger" />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {['discovery', 'proposal'].includes(key) ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation()
                                navigate(`/crm/leads/${leadId}?tab=audit`)
                              }}
                            >
                              <FileText className="h-4 w-4" />
                              Quotation
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <CRMEmptyState
            icon={Users}
            title="No leads found"
            description={isEmployee ? 'No leads assigned to you yet.' : allLeads.length ? 'Clear filters to see all leads.' : 'No leads yet. Add your first lead to get started.'}
            action={allLeads.length
              ? <Button variant="secondary" onClick={() => { setLeadSearch(''); setStageFilter(''); setPriorityFilter('') }}>Clear filters</Button>
              : <Button variant="secondary" onClick={() => navigate('/crm/leads')}><Plus className="h-4 w-4" />Add Lead</Button>}
          />
        )}
      </CRMSection>
    </CRMPage>
  )
}
