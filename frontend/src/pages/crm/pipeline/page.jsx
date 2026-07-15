import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CRMPage, CRMPageTitle } from '../../../components/crm'
import { Button, Modal, inputClassName } from '../../../components/ui'
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
import { RefreshCw } from 'lucide-react'

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
      toast.success('Lead created')
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
        toast.success('Lead stage updated')
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
      toast.success('Lead ID copied')
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

  const currency = rawPipeline?.meta?.currency || 'INR'
  const hasMoreLeads = Boolean(rawPipeline?.meta?.has_more)
  const totalLeads = Number(rawPipeline?.meta?.total_leads || 0)
  const boardLimit = Number(rawPipeline?.meta?.limit || 0)
  const loading = pipelineQuery.isLoading
  const hasError = pipelineQuery.isError

  return (
    <CRMPage>
      <CRMPageTitle
        title={selectedStageLabel ? `${selectedStageLabel} Pipeline` : 'CRM Pipeline'}
        description={selectedStageLabel ? `Showing leads in the ${selectedStageLabel} stage.` : 'Manage your leads and move them through the pipeline.'}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              + New Lead
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/crm/leads?import=1')}>
              Import Leads
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => pipelineQuery.refetch()} aria-label="Refresh pipeline">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        )}
      />

      <div className="space-y-4">
        <div className="space-y-4 xl:grid xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start xl:gap-4 xl:space-y-0">
          <main className="min-w-0 space-y-4">
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

          <PipelineTopMetrics visibleLeads={visibleLeads} stages={visibleBoard.stages} currency={currency} />
          {hasMoreLeads ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              Showing the latest {boardLimit.toLocaleString('en-IN')} of {totalLeads.toLocaleString('en-IN')} leads. Use filters to narrow the board.
            </div>
          ) : null}

        <PipelineBoardShell
          title={selectedStageLabel ? `${selectedStageLabel} board` : 'Pipeline board'}
          description={selectedStageLabel ? 'This view came from a workflow shortcut. Clear filters to return to the full pipeline.' : 'Drag leads between stages, or use the quick actions menu to move them with a single click.'}
        >
          {loading ? (
            <PipelineLoadingState />
          ) : hasError ? (
            <PipelineErrorState
              onRetry={() => pipelineQuery.refetch()}
              message={pipelineQuery.error?.response?.data?.detail || 'We could not load the pipeline board. Please retry.'}
            />
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
                {dragOverlayLead ? (
                  <div className="w-80 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-xl dark:border-gray-800 dark:bg-gray-900">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {dragOverlayLead.company_name || dragOverlayLead.prospect_name || 'Lead'}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {getLeadOwnerLabel(dragOverlayLead)}
                    </p>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </PipelineBoardShell>
          </main>

          <PipelineInsightRail
            visibleLeads={visibleLeads}
            stages={visibleBoard.stages}
            currency={currency}
            onLeadSelect={(lead) => navigate(`/crm/leads/${lead.id || lead._id}`)}
          />
        </div>
      </div>
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add lead"
        description="Capture the basic lead details first, then assign ownership and products."
        size="lg"
        footer={(
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="button" loading={createLeadMutation.isLoading} onClick={submitCreateLead}>Save lead</Button>
          </div>
        )}
      >
        <form className="space-y-5" onSubmit={submitCreateLead}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">First name *</span>
              <input className={inputClassName} placeholder="First name" value={createForm.first_name} onChange={(e) => setCreateForm((state) => ({ ...state, first_name: e.target.value }))} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Last name *</span>
              <input className={inputClassName} placeholder="Last name" value={createForm.last_name} onChange={(e) => setCreateForm((state) => ({ ...state, last_name: e.target.value }))} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Country code</span>
              <input className={inputClassName} placeholder="Country code" value={createForm.country_code} onChange={(e) => setCreateForm((state) => ({ ...state, country_code: e.target.value }))} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Phone *</span>
              <input className={inputClassName} placeholder="Phone" value={createForm.phone} onChange={(e) => setCreateForm((state) => ({ ...state, phone: e.target.value }))} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Email</span>
              <input className={inputClassName} placeholder="Email" value={createForm.email} onChange={(e) => setCreateForm((state) => ({ ...state, email: e.target.value }))} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Company name</span>
              <input className={inputClassName} placeholder="Company name" value={createForm.company_name} onChange={(e) => setCreateForm((state) => ({ ...state, company_name: e.target.value }))} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Category</span>
              <select className={inputClassName} value={createForm.category_id || defaultCategoryId} onChange={(e) => setCreateForm((state) => ({ ...state, category_id: e.target.value }))}>
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={getOptionId(category)} value={getOptionId(category)}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Product</span>
              <select className={inputClassName} value={createForm.product_ids || defaultProductIds} onChange={(e) => setCreateForm((state) => ({ ...state, product_ids: e.target.value }))}>
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={getOptionId(product)} value={getOptionId(product)}>{product.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Stage</span>
              <select className={inputClassName} value={createForm.current_stage || defaultStageId} onChange={(e) => setCreateForm((state) => ({ ...state, current_stage: e.target.value }))}>
                <option value="">Select stage</option>
                {stages.map((stage) => (
                  <option key={getStageValue(stage)} value={getStageValue(stage)}>{stage.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Owner</span>
              <select className={inputClassName} value={createForm.assigned_to || defaultOwnerId} onChange={(e) => setCreateForm((state) => ({ ...state, assigned_to: e.target.value }))}>
                <option value="">Select owner</option>
                {users.map((user) => (
                  <option key={getUserId(user)} value={getUserId(user)}>
                    {user.first_name} {user.last_name} {user.role ? `(${user.role})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Interest level</span>
              <select className={inputClassName} value={createForm.interest_level} onChange={(e) => setCreateForm((state) => ({ ...state, interest_level: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-text-muted">Estimated close date</span>
              <input className={inputClassName} type="date" value={createForm.estimated_close_date} onChange={(e) => setCreateForm((state) => ({ ...state, estimated_close_date: e.target.value }))} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-text-muted">Tags</span>
              <input className={inputClassName} placeholder="Tags, pipe-separated" value={createForm.tag} onChange={(e) => setCreateForm((state) => ({ ...state, tag: e.target.value }))} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-medium text-text-muted">Remark</span>
              <textarea className={`${inputClassName} min-h-28`} placeholder="Remark" value={createForm.remark} onChange={(e) => setCreateForm((state) => ({ ...state, remark: e.target.value }))} />
            </label>
          </div>
        </form>
      </Modal>
    </CRMPage>
  )
}
