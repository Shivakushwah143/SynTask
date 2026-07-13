import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { ArrowRight, CalendarDays, Download, Filter, Import, Mail, Merge, Phone, Plus, Search, Sparkles, Target, TrendingUp, Users } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { salesApi } from '../../../api/sales'
import { usersAPI } from '../../../api/users'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection } from '../../../components/crm'
import { ChartCard } from '../../../components/charts/ChartCard'
import { ChartTooltip } from '../../../components/charts/ChartTooltip'
import { Badge, Button, Modal, Skeleton, inputClassName } from '../../../components/ui'
import BulkImportLeadsModal from '../../../components/BulkImportProspectsModal'
import { useAuthStore } from '../../../store/authStore'
import { isEmployeeRole, normalizeRole } from '../../../utils/roles'
import { buildPipelineBoard, formatCurrency, getLeadContactLabel, getLeadDealValue, getLeadOwnerLabel, getLeadPriority, getLeadStageKey, getLeadTags, normalizeText } from '../pipeline/utils'

const getOptionId = (item) => String(item?.id || item?._id || item?.value || item?.key || '').trim()
const getUserId = (item) => String(item?.id || item?._id || item?.user_id || item?.value || '').trim()
const getStageValue = (stage) => String(stage?.id || stage?._id || stage?.key || stage?.name || '').trim()
const getResponseItems = (data, key) => {
  const direct = data?.[key]
  const nested = data?.data?.[key]
  if (Array.isArray(direct)) return direct
  if (Array.isArray(nested)) return nested
  if (Array.isArray(data)) return data
  return []
}

