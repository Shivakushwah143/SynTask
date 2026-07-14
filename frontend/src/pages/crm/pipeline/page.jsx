import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CRMPage, CRMPageTitle } from '../../../components/crm'
import { Button } from '../../../components/ui'
import { crmApi } from '../../../api/crm'
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

export default function CRMPipelinePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [localSearchValue, setLocalSearchValue] = useState('')
  const pipelineSearchContext = usePipelineSearchContext()
  const searchValue = pipelineSearchContext.searchValue ?? localSearchValue
  const setSearchValue = pipelineSearchContext.setSearchValue || setLocalSearchValue
  const pipelineQuery = useQuery(PIPELINE_QUERY_KEY, () => crmApi.getPipeline({ limit: 500 }), {
    staleTime: 5 * 60 * 1000,
  })
  const [activeLeadId, setActiveLeadId] = useState(null)
  const [dragOverlayLead, setDragOverlayLead] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const rawPipeline = pipelineQuery.data
  const board = useMemo(() => buildPipelineBoard(rawPipeline || {}), [rawPipeline])
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
            <Button type="button" variant="primary" size="sm" onClick={() => navigate('/crm/leads')}>
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
    </CRMPage>
  )
}
