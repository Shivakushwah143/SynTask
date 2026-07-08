import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, Download, Filter, Import, Merge, Plus, Sparkles, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { salesApi } from '../../../api/sales'
import { usersAPI } from '../../../api/users'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, Modal, Skeleton, inputClassName } from '../../../components/ui'
import BulkImportProspectsModal from '../../../components/BulkImportProspectsModal'
import { useAuthStore } from '../../../store/authStore'
import { isEmployeeRole, normalizeRole } from '../../../utils/roles'

export default function CRMLeadsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const userRole = normalizeRole(user?.role)
  const isEmployee = isEmployeeRole(userRole)
  const currentUserId = user?.id || user?._id || ''
  const [mergeGroup, setMergeGroup] = useState(null)
  const [importOpen, setImportOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    first_name: '',
    last_name: '',
    country_code: '+91',
    phone: '',
    email: '',
    company_name: '',
    category_id: '',
    product_ids: '',
    current_stage: '',
    assigned_to: '',
    interest_level: 'medium',
    estimated_close_date: '',
    remark: '',
    tag: '',
  })
  const [selectedIds, setSelectedIds] = useState([])
  const pipelineQuery = useQuery('crm-leads-entry', crmApi.getPipeline, {
    staleTime: 5 * 60 * 1000,
  })
  const leadsQuery = useQuery(
    ['crm-all-leads', userRole],
    () => crmApi.getLeads({ skip: 0, limit: 200 }),
    {
      enabled: !isEmployee,
      staleTime: 60 * 1000,
    }
  )
  const assignedLeadsQuery = useQuery(
    ['crm-assigned-leads', currentUserId],
    () => crmApi.getLeads({ assigned_to: currentUserId, limit: 200, skip: 0 }),
    {
      enabled: isEmployee && Boolean(currentUserId),
      staleTime: 60 * 1000,
    }
  )
  const duplicatesQuery = useQuery('crm-lead-duplicates', () => salesApi.getDuplicateProspects({}), {
    staleTime: 60 * 1000,
    enabled: !isEmployee,
  })
  const categoriesQuery = useQuery('crm-lead-categories', salesApi.getCategories, { staleTime: 5 * 60 * 1000 })
  const stagesQuery = useQuery('crm-lead-stages', salesApi.getStages, { staleTime: 5 * 60 * 1000 })
  const usersQuery = useQuery('crm-lead-users', () => usersAPI.getAssignableUsers(), { staleTime: 5 * 60 * 1000 })
  const productsQuery = useQuery('crm-lead-products', salesApi.getProducts, { staleTime: 5 * 60 * 1000 })

  const board = useMemo(() => pipelineQuery.data || {}, [pipelineQuery.data])
  const stages = useMemo(() => (Array.isArray(board?.stages) ? board.stages : []), [board])
  const leadCount = useMemo(() => stages.reduce((sum, stage) => sum + (stage.leads?.length || 0), 0), [stages])
  const activeCount = useMemo(() => stages.reduce((sum, stage) => sum + (stage.leads || []).filter((lead) => !['won', 'lost', 'closed'].includes(String(lead?.status || '').toLowerCase())).length, 0), [stages])
  const recentLeads = useMemo(() => stages.flatMap((stage) => stage.leads || []).slice(0, 6), [stages])
  const allAccountLeads = useMemo(() => {
    const items = leadsQuery.data?.prospects || leadsQuery.data?.items || leadsQuery.data?.data?.prospects || leadsQuery.data?.data?.items || []
    return Array.isArray(items) ? items : []
  }, [leadsQuery.data])
  const duplicateGroups = useMemo(() => duplicatesQuery.data?.groups || duplicatesQuery.data?.data?.groups || [], [duplicatesQuery.data])
  const allLeads = useMemo(() => stages.flatMap((stage) => stage.leads || []), [stages])
  const selectedLeads = useMemo(() => allLeads.filter((lead) => selectedIds.includes(lead.id || lead._id)), [allLeads, selectedIds])
  const employeeLeads = useMemo(() => {
    const items = assignedLeadsQuery.data?.data?.prospects
      || assignedLeadsQuery.data?.prospects
      || assignedLeadsQuery.data?.data?.items
      || assignedLeadsQuery.data?.items
      || []
    return Array.isArray(items) ? items : []
  }, [assignedLeadsQuery.data])
  const assignableUsers = useMemo(() => {
    const data = usersQuery.data
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.users)) return data.users
    if (Array.isArray(data?.items)) return data.items
    return []
  }, [usersQuery.data])
  const categories = useMemo(() => (Array.isArray(categoriesQuery.data?.categories) ? categoriesQuery.data.categories : []), [categoriesQuery.data])
  const products = useMemo(() => (Array.isArray(productsQuery.data?.products) ? productsQuery.data.products : []), [productsQuery.data])
  const defaultStageId = stages[0]?.id || stages[0]?.name || ''
  const defaultCategoryId = categories[0]?.id || categories[0]?._id || ''
  const defaultProductIds = products[0]?.id || products[0]?._id || ''

  useEffect(() => {
    if (!createOpen) return
    setCreateForm((state) => ({
      ...state,
      category_id: state.category_id || defaultCategoryId,
      product_ids: state.product_ids || defaultProductIds,
      current_stage: state.current_stage || defaultStageId,
      assigned_to: state.assigned_to || assignableUsers[0]?.id || '',
    }))
  }, [assignableUsers, createOpen, defaultCategoryId, defaultProductIds, defaultStageId])

  const mergeMutation = useMutation((payload) => crmApi.mergeProspects(payload), {
    onSuccess: () => {
      toast.success('Leads merged')
      queryClient.invalidateQueries('crm-leads-entry')
      queryClient.invalidateQueries('crm-lead-duplicates')
      queryClient.invalidateQueries('crm-pipeline-board')
      setMergeGroup(null)
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || 'Unable to merge leads')
    },
  })

  const createLeadMutation = useMutation(
    (payload) => salesApi.createProspect(payload),
    {
      onSuccess: () => {
        toast.success('Lead created')
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('crm-pipeline-board')
        queryClient.invalidateQueries('crm-lead-duplicates')
        queryClient.invalidateQueries('sales-prospects')
        setCreateOpen(false)
        setCreateForm({
          first_name: '',
          last_name: '',
          country_code: '+91',
          phone: '',
          email: '',
          company_name: '',
          category_id: defaultCategoryId,
          product_ids: defaultProductIds,
          current_stage: defaultStageId,
          assigned_to: '',
          interest_level: 'medium',
          estimated_close_date: '',
          remark: '',
          tag: '',
        })
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Unable to create lead')
      },
    }
  )

  const exportLeads = () => {
    if (!allLeads.length) {
      toast.error('No leads available to export')
      return
    }

    const headers = ['prospect_name', 'first_name', 'last_name', 'email', 'phone', 'country_code', 'company_name', 'current_stage', 'status', 'owner_name', 'tag', 'estimated_close_date']
    const escapeValue = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const rows = [
      headers.join(','),
      ...allLeads.map((lead) => headers.map((key) => {
        const value = Array.isArray(lead[key]) ? lead[key].join('|') : lead[key]
        return escapeValue(value)
      }).join(',')),
    ]

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `crm-leads-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    toast.success('Leads exported')
  }

  const bulkMutation = useMutation(async (payload) => {
    const updates = payload.lead_ids.map((leadId) => salesApi.updateProspectForm(leadId, payload.fields))
    return Promise.all(updates)
  }, {
    onSuccess: () => {
      toast.success('Leads updated')
      queryClient.invalidateQueries('crm-leads-entry')
      queryClient.invalidateQueries('crm-lead-duplicates')
      queryClient.invalidateQueries('crm-pipeline-board')
      setBulkOpen(false)
      setSelectedIds([])
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || 'Bulk update failed')
    },
  })

  const statusMutation = useMutation(
    ({ leadId, customFields }) => salesApi.updateProspectForm(leadId, { custom_fields: JSON.stringify(customFields) }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('crm-pipeline-board')
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Could not update lead status')
      },
    }
  )

  const employeeStatusMutation = useMutation(
    ({ leadId, customFields }) => salesApi.updateProspectForm(leadId, { custom_fields: JSON.stringify(customFields) }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['crm-assigned-leads', currentUserId])
        queryClient.invalidateQueries('crm-pipeline-board')
        queryClient.invalidateQueries('crm-leads-entry')
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Could not update lead status')
      },
    }
  )

  const getEmployeeLeadFlags = (lead) => {
    const custom = (() => {
      if (typeof lead?.custom_fields === 'string') {
        try { return JSON.parse(lead.custom_fields) || {} } catch { return {} }
      }
      return lead?.custom_fields || {}
    })()
    return {
      custom,
      meetingScheduled: Boolean(custom.meeting_scheduled),
      deadEnd: Boolean(custom.dead_end),
    }
  }

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM"
        title="Leads"
        description={isEmployee ? 'Review your assigned leads and update meeting status.' : 'Open a lead from the pipeline to view its workspace.'}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {!isEmployee && (
              <>
                <Button variant="secondary" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add Lead
                </Button>
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  <Import className="h-4 w-4" />
                  Import CSV
                </Button>
                <Button variant="secondary" onClick={exportLeads}>
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button variant="secondary" onClick={() => setBulkOpen(true)} disabled={!selectedIds.length}>
                  Bulk update
                </Button>
              </>
            )}
            <Button variant="primary" onClick={() => navigate('/crm/pipeline')}>
              Open Pipeline
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CRMStatCard icon={Users} label="Total leads" value={String(leadCount)} tone="blue" />
        <CRMStatCard icon={Sparkles} label="Active leads" value={String(activeCount)} tone="emerald" />
        <CRMStatCard icon={CalendarDays} label="Pipeline stages" value={String(stages.length)} tone="amber" />
      </div>

      <CRMSection
        title="Lead entry points"
        description="The CRM lead workspace lives at /crm/leads/:leadId. Start from the pipeline or related activity screens."
        actions={<Badge label="Sales module" colorKey="draft" />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>
            Go to Pipeline
          </Button>
          <Button variant="secondary" onClick={() => navigate('/crm/activities')}>
            View Activities
          </Button>
          <Button variant="secondary" onClick={() => navigate('/crm/companies')}>
            Open Companies
          </Button>
        </div>
      </CRMSection>

      {!isEmployee && (
        <Modal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Add Lead"
          size="lg"
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              const payload = {
                first_name: createForm.first_name.trim(),
                last_name: createForm.last_name.trim(),
                country_code: createForm.country_code.trim() || '+91',
                phone: createForm.phone.trim(),
                email: createForm.email.trim(),
                company_name: createForm.company_name.trim(),
                category_id: createForm.category_id || defaultCategoryId,
                product_ids: createForm.product_ids || defaultProductIds,
                current_stage: createForm.current_stage || defaultStageId,
                assigned_to: createForm.assigned_to || (assignableUsers[0]?.id || ''),
                interest_level: createForm.interest_level || 'medium',
                estimated_close_date: createForm.estimated_close_date || new Date().toISOString().slice(0, 10),
                remark: createForm.remark.trim(),
                tag: createForm.tag.trim(),
              }

              if (!payload.first_name || !payload.last_name || !payload.phone) {
                toast.error('First name, last name, and phone are required')
                return
              }
              if (!payload.category_id || !payload.product_ids || !payload.current_stage || !payload.assigned_to) {
                toast.error('Select category, product, stage, and owner')
                return
              }
              createLeadMutation.mutate(payload)
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">First name</span>
                <input className={inputClassName} placeholder="First name" value={createForm.first_name} onChange={(e) => setCreateForm((state) => ({ ...state, first_name: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Last name</span>
                <input className={inputClassName} placeholder="Last name" value={createForm.last_name} onChange={(e) => setCreateForm((state) => ({ ...state, last_name: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Country code</span>
                <input className={inputClassName} placeholder="Country code" value={createForm.country_code} onChange={(e) => setCreateForm((state) => ({ ...state, country_code: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Phone</span>
                <input className={inputClassName} placeholder="Phone" value={createForm.phone} onChange={(e) => setCreateForm((state) => ({ ...state, phone: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Email</span>
                <input className={inputClassName} placeholder="Email" value={createForm.email} onChange={(e) => setCreateForm((state) => ({ ...state, email: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Company name</span>
                <input className={inputClassName} placeholder="Company name" value={createForm.company_name} onChange={(e) => setCreateForm((state) => ({ ...state, company_name: e.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Select category</span>
                <select className={inputClassName} value={createForm.category_id || defaultCategoryId} onChange={(e) => setCreateForm((state) => ({ ...state, category_id: e.target.value }))}>
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id || category._id} value={category.id || category._id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Select product</span>
                <select className={inputClassName} value={createForm.product_ids || defaultProductIds} onChange={(e) => setCreateForm((state) => ({ ...state, product_ids: e.target.value }))}>
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={product.id || product._id} value={product.id || product._id}>{product.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Stage</span>
                <select className={inputClassName} value={createForm.current_stage || defaultStageId} onChange={(e) => setCreateForm((state) => ({ ...state, current_stage: e.target.value }))}>
                  <option value="">Select stage</option>
                  {stages.map((stage) => (
                    <option key={stage.id || stage.name} value={stage.id || stage.name}>{stage.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Owner</span>
                <select className={inputClassName} value={createForm.assigned_to} onChange={(e) => setCreateForm((state) => ({ ...state, assigned_to: e.target.value }))}>
                  <option value="">Select owner</option>
                  {assignableUsers.map((userOption) => (
                    <option key={userOption.id || userOption._id} value={userOption.id || userOption._id}>
                      {userOption.first_name} {userOption.last_name} {userOption.role ? `(${userOption.role})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Interest level</span>
                <select className={inputClassName} value={createForm.interest_level} onChange={(e) => setCreateForm((state) => ({ ...state, interest_level: e.target.value }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Estimated close date</span>
                <input className={inputClassName} type="date" value={createForm.estimated_close_date} onChange={(e) => setCreateForm((state) => ({ ...state, estimated_close_date: e.target.value }))} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-gray-600">Tags</span>
                <input className={inputClassName} placeholder="Tags, pipe-separated" value={createForm.tag} onChange={(e) => setCreateForm((state) => ({ ...state, tag: e.target.value }))} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-gray-600">Remark</span>
                <textarea className={`${inputClassName} min-h-28`} placeholder="Remark" value={createForm.remark} onChange={(e) => setCreateForm((state) => ({ ...state, remark: e.target.value }))} />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" loading={createLeadMutation.isLoading}>Save lead</Button>
            </div>
          </form>
        </Modal>
      )}

      {isEmployee && (
        <CRMSection
          title="My assigned leads"
          description="Read-only except for the meeting scheduled and dead-end markers."
          actions={<Badge label={`${employeeLeads.length} assigned`} colorKey="draft" />}
        >
          {assignedLeadsQuery.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 w-full rounded-3xl" />)}
            </div>
          ) : assignedLeadsQuery.isError ? (
            <CRMEmptyState
              icon={Users}
              title="Unable to load your leads"
              description={assignedLeadsQuery.error?.response?.data?.detail || 'Try again after reloading.'}
              action={<Button variant="secondary" onClick={() => assignedLeadsQuery.refetch()}>Retry</Button>}
            />
          ) : employeeLeads.length ? (
            <div className="overflow-hidden rounded-3xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Lead</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Meeting</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Dead end</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {employeeLeads.map((lead) => {
                    const leadId = lead.id || lead._id
                    const custom = (() => {
                      if (typeof lead.custom_fields === 'string') {
                        try { return JSON.parse(lead.custom_fields) || {} } catch { return {} }
                      }
                      return lead.custom_fields || {}
                    })()
                    const meetingScheduled = Boolean(custom.meeting_scheduled)
                    const deadEnd = Boolean(custom.dead_end)
                    return (
                      <tr
                        key={leadId}
                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-950"
                        onClick={() => navigate(`/crm/leads/${leadId}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            navigate(`/crm/leads/${leadId}`)
                          }
                        }}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{lead.company_name || lead.prospect_name || 'Lead'}</div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{lead.email || lead.phone || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{lead.status || 'active'}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              employeeStatusMutation.mutate({ leadId, customFields: { ...custom, meeting_scheduled: !meetingScheduled, dead_end: deadEnd } })
                            }}
                            className={`rounded-full px-3 py-1 text-xs font-medium ${meetingScheduled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}
                          >
                            {meetingScheduled ? '✓ Scheduled' : '○ Not scheduled'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              employeeStatusMutation.mutate({ leadId, customFields: { ...custom, dead_end: !deadEnd, meeting_scheduled: meetingScheduled } })
                            }}
                            className={`rounded-full px-3 py-1 text-xs font-medium ${deadEnd ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}
                          >
                            {deadEnd ? '✕ Dead end' : '○ Open'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <CRMEmptyState icon={Users} title="No assigned leads" description="Leads assigned to you will appear here automatically." />
          )}
        </CRMSection>
      )}

      <CRMSection
        title="Duplicate leads"
        description="Review likely duplicate records before they create noise in the pipeline."
        actions={<Badge label={`${duplicateGroups.length} groups`} colorKey="draft" />}
      >
        {duplicatesQuery.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-28 w-full rounded-3xl" />)}
          </div>
        ) : duplicatesQuery.isError ? (
          <CRMEmptyState
            icon={Merge}
            title="Unable to load duplicates"
            description={duplicatesQuery.error?.response?.data?.detail || 'Try again to review duplicate leads.'}
            action={<Button variant="secondary" onClick={() => duplicatesQuery.refetch()}>Retry</Button>}
          />
        ) : duplicateGroups.length ? (
          <div className="space-y-3">
            {duplicateGroups.map((group) => (
              <article key={group.match_key} className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{group.match_key}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{group.leads.length} matching leads</p>
                  </div>
                  <Button type="button" variant="primary" size="sm" onClick={() => setMergeGroup(group)}>
                    Merge leads
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {group.leads.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-left text-sm hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-800"
                      onClick={() => navigate(`/crm/leads/${lead.id}`)}
                    >
                      <p className="font-medium text-gray-900 dark:text-gray-100">{lead.prospect_name || 'Lead'}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{lead.email || lead.phone || 'No identity fields'}</p>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{lead.current_stage || 'Unstaged'}</p>
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <CRMEmptyState icon={Merge} title="No duplicate groups found" description="The current lead set does not have obvious duplicates." />
        )}
      </CRMSection>

      <CRMSection
        title={isEmployee ? 'Recent leads' : 'All account leads'}
        description={isEmployee ? 'Recently visible leads from the live pipeline board.' : 'All leads in the account appear here with owner and employee status markers.'}
      >
        {!isEmployee ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Badge label={`${allAccountLeads.length} leads`} colorKey="draft" />
            <Button type="button" variant="secondary" onClick={() => leadsQuery.refetch()}>
              Refresh leads
            </Button>
          </div>
        ) : null}
        {((!isEmployee && leadsQuery.isLoading) || (isEmployee && pipelineQuery.isLoading)) ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-24 w-full rounded-3xl" />)}
          </div>
        ) : ((!isEmployee && leadsQuery.isError) || (isEmployee && pipelineQuery.isError)) ? (
          <CRMEmptyState
            icon={Filter}
            title="Unable to load leads"
            description={(isEmployee ? pipelineQuery.error?.response?.data?.detail : leadsQuery.error?.response?.data?.detail) || 'Try again from the pipeline screen.'}
            action={<Button variant="secondary" onClick={() => (isEmployee ? pipelineQuery.refetch() : leadsQuery.refetch())}>Retry</Button>}
          />
        ) : !isEmployee ? (
          allAccountLeads.length ? (
            <div className="overflow-hidden rounded-3xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Lead</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Owner</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Stage</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Employee status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {allAccountLeads.map((lead) => {
                    const leadId = lead.id || lead._id
                    const { meetingScheduled, deadEnd } = getEmployeeLeadFlags(lead)
                    return (
                      <tr key={leadId} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => navigate(`/crm/leads/${leadId}`)} className="text-left">
                            <div className="font-medium text-gray-900 dark:text-gray-100">{lead.company_name || lead.prospect_name || 'Lead'}</div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{lead.email || lead.phone || '-'}</p>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{lead.owner_name || lead.assigned_to_name || lead.assigned_to || 'Unassigned'}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{lead.current_stage || lead.stage || 'Unknown'}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Badge label={meetingScheduled ? 'Meeting scheduled' : 'Meeting pending'} colorKey={meetingScheduled ? 'scheduled' : 'draft'} />
                            <Badge label={deadEnd ? 'Dead end' : 'Open'} colorKey={deadEnd ? 'danger' : 'draft'} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <CRMEmptyState icon={Users} title="No leads yet" description="Leads will appear here once the account has records." action={<Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>Open Pipeline</Button>} />
          )
        ) : recentLeads.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentLeads.map((lead) => (
              <label key={lead.id || lead._id} className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800">
                <div className="flex items-start justify-between gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(lead.id || lead._id)}
                    onChange={(event) => {
                      const id = lead.id || lead._id
                      setSelectedIds((current) => event.target.checked ? [...current, id] : current.filter((value) => value !== id))
                    }}
                  />
                  <button type="button" onClick={() => navigate(`/crm/leads/${lead.id || lead._id}`)} className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{lead.company_name || lead.prospect_name || 'Lead'}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{lead.owner_name || lead.assigned_to_name || lead.assigned_to || 'Unassigned'}</p>
                  </button>
                  <Badge label={lead.current_stage || lead.stage || 'Unknown'} colorKey="draft" />
                </div>
              </label>
            ))}
          </div>
        ) : (
          <CRMEmptyState
            icon={Users}
            title="No leads yet"
            description="Leads will appear here once the pipeline has records."
            action={<Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>Open Pipeline</Button>}
          />
        )}
      </CRMSection>

      {!isEmployee && (
        <CRMSection
          title="Employee lead status"
          description="Quickly mark whether a meeting is scheduled or the lead is a dead end."
        >
          {recentLeads.length ? (
            <div className="overflow-hidden rounded-3xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-950">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Lead</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Owner</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Meeting</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Dead end</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                  {recentLeads.map((lead) => {
                    const leadId = lead.id || lead._id
                    const custom = lead.custom_fields || {}
                    const meetingScheduled = Boolean(custom.meeting_scheduled)
                    const deadEnd = Boolean(custom.dead_end)
                    return (
                      <tr key={leadId} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                        <td className="px-4 py-3">
                          <button className="font-medium text-primary-700" type="button" onClick={() => navigate(`/crm/leads/${leadId}`)}>
                            {lead.company_name || lead.prospect_name || 'Lead'}
                          </button>
                          <p className="text-xs text-gray-500">{lead.email || lead.phone || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{lead.owner_name || lead.assigned_to_name || lead.assigned_to || 'Unassigned'}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className={`rounded-full px-3 py-1 text-xs font-medium ${meetingScheduled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}
                            onClick={() => statusMutation.mutate({ leadId, customFields: { ...custom, meeting_scheduled: !meetingScheduled, dead_end: deadEnd } })}
                          >
                            {meetingScheduled ? 'Scheduled' : 'Not scheduled'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className={`rounded-full px-3 py-1 text-xs font-medium ${deadEnd ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}
                            onClick={() => statusMutation.mutate({ leadId, customFields: { ...custom, dead_end: !deadEnd, meeting_scheduled: meetingScheduled } })}
                          >
                            {deadEnd ? 'Dead end' : 'Open'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <CRMEmptyState icon={Users} title="No leads yet" description="Leads will appear here once the pipeline has records." />
          )}
        </CRMSection>
      )}

      <MergeModal
        group={mergeGroup}
        isOpen={Boolean(mergeGroup)}
        onClose={() => setMergeGroup(null)}
        onConfirm={(payload) => mergeMutation.mutate(payload)}
        loading={mergeMutation.isLoading}
      />

      <BulkImportProspectsModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => {
          setImportOpen(false)
          queryClient.invalidateQueries('crm-leads-entry')
          queryClient.invalidateQueries('crm-lead-duplicates')
          queryClient.invalidateQueries('crm-pipeline-board')
        }}
        categories={categoriesQuery.data?.categories || []}
        stages={stagesQuery.data?.stages || []}
        users={assignableUsers}
        products={productsQuery.data?.products || []}
      />

      <BulkUpdateModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        leadCount={selectedLeads.length}
        onSubmit={(fields) => bulkMutation.mutate({ lead_ids: selectedIds, fields })}
        loading={bulkMutation.isLoading}
        stages={stagesQuery.data?.stages || []}
        users={assignableUsers}
      />
    </CRMPage>
  )
}

function BulkUpdateModal({ isOpen, onClose, leadCount, onSubmit, loading, stages, users }) {
  const [fields, setFields] = useState({ current_stage: '', status: '', assigned_to: '', interest_level: '', channel: '', tag: '' })
  useEffect(() => { if (isOpen) setFields({ current_stage: '', status: '', assigned_to: '', interest_level: '', channel: '', tag: '' }) }, [isOpen])
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Bulk update ${leadCount} leads`} size="lg">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Stage"><select className={inputClassName} value={fields.current_stage} onChange={(e) => setFields((s) => ({ ...s, current_stage: e.target.value }))}><option value="">No change</option>{stages.map((s) => <option key={s.id || s.name} value={s.id || s.name}>{s.name}</option>)}</select></Field>
        <Field label="Status"><select className={inputClassName} value={fields.status} onChange={(e) => setFields((s) => ({ ...s, status: e.target.value }))}><option value="">No change</option><option value="active">Active</option><option value="won">Won</option><option value="lost">Lost</option><option value="closed">Closed</option></select></Field>
        <Field label="Owner"><select className={inputClassName} value={fields.assigned_to} onChange={(e) => setFields((s) => ({ ...s, assigned_to: e.target.value }))}><option value="">No change</option>{users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}</select></Field>
        <Field label="Priority"><select className={inputClassName} value={fields.interest_level} onChange={(e) => setFields((s) => ({ ...s, interest_level: e.target.value }))}><option value="">No change</option><option value="cold">Cold</option><option value="warm">Warm</option><option value="hot">Hot</option></select></Field>
        <Field label="Source"><input className={inputClassName} value={fields.channel} onChange={(e) => setFields((s) => ({ ...s, channel: e.target.value }))} placeholder="Leave blank for no change" /></Field>
        <Field label="Tags"><input className={inputClassName} value={fields.tag} onChange={(e) => setFields((s) => ({ ...s, tag: e.target.value }))} placeholder="Pipe-separated tags" /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={loading} onClick={() => onSubmit(fields)} disabled={!leadCount}>Apply</Button>
      </div>
    </Modal>
  )
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>{children}</label>
}

function MergeModal({ group, isOpen, onClose, onConfirm, loading }) {
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')

  const leads = group?.leads || []

  useEffect(() => {
    if (!isOpen || !leads.length) return
    const [first, second] = leads
    setTargetId(first?.id || '')
    setSourceId(second?.id || '')
  }, [isOpen, leads])

  const submit = () => {
    if (!sourceId || !targetId || sourceId === targetId) {
      toast.error('Select two different leads to merge')
      return
    }
    onConfirm?.({ source_lead_id: sourceId, target_lead_id: targetId })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Merge duplicate leads" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          The target lead keeps the combined data. The source lead will be marked deleted after the merge.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Target lead</span>
            <select className={inputClassName} value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">Select target</option>
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.prospect_name || lead.id}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Source lead</span>
            <select className={inputClassName} value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              <option value="">Select source</option>
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.prospect_name || lead.id}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={loading} onClick={submit}>Merge leads</Button>
        </div>
      </div>
    </Modal>
  )
}
