import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { 
  LayoutDashboard, 
  Users, 
  TrendingUp, 
  Clock, 
  DollarSign, 
  RefreshCw,
  Plus,
  Import,
  Filter,
  Search,
  X,
  GripVertical,
  User,
  Building2,
  Mail,
  Phone,
  Tag,
  Calendar,
  Star,
  AlertCircle,
  BarChart3,
  PieChart,
  Target,
  Award,
  Activity,
  ArrowRight,
  CheckCircle,
  Clock as ClockIcon,
  Zap
} from 'lucide-react'
import { crmApi } from '../../../api/crm'
import { salesApi } from '../../../api/sales'
import { usersAPI } from '../../../api/users'
import { useDebounce } from '../../../hooks/useDebounce'
import {
  PipelineBoard,
  PipelineBoardShell,
  PipelineErrorState,
  PipelineFiltersBar,
  PipelineInsightRail,
  PipelineLoadingState,
  PipelineTopMetrics,
} from './components'
import {
  buildPipelineBoard,
  filterPipelineLeads,
  getLeadOwnerLabel,
  getAllowedPipelineStageKeys,
  isAllowedPipelineTransition,
  moveLeadInBoard,
  ownerOptionsFromBoard,
  parsePipelineFilters,
  stageOptionsFromBoard,
} from './utils'

// ============================================================
// CONSTANTS & HELPERS
// ============================================================
const PIPELINE_QUERY_KEY = 'crm-pipeline-board'

const mergeSearchParams = (searchParams, nextPartial) => {
  const next = new URLSearchParams(searchParams)
  Object.entries(nextPartial).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === '') {
      next.delete(key)
      return
    }
    next.set(key, String(value))
  })
  return next
}

