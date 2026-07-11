import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Filter, MoveRight, PhoneCall, Search, TimerReset, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { salesApi } from '../../api/sales'
import { usersAPI } from '../../api/users'
import { Badge, Button, EmptyState, PageHeader, SkeletonTable, inputClassName } from '../../components/ui'
import { asArray, formatDate, formatMoney, getId } from '../phase4Utils'

const priorityTone = {
  high: 'danger',
  medium: 'warning',
  low: 'success',
}

const normalizeText = (value) => String(value || '').trim().toLowerCase()

export default function SalesPipeline() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')

  const prospectsQuery = useQuery(['sales-queue-prospects', search, stageFilter, ownerFilter, priorityFilter], () => salesApi.getLeads({ limit: 200 }), {
    staleTime: 60 * 1000,
  })
  const stagesQuery = useQuery('sales-queue-stages', salesApi.getStages, { staleTime: 5 * 60 * 1000 })
  const usersQuery = useQuery('sales-queue-users', () => usersAPI.getAssignableUsers(), { staleTime: 5 * 60 * 1000 })

  const prospects = asArray(prospectsQuery.data, ['prospects', 'items'])
  const stages = asArray(stagesQuery.data, ['stages'])
  const users = asArray(usersQuery.data, ['users', 'items'])

  const stageOptions = useMemo(() => stages.map((stage) => ({
    id: getId(stage) || stage.key || stage.name,
    name: stage.name || stage.label || stage.key || 'Stage',
  })), [stages])

  const queueItems = useMemo(() => {
    const query = normalizeText(search)
    return prospects
      .filter((item) => {
        const haystack = [
          item.prospect_name,
          item.first_name,
          item.last_name,
          item.company_name,
          item.email,
          item.phone,
          item.owner_name,
          item.assigned_to_name,
        ].map(normalizeText).join(' ')

        const matchesSearch = !query || haystack.includes(query)
        const matchesStage = !stageFilter || normalizeText(item.current_stage || item.stage) === normalizeText(stageFilter)
        const ownerId = item.assigned_to || item.owner_id || item.assigned_to_id || item.owner
        const matchesOwner = !ownerFilter || String(ownerId || '').toLowerCase() === String(ownerFilter).toLowerCase()
        const matchesPriority = !priorityFilter || normalizeText(item.priority || item.interest_level) === normalizeText(priorityFilter)
        return matchesSearch && matchesStage && matchesOwner && matchesPriority
      })
      .sort((a, b) => {
        const priorityRank = { high: 0, medium: 1, low: 2 }
        const aPriority = priorityRank[normalizeText(a.priority || a.interest_level)] ?? 3
        const bPriority = priorityRank[normalizeText(b.priority || b.interest_level)] ?? 3
        if (aPriority !== bPriority) return aPriority - bPriority
        return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
      })
  }, [ownerFilter, priorityFilter, prospects, search, stageFilter])

  const startMeetingMutation = useMutation(
    (prospect) => {
      const customFields = typeof prospect.custom_fields === 'string'
        ? (() => { try { return JSON.parse(prospect.custom_fields) || {} } catch { return {} } })()
        : (prospect.custom_fields || {})
      return salesApi.updateLeadForm(getId(prospect), {
        custom_fields: JSON.stringify({ ...customFields, meeting_scheduled: true, meeting_scheduled_at: new Date().toISOString() }),
      })
    },
    {
      onSuccess: () => {
        toast.success('Meeting marked as scheduled')
        queryClient.invalidateQueries('sales-queue-prospects')
        queryClient.invalidateQueries('sales-pipeline-prospects')
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Could not update lead')
      },
    }
  )

  const assignedCount = queueItems.filter((item) => item.assigned_to || item.assigned_to_name || item.owner_name).length
  const unassignedCount = queueItems.length - assignedCount
  const readyCount = queueItems.filter((item) => ['new', 'contacted', 'qualified', 'discovery', 'proposal', 'negotiation'].includes(normalizeText(item.current_stage || item.stage))).length

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Sales Queue"
        description="Active leads ready for follow-up, ownership, and next-step actions."
        actions={(
          <>
            <Button variant="secondary" onClick={() => queryClient.invalidateQueries('sales-queue-prospects')}>
              Refresh
            </Button>
            <Button onClick={() => navigate('/sales/prospects?createProspect=true')}>
              New Lead
            </Button>
          </>
        )}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard label="In queue" value={queueItems.length} helper="Visible leads after filters." />
        <StatCard label="Ready to work" value={readyCount} helper="New through negotiation." />
        <StatCard label="Assigned" value={assignedCount} helper="Currently owned by a user." />
        <StatCard label="Unassigned" value={unassignedCount} helper="Needs routing or owner review." />
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className={`${inputClassName} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lead, company, email, owner..." />
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Stage</span>
          <select className={inputClassName} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="">All stages</option>
            {stageOptions.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Priority</span>
          <select className={inputClassName} value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
            <option value="">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Owner</span>
          <select className={inputClassName} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
            <option value="">All owners</option>
            {users.map((user) => (
              <option key={getId(user)} value={getId(user)}>
                {user.first_name} {user.last_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        {prospectsQuery.isLoading ? (
          <SkeletonTable rows={8} cols={8} />
        ) : prospectsQuery.isError ? (
          <EmptyState icon={Users} title="Could not load sales queue" description="Try refreshing the queue." action={<Button onClick={() => prospectsQuery.refetch()}>Retry</Button>} />
        ) : queueItems.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Lead</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Company</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Owner</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Stage</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Value</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Updated</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {queueItems.map((item) => {
                  const id = getId(item)
                  const ownerName = item.owner_name || item.assigned_to_name || item.assigned_to || 'Unassigned'
                  const stageName = item.current_stage || item.stage || 'New'
                  const priority = normalizeText(item.priority || item.interest_level || 'medium')
                  return (
                    <tr key={id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => navigate(`/sales/prospects/${id}`)} className="text-left font-medium text-primary-700 hover:underline">
                          {item.prospect_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Lead'}
                        </button>
                        <p className="mt-1 text-xs text-gray-500">{item.email || item.phone || '-'}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{item.company_name || '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{ownerName}</td>
                      <td className="px-4 py-3"><Badge label={stageName} colorKey="draft" /></td>
                      <td className="px-4 py-3">
                        <Badge label={priority} colorKey={priorityTone[priority] || 'draft'} />
                      </td>
                      <td className="px-4 py-3 text-gray-900">{formatMoney(item.won_amount || item.expected_value || item.value)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(item.updated_at || item.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={() => navigate(`/sales/prospects/${id}`)}>
                            Open
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => startMeetingMutation.mutate(item)}
                            loading={startMeetingMutation.isLoading && startMeetingMutation.variables && getId(startMeetingMutation.variables) === id}
                          >
                            <PhoneCall className="h-4 w-4" />
                            Start Meeting
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Filter}
            title="No leads in queue"
            description="Clear filters or create a new lead to populate the queue."
            action={<Link className="inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700" to="/sales/prospects?createProspect=true">Create lead</Link>}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1">
          <TimerReset className="h-3.5 w-3.5" />
          Sorted by priority and most recent activity
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1">
          <MoveRight className="h-3.5 w-3.5" />
          Keeps existing lead records and stage history
        </span>
      </div>
    </div>
  )
}

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="mt-2 text-sm text-gray-500">{helper}</p>
    </div>
  )
}