export default function CRMLeadsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [leadSearch, setLeadSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')

  useEffect(() => {
    if (searchParams.get('import') !== '1') return
    setImportOpen(true)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('import')
      return next
    }, { replace: true })
  }, [searchParams, setSearchParams])

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
  const duplicatesQuery = useQuery('crm-lead-duplicates', () => salesApi.getDuplicateLeads({}), {
    staleTime: 60 * 1000,
    enabled: !isEmployee,
  })
  const categoriesQuery = useQuery('crm-lead-categories', salesApi.getCategories, { staleTime: 5 * 60 * 1000 })
  const stagesQuery = useQuery('crm-lead-stages', salesApi.getStages, { staleTime: 5 * 60 * 1000 })
  const usersQuery = useQuery('crm-lead-users', () => usersAPI.getAssignableUsers(), { staleTime: 5 * 60 * 1000 })
  const productsQuery = useQuery('crm-lead-products', salesApi.getProducts, { staleTime: 5 * 60 * 1000 })

  const board = useMemo(() => buildPipelineBoard(pipelineQuery.data || {}), [pipelineQuery.data])
  const stages = useMemo(() => (Array.isArray(board?.stages) ? board.stages : []), [board])
  const leadCount = useMemo(() => stages.reduce((sum, stage) => sum + (stage.leads?.length || 0), 0), [stages])
  const recentLeads = useMemo(() => stages.flatMap((stage) => stage.leads || []).slice(0, 6), [stages])
  const allAccountLeads = useMemo(() => {
    const items = leadsQuery.data?.prospects || leadsQuery.data?.items || leadsQuery.data?.data?.prospects || leadsQuery.data?.data?.items || []
    return Array.isArray(items) ? items : []
  }, [leadsQuery.data])
  const duplicateGroups = useMemo(() => duplicatesQuery.data?.groups || duplicatesQuery.data?.data?.groups || [], [duplicatesQuery.data])
  const allLeads = useMemo(() => stages.flatMap((stage) => stage.leads || []), [stages])
  const stageOptions = useMemo(() => stages.filter((stage) => (stage.leads || []).length).map((stage) => ({ value: stage.key, label: stage.name })), [stages])
  const totalPipelineValue = useMemo(() => allLeads.reduce((sum, lead) => sum + getLeadDealValue(lead), 0), [allLeads])
  const leadAnalytics = useMemo(() => buildLeadDashboardAnalytics(allLeads, stages, new Date(), pipelineQuery.data?.meta?.currency || 'INR'), [allLeads, pipelineQuery.data?.meta?.currency, stages])
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
      ].filter(Boolean).map(normalizeText).join(' ')
      if (query && !searchable.includes(query)) return false
      if (stage && getLeadStageKey(lead) !== stage) return false
      if (priority && getLeadPriority(lead) !== priority) return false
      return true
    })
  }, [allLeads, leadSearch, priorityFilter, stageFilter])
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
  const categories = useMemo(() => getResponseItems(categoriesQuery.data, 'categories'), [categoriesQuery.data])
  const products = useMemo(() => getResponseItems(productsQuery.data, 'products'), [productsQuery.data])
  const userNameById = useMemo(() => {
    const map = new Map()
    assignableUsers.forEach((item) => {
      const id = String(item.id || item._id || '')
      const name = [item.first_name, item.last_name].filter(Boolean).join(' ').trim() || item.email
      if (id && name) map.set(id, name)
    })
    return map
  }, [assignableUsers])
  const defaultStageId = getStageValue(stages[0])
  const defaultCategoryId = getOptionId(categories[0])
  const defaultProductIds = getOptionId(products[0])
  const defaultOwnerId = getUserId(assignableUsers[0]) || currentUserId

  useEffect(() => {
    if (!createOpen) return
    setCreateForm((state) => ({
      ...state,
      category_id: state.category_id || defaultCategoryId,
      product_ids: state.product_ids || defaultProductIds,
      current_stage: state.current_stage || defaultStageId,
      assigned_to: state.assigned_to || defaultOwnerId,
    }))
  }, [createOpen, defaultCategoryId, defaultOwnerId, defaultProductIds, defaultStageId])

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
    (payload) => salesApi.createLead(payload),
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
    const updates = payload.lead_ids.map((leadId) => salesApi.updateLeadForm(leadId, payload.fields))
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
    ({ leadId, customFields }) => salesApi.updateLeadForm(leadId, { custom_fields: JSON.stringify(customFields) }),
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
    ({ leadId, customFields }) => salesApi.updateLeadForm(leadId, { custom_fields: JSON.stringify(customFields) }),
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
        description={isEmployee ? 'Review assigned leads and update status.' : 'Open a lead from the pipeline.'}
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
                  Import
                </Button>
                <Button variant="secondary" onClick={exportLeads}>
                  <Download className="h-4 w-4" />
                  Export
                </Button>
                <Button variant="secondary" onClick={() => setBulkOpen(true)} disabled={!selectedIds.length}>
                  Bulk edit
                </Button>
              </>
            )}
            <Button variant="primary" onClick={() => navigate('/crm/pipeline')}>
              Open pipeline
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
        <ChartCard
          title="Lead Momentum"
          period="Last 6 Months"
          right={<Badge label={`${filteredLeads.length} visible`} colorKey="draft" />}
          className="overflow-hidden shadow-sm"
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(220px,0.3fr)]">
            <div>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-3xl font-semibold tracking-tight text-gray-950 dark:text-gray-50">{leadCount}</p>
                  <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">Total leads in active pipeline</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-300">{formatCurrency(totalPipelineValue, pipelineQuery.data?.meta?.currency || 'INR')}</p>
                  <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">Pipeline value</p>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={leadAnalytics.monthlyTrend} margin={{ left: -16, right: 10, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="leadMomentumFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#2563eb" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.16} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <ChartTooltip />
                    <Area type="monotone" dataKey="count" name="Leads" stroke="#2563eb" strokeWidth={3} fill="url(#leadMomentumFill)" activeDot={{ r: 6, fill: '#2563eb' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid content-start gap-3">
              {leadAnalytics.insights.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.route ? () => navigate(item.route) : undefined}
                  className="rounded-2xl border border-surface-border/80 bg-gray-50/80 p-4 text-left transition hover:border-primary-200 hover:bg-primary-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 dark:border-gray-800 dark:bg-gray-950/70 dark:hover:border-primary-800 dark:hover:bg-primary-950/20"
                >
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    <item.icon className="h-4 w-4 text-primary-600 dark:text-primary-300" />
                    {item.label}
                  </span>
                  <span className="mt-2 block text-2xl font-semibold text-gray-950 dark:text-gray-50">{item.value}</span>
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{item.helper}</span>
                </button>
              ))}
            </div>
          </div>
        </ChartCard>

        <div className="grid gap-4">
          <ChartCard
            title="Stage Mix"
            period={`${stages.length} stages`}
            className="shadow-sm"
          >
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadAnalytics.stageStack} barCategoryGap="28%" margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.16} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <ChartTooltip />
                  <Bar dataKey="hot" stackId="stage" name="Hot" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={42} />
                  <Bar dataKey="warm" stackId="stage" name="Warm" fill="#38bdf8" maxBarSize={42} />
                  <Bar dataKey="cold" stackId="stage" name="Cold" fill="#6366f1" radius={[0, 0, 6, 6]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <div className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-950 dark:text-gray-50">Lead shortcuts</h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Jump into related CRM surfaces.</p>
              </div>
              <Badge label="Sales module" colorKey="draft" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>Pipeline</Button>
              <Button variant="secondary" onClick={() => navigate('/crm/activities')}>Activities</Button>
              <Button variant="secondary" onClick={() => navigate('/crm/companies')}>Companies</Button>
            </div>
          </div>
        </div>
      </section>

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
                assigned_to: createForm.assigned_to || defaultOwnerId,
                interest_level: createForm.interest_level || 'medium',
                estimated_close_date: createForm.estimated_close_date || new Date().toISOString().slice(0, 10),
                remark: createForm.remark.trim(),
                tag: createForm.tag.trim(),
              }

              if (!payload.first_name || !payload.last_name || !payload.phone) {
                toast.error('First name, last name, and phone are required')
                return
              }
              const missingFields = [
                !payload.category_id && 'category',
                !payload.product_ids && 'product',
                !payload.current_stage && 'stage',
                !payload.assigned_to && 'owner',
              ].filter(Boolean)
              if (missingFields.length) {
                toast.error(`Missing ${missingFields.join(', ')}. Check CRM settings.`)
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
                    <option key={getOptionId(category)} value={getOptionId(category)}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Select product</span>
                <select className={inputClassName} value={createForm.product_ids || defaultProductIds} onChange={(e) => setCreateForm((state) => ({ ...state, product_ids: e.target.value }))}>
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={getOptionId(product)} value={getOptionId(product)}>{product.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Stage</span>
                <select className={inputClassName} value={createForm.current_stage || defaultStageId} onChange={(e) => setCreateForm((state) => ({ ...state, current_stage: e.target.value }))}>
                  <option value="">Select stage</option>
                  {stages.map((stage) => (
                    <option key={getStageValue(stage)} value={getStageValue(stage)}>{stage.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Owner</span>
                <select className={inputClassName} value={createForm.assigned_to || defaultOwnerId} onChange={(e) => setCreateForm((state) => ({ ...state, assigned_to: e.target.value }))}>
                  <option value="">Select owner</option>
                  {assignableUsers.map((userOption) => (
                    <option key={getUserId(userOption)} value={getUserId(userOption)}>
                      {userOption.first_name} {userOption.last_name} {userOption.role ? `(${userOption.role})` : ''}
                    </option>
                  ))}
                  {!assignableUsers.length && defaultOwnerId ? (
                    <option value={defaultOwnerId}>{user?.first_name} {user?.last_name} ({user?.role || 'owner'})</option>
                  ) : null}
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
          description="Read-only except for meeting and dead-end markers."
          actions={<Badge label={`${employeeLeads.length} assigned`} colorKey="draft" />}
        >
          {assignedLeadsQuery.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 w-full rounded-2xl" />)}
            </div>
          ) : assignedLeadsQuery.isError ? (
            <CRMEmptyState
              icon={Users}
              title="Unable to load your leads"
              description={assignedLeadsQuery.error?.response?.data?.detail || 'Try again after reloading.'}
              action={<Button variant="secondary" onClick={() => assignedLeadsQuery.refetch()}>Retry</Button>}
            />
          ) : employeeLeads.length ? (
            <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
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
                            {meetingScheduled ? 'Scheduled' : 'Not scheduled'}
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
            <CRMEmptyState icon={Users} title="No assigned leads" description="Leads assigned to you will appear here automatically." />
          )}
        </CRMSection>
      )}

      {!isEmployee && (
        <CRMSection
          title="Lead workspace"
          description="Search, review, select, and update pipeline leads from one place."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Badge label={`${filteredLeads.length} visible`} colorKey="draft" />
              <Button variant="secondary" size="sm" onClick={() => navigate('/crm/pipeline')}>
                Pipeline
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        >
          <div className="mb-4 rounded-2xl border border-surface-border/80 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-950/50">
            <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_160px_160px_auto]">
            <label className="relative block">
              <span className="sr-only">Search leads</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                className="input min-h-10 pl-10"
                value={leadSearch}
                onChange={(event) => setLeadSearch(event.target.value)}
                placeholder="Search leads, contacts, owner..."
              />
            </label>
            <label className="block">
              <span className="sr-only">Stage</span>
              <select className="input min-h-10" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
                <option value="">All stages</option>
                {stageOptions.map((stage) => (
                  <option key={stage.value} value={stage.value}>{stage.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="sr-only">Priority</span>
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
            </label>
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

          {pipelineQuery.isLoading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-24 w-full rounded-2xl" />)}
            </div>
          ) : pipelineQuery.isError ? (
            <CRMEmptyState
              icon={Filter}
              title="Unable to load leads"
              description={pipelineQuery.error?.response?.data?.detail || 'Try again from the pipeline screen.'}
              action={<Button variant="secondary" onClick={() => pipelineQuery.refetch()}>Retry</Button>}
            />
          ) : filteredLeads.length ? (
            <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-950">
                    <tr>
                      <th className="w-10 px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={filteredLeads.length > 0 && filteredLeads.every((lead) => selectedIds.includes(lead.id || lead._id))}
                          onChange={(event) => {
                            const ids = filteredLeads.map((lead) => lead.id || lead._id).filter(Boolean)
                            setSelectedIds((current) => event.target.checked ? Array.from(new Set([...current, ...ids])) : current.filter((id) => !ids.includes(id)))
                          }}
                          aria-label="Select visible leads"
                        />
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Lead</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Owner</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Stage</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Priority</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Value</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Meeting</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-200">Dead end</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {filteredLeads.map((lead) => {
                      const leadId = lead.id || lead._id
                      const custom = parseLeadCustomFields(lead)
                      const meetingScheduled = Boolean(custom.meeting_scheduled)
                      const deadEnd = Boolean(custom.dead_end)
                      const priority = getLeadPriority(lead)
                      return (
                        <tr key={leadId} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(leadId)}
                              onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, leadId] : current.filter((value) => value !== leadId))}
                              aria-label={`Select ${lead.company_name || lead.prospect_name || leadId}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => navigate(`/crm/leads/${leadId}`)} className="text-left">
                              <span className="block font-semibold text-gray-900 hover:text-primary-700 dark:text-gray-100 dark:hover:text-primary-300">
                                {lead.company_name || lead.prospect_name || 'Lead'}
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                {lead.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</span> : null}
                                {lead.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span> : null}
                                {!lead.email && !lead.phone ? getLeadContactLabel(lead) : null}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{getOwnerName(lead, userNameById)}</td>
                          <td className="px-4 py-3"><Badge label={lead.current_stage || lead.stage || 'Unstaged'} colorKey="draft" /></td>
                          <td className="px-4 py-3"><PriorityPill priority={priority} /></td>
                          <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(getLeadDealValue(lead), pipelineQuery.data?.meta?.currency || 'INR')}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className={`rounded-full px-3 py-1 text-xs font-medium ${meetingScheduled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
                              onClick={() => statusMutation.mutate({ leadId, customFields: { ...custom, meeting_scheduled: !meetingScheduled, dead_end: deadEnd } })}
                            >
                              {meetingScheduled ? 'Scheduled' : 'Not scheduled'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className={`rounded-full px-3 py-1 text-xs font-medium ${deadEnd ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
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
            </div>
          ) : (
            <CRMEmptyState
              icon={Users}
              title="No leads found"
              description={allLeads.length ? 'Clear filters to see all pipeline leads.' : 'Leads will appear here once the pipeline has records.'}
              action={allLeads.length ? <Button variant="secondary" onClick={() => { setLeadSearch(''); setStageFilter(''); setPriorityFilter('') }}>Clear filters</Button> : <Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>Pipeline</Button>}
            />
          )}
        </CRMSection>
      )}

      <CRMSection
        title="Duplicates"
        description="Review likely duplicate records."
        actions={<Badge label={`${duplicateGroups.length} groups`} colorKey="draft" />}
      >
        {duplicatesQuery.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-28 w-full rounded-2xl" />)}
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
              <article key={group.match_key} className="rounded-2xl border border-surface-border/80 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{group.match_key}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{group.leads.length} matching leads</p>
                  </div>
                  <Button type="button" variant="primary" size="sm" onClick={() => setMergeGroup(group)}>
                    Merge
                  </Button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {group.leads.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-left text-sm transition hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-800"
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
          <CRMEmptyState icon={Merge} title="No duplicates" description="The current lead set looks clean." />
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
              {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-24 w-full rounded-2xl" />)}
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
            <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
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
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{getOwnerName(lead, userNameById)}</td>
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
              <label key={lead.id || lead._id} className="rounded-2xl border border-surface-border/80 bg-white p-3 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800">
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
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{getOwnerName(lead, userNameById)}</p>
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
            <div className="overflow-hidden rounded-2xl border border-surface-border/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
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
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{getOwnerName(lead, userNameById)}</td>
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

      <BulkImportLeadsModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => {
          setImportOpen(false)
          queryClient.invalidateQueries('crm-leads-entry')
          queryClient.invalidateQueries('crm-lead-duplicates')
          queryClient.invalidateQueries('crm-pipeline-board')
        }}
        categories={categories}
        stages={stagesQuery.data?.stages || []}
        users={assignableUsers}
        products={products}
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

export function getSalesCollection(data, legacyKey) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.[legacyKey])) return data[legacyKey]
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.data?.[legacyKey])) return data.data[legacyKey]
  if (Array.isArray(data?.data?.items)) return data.data.items
  return []
}

export function getOwnerName(lead, userNameById = new Map()) {
  const direct = lead?.owner_name || lead?.assigned_to_name || lead?.owner?.name
  if (direct) return direct
  const ownerId = String(lead?.assigned_to || lead?.owner_id || '')
  if (ownerId && userNameById.has(ownerId)) return userNameById.get(ownerId)
  return 'Unassigned'
}

export function buildLeadDashboardAnalytics(leads = [], stages = [], now = new Date(), currency = 'INR') {
  const monthFormatter = new Intl.DateTimeFormat('en', { month: 'short' })
  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      name: monthFormatter.format(date),
      count: 0,
      value: 0,
    }
  })
  const monthByKey = new Map(monthKeys.map((item) => [item.key, item]))
  leads.forEach((lead) => {
    const rawDate = lead.created_at || lead.updated_at || lead.estimated_close_date
    const date = rawDate ? new Date(rawDate) : null
    if (!date || Number.isNaN(date.getTime())) return
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const bucket = monthByKey.get(key)
    if (!bucket) return
    bucket.count += 1
    bucket.value += getLeadDealValue(lead)
  })

  const stageLookup = new Map(stages.map((stage) => [normalizeText(stage.key || stage.id || stage.name), stage.name || stage.key || 'Stage']))
  const stageTotals = new Map()
  leads.forEach((lead) => {
    const stageKey = getLeadStageKey(lead) || normalizeText(lead.current_stage || lead.stage || 'unstaged')
    const stageName = stageLookup.get(stageKey) || lead.current_stage || lead.stage || 'Unstaged'
    const priority = normalizeText(getLeadPriority(lead) || 'medium')
    const type = ['critical', 'high', 'hot'].includes(priority) ? 'hot' : ['medium', 'warm'].includes(priority) ? 'warm' : 'cold'
    const current = stageTotals.get(stageName) || { name: stageName, hot: 0, warm: 0, cold: 0 }
    current[type] += 1
    stageTotals.set(stageName, current)
  })

  const activeCount = leads.filter((lead) => !['won', 'lost', 'closed'].includes(String(lead?.status || '').toLowerCase())).length
  const meetingCount = leads.filter((lead) => Boolean(parseLeadCustomFields(lead).meeting_scheduled)).length
  const hotCount = leads.filter((lead) => ['critical', 'high', 'hot'].includes(normalizeText(getLeadPriority(lead)))).length
  const pipelineValue = leads.reduce((sum, lead) => sum + getLeadDealValue(lead), 0)

  return {
    monthlyTrend: monthKeys,
    stageStack: Array.from(stageTotals.values()).slice(0, 6),
    insights: [
      { label: 'Active', value: activeCount, helper: `${leads.length} total records`, icon: Sparkles, route: '/crm/pipeline' },
      { label: 'Hot leads', value: hotCount, helper: 'High-intent priority mix', icon: Target, route: '/crm/pipeline' },
      { label: 'Meetings', value: meetingCount, helper: 'Scheduled follow-ups', icon: CalendarDays, route: '/crm/activities' },
      { label: 'Avg value', value: leads.length ? formatCurrency(Math.round(pipelineValue / leads.length), currency) : formatCurrency(0, currency), helper: 'Mean deal size', icon: TrendingUp, route: '/crm/pipeline' },
    ],
  }
}

function parseLeadCustomFields(lead) {
  if (typeof lead?.custom_fields === 'string') {
    try {
      return JSON.parse(lead.custom_fields) || {}
    } catch {
      return {}
    }
  }
  return lead?.custom_fields || {}
}

function PriorityPill({ priority }) {
  const normalized = normalizeText(priority || 'medium')
  const styles = {
    critical: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900',
    high: 'bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-900',
    hot: 'bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-900',
    medium: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900',
    warm: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900',
    low: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900',
    cold: 'bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900',
  }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${styles[normalized] || styles.medium}`}>
      {normalized || 'medium'}
    </span>
  )
}

function MergeModal({ group, isOpen, onClose, onConfirm, loading }) {
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')

  const leads = useMemo(() => group?.leads || [], [group?.leads])

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