const usePipelineSearchContext = () => {
  const context = useOutletContext()
  return context || {}
}

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

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CRMPipelinePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [localSearchValue, setLocalSearchValue] = useState('')
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
  const pipelineSearchContext = usePipelineSearchContext()
  const searchValue = pipelineSearchContext.searchValue ?? localSearchValue
  const setSearchValue = pipelineSearchContext.setSearchValue || setLocalSearchValue
  const pipelineQuery = useQuery(PIPELINE_QUERY_KEY, () => crmApi.getPipeline(), {
    staleTime: 5 * 60 * 1000,
  })
  const categoriesQuery = useQuery('crm-lead-categories', salesApi.getCategories, { staleTime: 5 * 60 * 1000 })
  const stagesQuery = useQuery('crm-lead-stages', salesApi.getStages, { staleTime: 5 * 60 * 1000 })
  const usersQuery = useQuery('crm-lead-users', () => usersAPI.getAssignableUsers(), { staleTime: 5 * 60 * 1000 })
  const productsQuery = useQuery('crm-lead-products', salesApi.getProducts, { staleTime: 5 * 60 * 1000 })
  const [activeLeadId, setActiveLeadId] = useState(null)
  const [dragOverlayLead, setDragOverlayLead] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const rawPipeline = pipelineQuery.data
  const board = useMemo(() => buildPipelineBoard(rawPipeline || {}), [rawPipeline])
  const categories = useMemo(() => getResponseItems(categoriesQuery.data, 'categories'), [categoriesQuery.data])
  const stages = useMemo(() => getResponseItems(stagesQuery.data, 'stages'), [stagesQuery.data])
  const users = useMemo(() => getResponseItems(usersQuery.data, 'users'), [usersQuery.data])
  const products = useMemo(() => getResponseItems(productsQuery.data, 'products'), [productsQuery.data])
  const filters = useMemo(() => parsePipelineFilters(searchParams), [searchParams])
  const selectedStageLabel = useMemo(() => {
    if (!filters.stage) return ''
    return board.stages.find((stage) => stage.key === filters.stage)?.name || filters.stage
  }, [board.stages, filters.stage])
  const debouncedSearch = useDebounce(searchValue, 160)
  const effectiveSearch = useMemo(() => {
    const typedSearch = debouncedSearch?.trim() || ''
    return typedSearch || filters.q || ''
  }, [debouncedSearch, filters.q])

  useEffect(() => {
    if (filters.q !== searchValue) {
      setSearchValue(filters.q)
    }
  }, [filters.q, searchValue, setSearchValue])

  useEffect(() => {
    if (effectiveSearch !== filters.q) {
      setSearchParams((current) => mergeSearchParams(current, { q: effectiveSearch }), { replace: true })
    }
  }, [effectiveSearch, filters.q, setSearchParams])

  const visibleLeads = useMemo(() => {
    const allLeads = board.stages.flatMap((stage) => stage.leads)
    return filterPipelineLeads(allLeads, { ...filters, q: effectiveSearch })
  }, [board.stages, effectiveSearch, filters])

  const visibleLeadIds = useMemo(() => new Set(visibleLeads.map((lead) => lead.id || lead._id)), [visibleLeads])
  const hasActiveFilters = useMemo(() => (
    Boolean(effectiveSearch)
    || Object.entries(filters).some(([key, value]) => key !== 'q' && String(value || '').trim())
  ), [effectiveSearch, filters])

  const visibleBoard = useMemo(() => {
    const nextStages = board.stages
      .map((stage, index, items) => ({
        ...stage,
        leads: stage.leads.filter((lead) => visibleLeadIds.has(lead.id || lead._id)),
        previousStageKey: items[index - 1]?.key || null,
        nextStageKey: items[index + 1]?.key || null,
      }))

    const leadIndex = nextStages.reduce((acc, stage) => {
      stage.leads.forEach((lead) => {
        acc[lead.id || lead._id] = { stageKey: stage.key, stageName: stage.name }
      })
      return acc
    }, {})

    return {
      ...board,
      stages: nextStages,
      leadIndex,
    }
  }, [board, visibleLeadIds])
  
  const defaultStageId = getStageValue(stages[0])
  const defaultCategoryId = getOptionId(categories[0])
  const defaultProductIds = getOptionId(products[0])
  const defaultOwnerId = getUserId(users[0])

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

  const updateFilters = useCallback((partial) => {
    setSearchParams((current) => mergeSearchParams(current, partial), { replace: true })
  }, [setSearchParams])

  const clearFilters = useCallback(() => {
    setSearchValue('')
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      Array.from(next.keys()).forEach((key) => next.delete(key))
      return next
    }, { replace: true })
  }, [setSearchParams, setSearchValue])

  const createLeadMutation = useMutation((payload) => salesApi.createLead(payload), {
    onSuccess: () => {
      toast.success('Lead created successfully! 🎉')
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
      queryClient.invalidateQueries('crm-pipeline-board')
      queryClient.invalidateQueries('crm-leads-entry')
      queryClient.invalidateQueries('crm-lead-duplicates')
      queryClient.invalidateQueries('sales-prospects')
      queryClient.invalidateQueries('crm-all-leads')
    },
    onError: (error) => {
      toast.error(error?.response?.data?.detail || 'Unable to create lead')
    },
  })

  const submitCreateLead = useCallback((event) => {
    event.preventDefault()
    const payload = {
      ...createForm,
      first_name: createForm.first_name.trim(),
      last_name: createForm.last_name.trim(),
      phone: createForm.phone.trim(),
      email: createForm.email.trim(),
      company_name: createForm.company_name.trim(),
      category_id: createForm.category_id || undefined,
      product_ids: createForm.product_ids || undefined,
      current_stage: createForm.current_stage || undefined,
      assigned_to: createForm.assigned_to || defaultOwnerId || undefined,
      interest_level: createForm.interest_level || 'medium',
      estimated_close_date: createForm.estimated_close_date || undefined,
      remark: createForm.remark.trim(),
      tag: createForm.tag.trim(),
    }
    if (!payload.first_name || !payload.last_name || !payload.phone) {
      toast.error('First name, last name, and phone are required')
      return
    }
    if (!/^\+\d{1,4}$/.test(String(payload.country_code || '')) || !/^\d{10}$/.test(payload.phone)) {
      toast.error('Use a + country code and exactly 10 phone digits')
      return
    }
    if (!payload.assigned_to) {
      toast.error('No valid owner found for this company')
      return
    }
    createLeadMutation.mutate(payload)
  }, [createForm, createLeadMutation, defaultOwnerId])

  const moveLeadMutation = useMutation(
    ({ leadId, stageKey }) => crmApi.updatePipelineStage(leadId, { stage: stageKey }),
    {
      onMutate: async ({ leadId, stageKey, lead }) => {
        await queryClient.cancelQueries(PIPELINE_QUERY_KEY)
        const previousBoard = queryClient.getQueryData(PIPELINE_QUERY_KEY)
        const optimisticLead = {
          ...lead,
          current_stage: stageKey,
          days_in_stage: 0,
        }
        queryClient.setQueryData(PIPELINE_QUERY_KEY, (currentBoard) =>
          moveLeadInBoard(buildPipelineBoard(currentBoard || {}), leadId, stageKey, optimisticLead)
        )
        return { previousBoard }
      },
      onError: (error, variables, context) => {
        if (context?.previousBoard) {
          queryClient.setQueryData(PIPELINE_QUERY_KEY, context.previousBoard)
        }
        toast.error(error?.response?.data?.detail || 'Failed to update lead stage')
      },
      onSuccess: (response) => {
        const updatedLead = response?.lead || response?.data?.lead || response?.updatedLead || response
        const updatedLeadId = updatedLead?.id || updatedLead?._id
        queryClient.invalidateQueries(PIPELINE_QUERY_KEY)
        if (updatedLeadId) {
          queryClient.invalidateQueries(['crm-pipeline-history', updatedLeadId], { exact: true })
        }
        toast.success('Lead moved successfully! 🚀')
      },
    }
  )

  const handleLeadMove = useCallback((lead, nextStageKey) => {
    const leadId = lead?.id || lead?._id
    if (!leadId || !nextStageKey) return
    if (moveLeadMutation.isLoading) return
    const sourceStage = visibleBoard.stages.find((stage) => stage.leads.some((item) => (item.id || item._id) === leadId))
    const targetStage = visibleBoard.stages.find((stage) => stage.key === nextStageKey)
    if (sourceStage?.key === nextStageKey) return
    if (sourceStage && targetStage && !isAllowedPipelineTransition(sourceStage, targetStage)) {
      toast.error(`Move ${sourceStage.name} leads to ${targetStage.name} through the required workflow steps.`)
      return
    }
    moveLeadMutation.mutate({ leadId, stageKey: nextStageKey, lead })
  }, [moveLeadMutation, visibleBoard.stages])

  const handleCopyLeadId = useCallback(async (lead) => {
    const value = lead?.id || lead?._id
    if (!value) return
    try {
      await navigator.clipboard.writeText(String(value))
      toast.success('Lead ID copied to clipboard! 📋')
    } catch {
      toast.error('Could not copy lead ID')
    }
  }, [])

  const handleSearchChange = useCallback((value) => {
    setSearchValue(value)
  }, [setSearchValue])

  const handleDragStart = useCallback((event) => {
    const leadId = event?.active?.id
    setActiveLeadId(leadId)
    const sourceLead = visibleBoard.stages.flatMap((stage) => stage.leads).find((item) => (item.id || item._id) === leadId)
    setDragOverlayLead(sourceLead || null)
  }, [visibleBoard])

  const handleDragEnd = useCallback((event) => {
    const activeId = event?.active?.id
    const overId = event?.over?.id
    setActiveLeadId(null)
    setDragOverlayLead(null)
    if (!activeId || !overId || activeId === overId) return

    const activeLead = visibleBoard.stages.flatMap((stage) => stage.leads).find((lead) => (lead.id || lead._id) === activeId)
    if (!activeLead) return

    const targetStageKey = visibleBoard.stages.find((stage) => stage.key === overId)?.key
      || visibleBoard.leadIndex[overId]?.stageKey
      || visibleBoard.stages.find((stage) => stage.leads.some((lead) => (lead.id || lead._id) === overId))?.key

    if (!targetStageKey) return
    handleLeadMove(activeLead, targetStageKey)
  }, [handleLeadMove, visibleBoard])

  // ============================================================
  // STATS CALCULATION
  // ============================================================
  const pipelineStats = useMemo(() => {
    const allLeads = board.stages.flatMap(stage => stage.leads)
    const total = allLeads.length
    const openLeads = allLeads.filter(lead => 
      !['closed_won', 'closed_lost', 'disqualified'].includes(lead.current_stage?.toLowerCase())
    ).length
    const wonLeads = allLeads.filter(lead => 
      lead.current_stage?.toLowerCase() === 'closed_won'
    ).length
    const highValueLeads = allLeads.filter(lead => 
      parseFloat(lead.amount || lead.value || 0) > 100000
    ).length
    const totalValue = allLeads.reduce((sum, lead) => 
      sum + parseFloat(lead.amount || lead.value || 0), 0
    )
    const avgValue = total > 0 ? totalValue / total : 0
    const conversionRate = total > 0 ? (wonLeads / total) * 100 : 0
    
    return { total, openLeads, wonLeads, highValueLeads, totalValue, avgValue, conversionRate }
  }, [board.stages])

  const currency = rawPipeline?.meta?.currency || 'INR'
  const hasMoreLeads = Boolean(rawPipeline?.meta?.has_more)
  const totalLeads = Number(rawPipeline?.meta?.total_leads || 0)
  const boardLimit = Number(rawPipeline?.meta?.limit || 0)
  const loading = pipelineQuery.isLoading
  const hasError = pipelineQuery.isError

  // ============================================================
  // Phone Input Component
  // ============================================================
  const PhoneInput = ({ countryCode, phoneNumber, onCountryCodeChange, onPhoneNumberChange, required }) => (
    <div className="flex gap-2">
      <select
        value={countryCode}
        onChange={(e) => onCountryCodeChange(e.target.value)}
        className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      >
        <option value="+91">+91</option>
        <option value="+1">+1</option>
        <option value="+44">+44</option>
        <option value="+61">+61</option>
        <option value="+81">+81</option>
        <option value="+86">+86</option>
      </select>
      <input
        type="tel"
        value={phoneNumber}
        onChange={(e) => onPhoneNumberChange(e.target.value)}
        className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        placeholder="9876543210"
        required={required}
      />
    </div>
  )

  // ============================================================
  // Stat Card Component
  // ============================================================
  const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle, suffix = '' }) => {
    const colors = {
      indigo: 'from-indigo-500 to-purple-500',
      emerald: 'from-emerald-500 to-teal-500',
      blue: 'from-blue-500 to-cyan-500',
      amber: 'from-amber-500 to-orange-500',
      rose: 'from-rose-500 to-pink-500',
      teal: 'from-teal-500 to-cyan-500',
    }

    return (
      <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
          <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg transition-transform group-hover:scale-110`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
          {typeof value === 'number' && label.includes('Value') 
            ? `${currency} ${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
            : typeof value === 'number'
              ? value.toLocaleString('en-IN')
              : value}
          {suffix}
        </p>
        {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
    )
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">
                  {selectedStageLabel ? `${selectedStageLabel} Pipeline` : 'Sales Pipeline'}
                </h1>
                <p className="mt-1 text-indigo-100">
                  {selectedStageLabel 
                    ? `Showing leads in the ${selectedStageLabel} stage.` 
                    : 'Manage your leads and move them through the pipeline workflow.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => navigate('/crm/leads?import=1')}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <Import className="h-4 w-4" />
                Import
              </button>
              <button 
                onClick={() => pipelineQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* STAT CARDS - 4 Cards with Gradients */}
      {/* ============================================================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Total Leads" 
          value={pipelineStats.total} 
          icon={Users} 
          color="indigo"
          subtitle="All leads in pipeline"
        />
        
        <StatCard 
          label="Active Leads" 
          value={pipelineStats.openLeads} 
          icon={TrendingUp} 
          color="emerald"
          subtitle="In progress"
        />
        
        <StatCard 
          label="Won" 
          value={pipelineStats.wonLeads} 
          icon={Award} 
          color="blue"
          subtitle={`${pipelineStats.conversionRate.toFixed(1)}% conversion`}
        />
        
        <StatCard 
          label="Pipeline Value" 
          value={pipelineStats.totalValue} 
          icon={DollarSign} 
          color="amber"
          subtitle={`${currency} ${pipelineStats.avgValue.toFixed(0)} average`}
        />
      </div>

      {/* ============================================================ */}
      {/* FILTERS BAR - Section with Header */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
              <Filter className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Filters & Search</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Narrow down leads by stage, owner, or keyword</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <PipelineFiltersBar
            filters={filters}
            onChange={updateFilters}
            onResetFilters={clearFilters}
            ownerOptions={ownerOptionsFromBoard(board)}
            stageOptions={stageOptionsFromBoard(board)}
            searchValue={searchValue}
            onSearchChange={handleSearchChange}
            currency={currency}
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* METRICS RAIL */}
      {/* ============================================================ */}
      <PipelineTopMetrics visibleLeads={visibleLeads} stages={visibleBoard.stages} currency={currency} />
      
      {/* Info Banner */}
      {hasMoreLeads && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          Showing the latest {boardLimit.toLocaleString('en-IN')} of {totalLeads.toLocaleString('en-IN')} leads. 
          Use filters to narrow the board.
        </div>
      )}

      {/* ============================================================ */}
      {/* PIPELINE BOARD - Main Content */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
              <LayoutDashboard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">
                {selectedStageLabel ? `${selectedStageLabel} Board` : 'Pipeline Board'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedStageLabel 
                  ? 'This view came from a workflow shortcut. Clear filters to return to the full pipeline.' 
                  : 'Drag leads between stages, or use the quick actions menu to move them with a single click.'}
              </p>
            </div>
          </div>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex h-96 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading pipeline...</p>
              </div>
            </div>
          ) : hasError ? (
            <div className="flex h-96 flex-col items-center justify-center gap-4">
              <AlertCircle className="h-12 w-12 text-rose-500" />
              <p className="text-gray-600 dark:text-gray-400">
                {pipelineQuery.error?.response?.data?.detail || 'Could not load pipeline board'}
              </p>
              <button
                onClick={() => pipelineQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : (
            <DndContext
              collisionDetection={closestCorners}
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <PipelineBoard
                stages={visibleBoard.stages}
                currency={currency}
                activeLeadId={activeLeadId}
                onMoveLeadToStage={handleLeadMove}
                getAllowedStageKeys={(stage) => getAllowedPipelineStageKeys(stage, visibleBoard.stages)}
                onCopyLeadId={handleCopyLeadId}
                onLeadSelect={(lead) => navigate(`/crm/leads/${lead.id || lead._id}`)}
                onResetFilters={clearFilters}
                visibleLeads={visibleLeads}
                hasActiveFilters={hasActiveFilters}
              />
              <DragOverlay>
                {dragOverlayLead && (
                  <div className="w-80 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 p-2 text-white shadow-lg">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {dragOverlayLead.company_name || dragOverlayLead.prospect_name || 'Lead'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {getLeadOwnerLabel(dragOverlayLead)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* INSIGHT RAIL - Sidebar Analytics */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
              <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white">Pipeline Insights</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Key metrics and analytics</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <PipelineInsightRail
            visibleLeads={visibleLeads}
            stages={visibleBoard.stages}
            currency={currency}
            onLeadSelect={(lead) => navigate(`/crm/leads/${lead.id || lead._id}`)}
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* CREATE LEAD MODAL - Beautiful Glassmorphism */}
      {/* ============================================================ */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="mb-6 flex items-start justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add New Lead</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Capture lead details and assign ownership
                </p>
              </div>
              <button
                onClick={() => setCreateOpen(false)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-5" onSubmit={submitCreateLead}>
              <div className="grid gap-4 md:grid-cols-2">
                {/* First Name */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="John" 
                    value={createForm.first_name} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, first_name: e.target.value }))} 
                    required
                  />
                </div>

                {/* Last Name */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Doe" 
                    value={createForm.last_name} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, last_name: e.target.value }))} 
                    required
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Phone <span className="text-rose-500">*</span>
                  </label>
                  <PhoneInput
                    countryCode={createForm.country_code}
                    phoneNumber={createForm.phone}
                    onCountryCodeChange={(value) => setCreateForm((state) => ({ ...state, country_code: value }))}
                    onPhoneNumberChange={(value) => setCreateForm((state) => ({ ...state, phone: value }))}
                    required
                  />
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                  <input 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="john@example.com" 
                    type="email"
                    value={createForm.email} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, email: e.target.value }))} 
                  />
                </div>

                {/* Company */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Company</label>
                  <input 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Acme Corp" 
                    value={createForm.company_name} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, company_name: e.target.value }))} 
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                  <select 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    value={createForm.category_id || defaultCategoryId} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, category_id: e.target.value }))}
                  >
                    <option value="">Select category</option>
                    {categories.map((category) => (
                      <option key={getOptionId(category)} value={getOptionId(category)}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Product */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Product</label>
                  <select 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    value={createForm.product_ids || defaultProductIds} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, product_ids: e.target.value }))}
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={getOptionId(product)} value={getOptionId(product)}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Stage */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Stage</label>
                  <select 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    value={createForm.current_stage || defaultStageId} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, current_stage: e.target.value }))}
                  >
                    <option value="">Select stage</option>
                    {stages.map((stage) => (
                      <option key={getStageValue(stage)} value={getStageValue(stage)}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Owner */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Owner</label>
                  <select 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    value={createForm.assigned_to || defaultOwnerId} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, assigned_to: e.target.value }))}
                  >
                    <option value="">Select owner</option>
                    {users.map((user) => (
                      <option key={getUserId(user)} value={getUserId(user)}>
                        {user.first_name} {user.last_name} {user.role ? `(${user.role})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Interest Level */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Interest Level</label>
                  <select 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    value={createForm.interest_level} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, interest_level: e.target.value }))}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                {/* Estimated Close */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Close</label>
                  <input 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    type="date" 
                    value={createForm.estimated_close_date} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, estimated_close_date: e.target.value }))} 
                  />
                </div>

                {/* Tags */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tags</label>
                  <input 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="Enter tags separated by | (e.g., hot | priority | enterprise)" 
                    value={createForm.tag} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, tag: e.target.value }))} 
                  />
                </div>

                {/* Remark */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Remarks</label>
                  <textarea 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white min-h-24"
                    placeholder="Add any additional notes or remarks..." 
                    value={createForm.remark} 
                    onChange={(e) => setCreateForm((state) => ({ ...state, remark: e.target.value }))} 
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLeadMutation.isLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
                >
                  {createLeadMutation.isLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Lead
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
