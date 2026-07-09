import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CRMPage, CRMPageTitle, CRMSection } from '../../../components/crm'
import { Button } from '../../../components/ui'
import { crmApi } from '../../../api/crm'
import { useDebounce } from '../../../hooks/useDebounce'
import {
  PipelineBoard,
  PipelineBoardShell,
  PipelineErrorState,
  PipelineFiltersBar,
  PipelineLoadingState,
} from './components'
import {
  buildPipelineBoard,
  filterPipelineLeads,
  getLeadDealValue,
  getLeadOwnerLabel,
  getStageKey,
  moveLeadInBoard,
  ownerOptionsFromBoard,
  parsePipelineFilters,
  stageOptionsFromBoard,
} from './utils'
import { CRMContent, CRMStatCard } from '../../../components/crm'
import { FolderKanban, Layers3, TrendingUp, Users } from 'lucide-react'

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
  const { searchValue = '', setSearchValue } = usePipelineSearchContext()
  const pipelineQuery = useQuery(PIPELINE_QUERY_KEY, crmApi.getPipeline, {
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
  const debouncedSearch = useDebounce(searchValue, 160)
  const effectiveSearch = useMemo(() => {
    const typedSearch = debouncedSearch?.trim() || ''
    return typedSearch || filters.q || ''
  }, [debouncedSearch, filters.q])

  useEffect(() => {
    if (filters.q !== searchValue) {
      setSearchValue?.(filters.q)
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
    setSearchValue?.('')
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
        if (updatedLeadId) {
          queryClient.setQueryData(PIPELINE_QUERY_KEY, (currentBoard) => {
            const boardState = buildPipelineBoard(currentBoard || {})
            const nextStageKey = getStageKey(updatedLead)
            return moveLeadInBoard(boardState, updatedLeadId, nextStageKey, updatedLead)
          })
          queryClient.invalidateQueries(['crm-pipeline-history', updatedLeadId], { exact: true })
        }
        toast.success('Lead stage updated')
      },
    }
  )

  const handleLeadMove = useCallback((lead, nextStageKey) => {
    const leadId = lead?.id || lead?._id
    if (!leadId || !nextStageKey) return
    if (getStageKey(lead) === nextStageKey) return
    moveLeadMutation.mutate({ leadId, stageKey: nextStageKey, lead })
  }, [moveLeadMutation])

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
    setSearchValue?.(value)
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
  const loading = pipelineQuery.isLoading
  const hasError = pipelineQuery.isError
  const visibleLeadCount = visibleLeads.length
  const visibleDealValue = visibleLeads.reduce((sum, lead) => sum + getLeadDealValue(lead), 0)
  const activeStageCount = visibleBoard.stages.filter((stage) => stage.leads.length > 0).length

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM Pipeline"
        title="Pipeline"
        description="HubSpot-inspired board powered by live CRM pipeline data from the Sales domain."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
              Reset
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => pipelineQuery.refetch()}>
              Refresh
            </Button>
          </div>
        )}
      />

      <CRMContent
        aside={(
          <div className="space-y-4">
            <CRMStatCard
              icon={FolderKanban}
              label="Visible leads"
              value={visibleLeadCount}
              helper="Matches the current filters and search."
              tone="emerald"
            />
            <CRMStatCard
              icon={TrendingUp}
              label="Visible deal value"
              value={visibleDealValue.toLocaleString('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 })}
              helper="Approximate pipeline value from visible leads."
              tone="amber"
            />
            <CRMStatCard
              icon={Layers3}
              label="Active stages"
              value={activeStageCount}
              helper="Columns with at least one visible lead."
              tone="slate"
            />
            <CRMStatCard
              icon={Users}
              label="Board width"
              value={visibleBoard.stages.length}
              helper="All configured pipeline stages."
              tone="blue"
            />
          </div>
        )}
      >
        <CRMSection
          title="Board controls"
          description="Search and filters shape the visible board without refetching the full dataset."
          actions={(
            <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
              Reset filters
            </Button>
          )}
        >
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
        </CRMSection>

        <PipelineBoardShell
          title="CRM board"
          description="Drag leads between stages, or use the quick actions menu to move them with a single click."
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
                onCopyLeadId={handleCopyLeadId}
                onLeadSelect={(lead) => navigate(`/crm/leads/${lead.id || lead._id}`)}
                onResetFilters={clearFilters}
                visibleLeads={visibleLeads}
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
      </CRMContent>
    </CRMPage>
  )
}
