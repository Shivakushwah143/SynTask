import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
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
import { isAssignableActiveUser } from '../../../utils/userFilters'
import { useDebounce } from '../../../hooks/useDebounce'
import { PhoneInput } from '../../../components/ui/PhoneInput'
import {
  PipelineBoard,
  PipelineBoardShell,
  PipelineErrorState,
  PipelineFiltersBar,
  PipelineInsightRail,
  PipelineLoadingState,
  PipelineStageListView,
} from './components'
import {
  buildPipelineBoard,
  filterPipelineLeads,
  getLeadOwnerLabel,
  getAllowedPipelineStageKeys,
  getCanonicalPipelineStageKey,
  getLeadPriority,
  getStageStatusOptions,
  isAllowedPipelineTransition,
  ownerOptionsFromBoard,
  parsePipelineFilters,
  stageOptionsFromBoard,
} from './utils'
import { StageRequirementsDialog } from '../../../components/sales/StageRequirementsDialog'
import { ContactAttemptDialog } from '../../../components/sales/ContactAttemptDialog'
import {
  TRANSITION_BLOCKER,
  TRANSITION_WARNING_TOAST,
  buildStatusWarningMessage,
  classifyTransitionFailure,
} from '../../../utils/salesTransition'

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
  // Master list endpoints (e.g. /sales/masters/stages) return { total, items }.
  if (Array.isArray(data?.items)) return data.items
  return []
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CRMPipelinePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { stageKey: stageRouteKey = '' } = useParams()
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
  // Short staleness so the board never diverges from the lead detail page: a
  // 5-minute cache made a budget saved on the detail page stay invisible on the
  // pipeline (Value column showing Rs 0) until the user manually edited again.
  const pipelineQuery = useQuery(PIPELINE_QUERY_KEY, () => crmApi.getPipeline(), {
    staleTime: 30 * 1000,
  })
  const categoriesQuery = useQuery('crm-lead-categories', salesApi.getCategories, { staleTime: 5 * 60 * 1000 })
  const stagesQuery = useQuery('crm-lead-stages', salesApi.getStages, { staleTime: 5 * 60 * 1000 })
  const usersQuery = useQuery('crm-lead-users', () => usersAPI.getAssignableUsers(), { staleTime: 5 * 60 * 1000 })
  const productsQuery = useQuery('crm-lead-products', salesApi.getProducts, { staleTime: 5 * 60 * 1000 })
  const [activeLeadId, setActiveLeadId] = useState(null)
  const [dragOverlayLead, setDragOverlayLead] = useState(null)
  const [requirementsDialog, setRequirementsDialog] = useState(null)
  const [contactAttemptLead, setContactAttemptLead] = useState(null)
  // Lead id whose stage move is in flight through the required-details dialog
  // ("Save and Move Forward"). Kept separate from the mutation so the row keeps
  // its loading state while that dialog-driven move runs, giving one consistent
  // in-flight indicator on the stage list / board.
  const [dialogMovingLeadId, setDialogMovingLeadId] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const rawPipeline = pipelineQuery.data
  const board = useMemo(() => buildPipelineBoard(rawPipeline || {}), [rawPipeline])
  const categories = useMemo(() => getResponseItems(categoriesQuery.data, 'categories'), [categoriesQuery.data])
  const stages = useMemo(() => getResponseItems(stagesQuery.data, 'stages'), [stagesQuery.data])
  const users = useMemo(
    () => getResponseItems(usersQuery.data, 'users').filter(isAssignableActiveUser),
    [usersQuery.data]
  )
  const products = useMemo(() => getResponseItems(productsQuery.data, 'products'), [productsQuery.data])
  const loading = pipelineQuery.isLoading
  const hasError = pipelineQuery.isError
  const filters = useMemo(() => parsePipelineFilters(searchParams), [searchParams])
  const routeStageKey = useMemo(() => getCanonicalPipelineStageKey(stageRouteKey), [stageRouteKey])
  const queryStageKey = useMemo(() => getCanonicalPipelineStageKey(filters.stage), [filters.stage])
  const requestedStageKey = routeStageKey || queryStageKey
  const selectedStage = useMemo(
    () => board.stages.find((stage) => stage.key === requestedStageKey) || null,
    [board.stages, requestedStageKey]
  )
  const selectedStageKey = selectedStage?.key || ''
  const selectedStageView = useMemo(() => {
    if (!selectedStage) return null
    const stageIndex = board.stages.findIndex((stage) => stage.key === selectedStage.key)
    return {
      ...selectedStage,
      previousStageKey: board.stages[stageIndex - 1]?.key || null,
      nextStageKey: board.stages[stageIndex + 1]?.key || null,
    }
  }, [board.stages, selectedStage])
  const scopedStages = useMemo(
    () => (selectedStage ? [selectedStage] : board.stages),
    [board.stages, selectedStage]
  )

  const selectedStageLabel = useMemo(() => {
    if (!selectedStage) return ''
    return selectedStage.name || selectedStage.label || selectedStage.key || ''
  }, [selectedStage])

  const debouncedSearch = useDebounce(searchValue, 160)
  const effectiveSearch = useMemo(() => {
    const typedSearch = debouncedSearch?.trim() || ''
    return typedSearch || filters.q || ''
  }, [debouncedSearch, filters.q])

  useEffect(() => {
    setSearchValue(filters.q)
  }, [filters.q, setSearchValue])

  useEffect(() => {
    if (!stageRouteKey || loading || hasError) return
    if (selectedStage) return
    navigate('/crm/pipeline', { replace: true })
  }, [hasError, loading, navigate, selectedStage, stageRouteKey])

  useEffect(() => {
    if (effectiveSearch !== filters.q) {
      setSearchParams((current) => mergeSearchParams(current, { q: effectiveSearch }), { replace: true })
    }
  }, [effectiveSearch, filters.q, setSearchParams])

  const visibleLeads = useMemo(() => {
    const allLeads = scopedStages.flatMap((stage) => stage.leads)
    return filterPipelineLeads(allLeads, { ...filters, q: effectiveSearch })
  }, [effectiveSearch, filters, scopedStages])

  const visibleLeadIds = useMemo(() => new Set(visibleLeads.map((lead) => lead.id || lead._id)), [visibleLeads])
  const hasActiveFilters = useMemo(() => (
    Boolean(effectiveSearch)
    || Object.entries(filters).some(([key, value]) => key !== 'q' && key !== 'stage' && String(value || '').trim())
  ), [effectiveSearch, filters])

  const visibleBoard = useMemo(() => {
    const nextStages = scopedStages
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
  }, [board, scopedStages, visibleLeadIds])

  const interactiveStages = selectedStage ? board.stages : visibleBoard.stages

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
    if (Object.prototype.hasOwnProperty.call(partial, 'stage')) {
      const nextStageKey = getCanonicalPipelineStageKey(partial.stage)
      const nextSearch = mergeSearchParams(searchParams, partial)
      nextSearch.delete('stage')
      navigate({
        pathname: nextStageKey ? `/crm/pipeline/${nextStageKey}` : '/crm/pipeline',
        search: nextSearch.toString() ? `?${nextSearch.toString()}` : '',
      }, { replace: true })
      return
    }
    setSearchParams((current) => mergeSearchParams(current, partial), { replace: true })
  }, [navigate, searchParams, setSearchParams])

  const clearFilters = useCallback(() => {
    setSearchValue('')
    if (selectedStageKey) {
      navigate(`/crm/pipeline/${selectedStageKey}`, { replace: true })
      return
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      Array.from(next.keys()).forEach((key) => next.delete(key))
      return next
    }, { replace: true })
  }, [navigate, selectedStageKey, setSearchParams, setSearchValue])

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

  // The board lead can be up to 5 minutes stale (cached pipeline query), so the
  // required-details popup must analyze the live record: a field saved just now
  // elsewhere must not be asked for again (and a field a previous save actually
  // failed to persist must be asked for). Falls back to the snapshot on error.
  const fetchFreshLeadForDialog = useCallback(async (leadId) => {
    if (!leadId) return null
    try {
      const response = await salesApi.getLead(leadId)
      const freshLead = response?.data || response
      return freshLead && typeof freshLead === 'object' ? freshLead : null
    } catch {
      return null
    }
  }, [])

  // Shared failure handling for stage-movement attempts. Business validation
  // blockers open the required-details popup or show a warning; only genuine
  // technical failures surface as error toasts.
  const handleMoveFailure = async (error, variables) => {
    const blocker = classifyTransitionFailure(error, 'Failed to update lead stage')
    if (blocker.category === TRANSITION_BLOCKER.MISSING_DETAILS) {
      const leadId = variables?.lead?.id || variables?.lead?._id
      const freshLead = await fetchFreshLeadForDialog(leadId)
      setRequirementsDialog({
        blocker,
        lead: freshLead ? { ...(variables?.lead || {}), ...freshLead } : variables?.lead,
        targetStageKey: variables?.stageKey,
      })
      return
    }
    if (
      blocker.category === TRANSITION_BLOCKER.STATUS_REQUIREMENT
      || blocker.category === TRANSITION_BLOCKER.ACTION_REQUIREMENT
    ) {
      toast(buildStatusWarningMessage(blocker) || blocker.message, TRANSITION_WARNING_TOAST)
      return
    }
    if (blocker.category === TRANSITION_BLOCKER.PERMISSION_DENIED) {
      toast(blocker.message, { icon: '🔒', ...TRANSITION_WARNING_TOAST })
      return
    }
    toast.error(blocker.message)
  }

  const moveLeadMutation = useMutation(
    ({ leadId, stageKey }) => crmApi.updatePipelineStage(leadId, { stage: stageKey }),
    {
      // No optimistic board write: the lead must NOT visibly move until the
      // backend confirms the move. The row/card stays on its current stage with
      // the button showing its loading state (movingLeadId drives isMovePending
      // in the stage list and board cards), so a failed request never causes
      // the lead to appear to jump stages and then snap back.
      onMutate: async () => {
        // Drop any in-flight board refetch so it cannot race the PATCH and
        // cache a pre-move snapshot right before the success refetch.
        await queryClient.cancelQueries(PIPELINE_QUERY_KEY)
      },
      onError: (error, variables) => {
        handleMoveFailure(error, variables)
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
    if (moveLeadMutation.isLoading || dialogMovingLeadId) return
    const sourceStage = interactiveStages.find((stage) => stage.leads.some((item) => (item.id || item._id) === leadId))
    const targetStage = interactiveStages.find((stage) => stage.key === nextStageKey)
    if (sourceStage?.key === nextStageKey) return
    if (sourceStage && targetStage && !isAllowedPipelineTransition(sourceStage, targetStage)) {
      toast(`Move ${sourceStage.name} leads to ${targetStage.name} through the required workflow steps.`, TRANSITION_WARNING_TOAST)
      return
    }
    // onError already handles the dialog/warning; swallow the rejection so board
    // buttons and drag-and-drop never produce an unhandled promise.
    return moveLeadMutation.mutateAsync({ leadId, stageKey: nextStageKey, lead }).catch(() => {})
  }, [dialogMovingLeadId, interactiveStages, moveLeadMutation])

  // ── Required-details dialog (guided validation) ────────────────────────────
  // Save Details: persists only the missing editable fields, keeps the lead on
  // its current stage. Save and Move Forward: persists, then re-runs the
  // transition; the lead moves only when every backend rule passes.
  const handleDialogSaveFields = async (values) => {
    const leadId = requirementsDialog?.lead?.id || requirementsDialog?.lead?._id
    if (!leadId) return
    try {
      await salesApi.updateLeadForm(leadId, values)
    } catch (error) {
      const blocker = classifyTransitionFailure(error, 'Unable to save details')
      if (blocker.category === TRANSITION_BLOCKER.TECHNICAL_ERROR) toast.error(blocker.message)
      else toast(blocker.message, TRANSITION_WARNING_TOAST)
      throw error
    }
    queryClient.invalidateQueries(PIPELINE_QUERY_KEY)
    queryClient.invalidateQueries('crm-leads-entry')
    queryClient.invalidateQueries('sales-prospects')
    toast.success('Details saved')
    setRequirementsDialog(null)
  }

  const handleDialogSaveAndMove = async (values) => {
    const leadId = requirementsDialog?.lead?.id || requirementsDialog?.lead?._id
    const stageKey = requirementsDialog?.targetStageKey
    if (!leadId || !stageKey) return
    try {
      await salesApi.updateLeadForm(leadId, values)
      // Drive the same in-flight indicator as a direct stage move so the row's
      // Move button shows loading (and is disabled) while the move runs.
      setDialogMovingLeadId(leadId)
      try {
        await crmApi.updatePipelineStage(leadId, { stage: stageKey })
      } finally {
        setDialogMovingLeadId(null)
      }
      queryClient.invalidateQueries(PIPELINE_QUERY_KEY)
      queryClient.invalidateQueries('crm-leads-entry')
      queryClient.invalidateQueries('sales-prospects')
      queryClient.invalidateQueries(['crm-pipeline-history', leadId], { exact: true })
      toast.success('Lead moved successfully! 🚀')
      setRequirementsDialog(null)
    } catch (error) {
      const blocker = classifyTransitionFailure(error, 'Failed to update lead stage')
      if (blocker.category === TRANSITION_BLOCKER.TECHNICAL_ERROR) {
        setRequirementsDialog(null)
        toast.error(blocker.message)
      } else {
        // Keep the popup open with the updated blocker (e.g. remaining status rule)
        // and analyze the LIVE record. The stored blocker can be stale — a
        // previous save may or may not have persisted — so re-fetching prevents
        // a green "all requirements fulfilled" banner against an outdated lead
        // snapshot while the record still actually misses a field.
        const freshLead = await fetchFreshLeadForDialog(leadId)
        setRequirementsDialog((current) => ({
          ...current,
          blocker,
          lead: {
            ...(current?.lead || {}),
            ...(freshLead || {}),
            ...values,
          },
        }))
      }
    }
  }

  const updateStatusMutation = useMutation(
    ({ leadId, stageStatus }) => crmApi.updateStageStatus(leadId, stageStatus),
    {
      onSuccess: (response, variables) => {
        queryClient.invalidateQueries(PIPELINE_QUERY_KEY)
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('sales-prospects')
        if (variables?.leadId) {
          queryClient.invalidateQueries(['crm-pipeline-history', variables.leadId], { exact: true })
        }
        const message = response?.message || 'Stage status updated successfully'
        toast.success(message)
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Failed to update stage status')
      },
    }
  )

  // ── Record Contact Attempt (Acquire) ──────────────────────────────────────
  // Creates a real call/email activity and backfills the lead's contact
  // timestamps; the backend then treats the first-contact gate as satisfied.
  const recordContactMutation = useMutation(
    async ({ leadId, method, notes }) => {
      // The lead timestamp is the source of truth for the first-contact gate;
      // the activity is the audit trail (types: call / email / follow_up).
      await salesApi.updateLeadForm(leadId, { last_contacted_at: new Date().toISOString() })
      const activityType = method === 'email' ? 'email' : method === 'call' ? 'call' : 'follow_up'
      const title = method === 'email'
        ? 'First contact email'
        : method === 'call'
          ? 'First contact call'
          : `First contact via ${method}`
      await crmApi.createActivity({
        entity_type: 'lead',
        entity_id: leadId,
        activity_type: activityType,
        title,
        description: notes || `First contact attempt recorded via ${method}.`,
        status: 'completed',
      })
    },
    {
      onSuccess: () => {
        toast.success('Contact attempt recorded')
        setContactAttemptLead(null)
        queryClient.invalidateQueries(PIPELINE_QUERY_KEY)
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('sales-prospects')
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Failed to record contact attempt')
      },
    }
  )

  const handleRecordContact = useCallback((lead) => {
    if (!lead?.id && !lead?._id) return
    setContactAttemptLead(lead)
  }, [])

  const handleContactSubmit = useCallback((method, notes) => {
    const leadId = contactAttemptLead?.id || contactAttemptLead?._id
    if (!leadId) return
    recordContactMutation.mutate({ leadId, method, notes })
  }, [contactAttemptLead, recordContactMutation])

  const handleStageStatusChange = useCallback((lead, nextStatus) => {
    const leadId = lead?.id || lead?._id
    if (!leadId || !nextStatus) return
    if (updateStatusMutation.isLoading) return
    updateStatusMutation.mutate({ leadId, stageStatus: nextStatus })
  }, [updateStatusMutation])

  // ── Bulk assign (Acquire stage multi-select) ───────────────────────────────
  const bulkAssignMutation = useMutation(
    ({ leadIds, userId }) => crmApi.bulkAssignLeads({ lead_ids: leadIds, target_user_id: userId }),
    {
      onSuccess: (data) => {
        const assignedCount = Number(data?.assigned_count ?? data?.assigned?.length ?? 0)
        const skippedCount = Number(data?.skipped_count ?? 0)
        toast.success(assignedCount
          ? `${assignedCount} lead${assignedCount === 1 ? '' : 's'} assigned` + (skippedCount ? `, ${skippedCount} skipped` : '')
          : 'No leads were assigned')
        queryClient.invalidateQueries(PIPELINE_QUERY_KEY)
        queryClient.invalidateQueries('crm-leads-entry')
        queryClient.invalidateQueries('sales-prospects')
      },
      onError: (error) => {
        toast.error(error?.response?.data?.detail || 'Failed to assign selected leads')
      },
    }
  )

  // Returns a promise so the stage list can clear its selection only on success.
  const handleBulkAssign = useCallback((leadIds, userId) => {
    if (!leadIds?.length || !userId) return Promise.resolve()
    if (bulkAssignMutation.isLoading) return Promise.resolve()
    return bulkAssignMutation.mutateAsync({ leadIds, userId })
  }, [bulkAssignMutation])

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
    const allLeads = scopedStages.flatMap(stage => stage.leads)
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
    const hotLeads = allLeads.filter(lead =>
      ['critical', 'high'].includes(getLeadPriority(lead))
    ).length
    const activeStages = scopedStages.filter(stage => (stage.leads || []).length > 0).length
    const totalValue = allLeads.reduce((sum, lead) =>
      sum + parseFloat(lead.amount || lead.value || 0), 0
    )
    const avgValue = total > 0 ? totalValue / total : 0
    const conversionRate = total > 0 ? (wonLeads / total) * 100 : 0

    return { total, openLeads, wonLeads, highValueLeads, hotLeads, activeStages, totalValue, avgValue, conversionRate }
  }, [scopedStages])

  // Single source of truth for "this lead's move is in flight": either the
  // direct move mutation or the dialog-driven save-and-move.
  const effectiveMovingLeadId = moveLeadMutation.isLoading
    ? moveLeadMutation.variables?.leadId
    : dialogMovingLeadId

  const currency = rawPipeline?.meta?.currency || 'INR'
  const hasMoreLeads = Boolean(rawPipeline?.meta?.has_more)
  const totalLeads = Number(rawPipeline?.meta?.total_leads || 0)
  const boardLimit = Number(rawPipeline?.meta?.limit || 0)

  // ============================================================
  // Stat Card Component
  // ============================================================
  // Compact metric tile: icon + label on one row with the value beside it, so all
  // six stats fit in a single dense band on wide screens.
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
      <div className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r ${colors[color]} text-white shadow-sm transition-transform group-hover:scale-105`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500 dark:text-gray-400">{label}</p>
            <p className="truncate text-lg font-bold leading-tight text-gray-900 dark:text-white">
              {typeof value === 'number' && label.includes('Value')
                ? `${currency} ${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                : typeof value === 'number'
                  ? value.toLocaleString('en-IN')
                  : value}
              {suffix}
            </p>
            {subtitle ? <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
          </div>
        </div>
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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 p-4 text-white shadow-lg sm:p-5">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-40 w-40 rounded-full bg-white/10 blur-2xl"></div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold sm:text-xl">
                {selectedStageLabel ? `${selectedStageLabel} Leads` : 'Sales Pipeline'}
              </h1>
              <p className="truncate text-xs text-indigo-100 sm:text-sm">
                {selectedStageLabel
                  ? `Showing ${selectedStageLabel} stage leads.`
                  : 'Manage leads and move them through the pipeline workflow.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50 dark:bg-gray-900 dark:text-indigo-300 dark:hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" />
              Add Lead
            </button>
            <button
              type="button"
              onClick={() => navigate('/crm/leads?import=1')}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <Import className="h-4 w-4" />
              Import
            </button>
            <button
              type="button"
              onClick={() => pipelineQuery.refetch()}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* STAT CARDS - Merged Pipeline Metrics */}
      {/* ============================================================ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total Leads"
          value={pipelineStats.total}
          icon={Users}
          color="indigo"
          subtitle="All leads"
        />

        <StatCard
          label="Active Leads"
          value={pipelineStats.openLeads}
          icon={TrendingUp}
          color="emerald"
          subtitle="In progress"
        />

        <StatCard
          label="Hot Leads"
          value={pipelineStats.hotLeads}
          icon={Target}
          color="rose"
          subtitle="High priority"
        />

        <StatCard
          label="Won"
          value={pipelineStats.wonLeads}
          icon={Award}
          color="blue"
          subtitle={`${pipelineStats.conversionRate.toFixed(1)}% conversion`}
        />

        <StatCard
          label="Active Stages"
          value={pipelineStats.activeStages}
          icon={Activity}
          color="teal"
          subtitle="Stages with leads"
        />

        <StatCard
          label="Pipeline Value"
          value={pipelineStats.totalValue}
          icon={DollarSign}
          color="amber"
          subtitle={`${pipelineStats.avgValue.toFixed(0)} avg`}
        />
      </div>

      {/* ============================================================ */}
      {/* FILTERS BAR - Section with Header */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white px-4 py-3 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/30">
              <Filter className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Filters & Search</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Narrow leads by stage, owner, status, or keyword</p>
            </div>
          </div>
        </div>
        <div className="p-3">
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
          {selectedStageKey ? (
            <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
                  {selectedStageKey === 'discovery' ? 'Discovery Outcome' : `${selectedStageLabel} Status`}
                </span>
                {filters.status ? (
                  <button
                    type="button"
                    onClick={() => updateFilters({ status: '' })}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </button>
                ) : null}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => updateFilters({ status: '' })}
                  className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    !filters.status
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  All
                </button>
                {getStageStatusOptions(selectedStageKey).map((option) => {
                  const active = filters.status === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateFilters({ status: option.value })}
                      className={`inline-flex shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        active
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

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
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white px-4 py-3 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/30">
              <LayoutDashboard className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                {selectedStageLabel ? `${selectedStageLabel} Leads` : 'Pipeline Board'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedStageLabel
                  ? 'Narrow this stage with filters, or switch stages from the Sales tabs.'
                  : 'Drag leads between stages, or use the quick actions menu to move them.'}
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
          ) : selectedStageView ? (
            <PipelineStageListView
              stage={selectedStageView}
              stages={interactiveStages}
              currency={currency}
              users={users}
              movingLeadId={effectiveMovingLeadId}
              statusUpdatingId={updateStatusMutation.isLoading ? updateStatusMutation.variables?.leadId : null}
              onMoveLeadToStage={handleLeadMove}
              onUpdateStageStatus={handleStageStatusChange}
              onRecordContact={handleRecordContact}
              onLeadSelect={(lead) => navigate(`/crm/leads/${lead.id || lead._id}`)}
              onResetFilters={clearFilters}
              onBulkAssign={handleBulkAssign}
              bulkAssigning={bulkAssignMutation.isLoading}
              leads={visibleLeads}
              hasActiveFilters={hasActiveFilters}
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
                movingLeadId={effectiveMovingLeadId}
                statusUpdatingId={updateStatusMutation.isLoading ? updateStatusMutation.variables?.leadId : null}
                users={users}
                onMoveLeadToStage={handleLeadMove}
                onUpdateStageStatus={handleStageStatusChange}
                onRecordContact={handleRecordContact}
                getAllowedStageKeys={(stage) => getAllowedPipelineStageKeys(stage, interactiveStages)}
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
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white px-4 py-3 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/30">
              <BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Pipeline Insights</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Key metrics and analytics</p>
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
      {/* RECORD CONTACT ATTEMPT - Acquire stage quick action */}
      {/* ============================================================ */}
      <ContactAttemptDialog
        open={Boolean(contactAttemptLead)}
        lead={contactAttemptLead}
        onClose={() => setContactAttemptLead(null)}
        onRecord={handleContactSubmit}
        saving={recordContactMutation.isLoading}
      />

      {/* ============================================================ */}
      {/* REQUIRED DETAILS DIALOG - Guided stage-transition validation */}
      {/* ============================================================ */}
      <StageRequirementsDialog
        open={Boolean(requirementsDialog)}
        blocker={requirementsDialog?.blocker}
        lead={requirementsDialog?.lead}
        users={users}
        onClose={() => setRequirementsDialog(null)}
        onSaveFields={handleDialogSaveFields}
        onSaveAndMove={handleDialogSaveAndMove}
        onOpenLeadEditor={() => {
          const leadId = requirementsDialog?.lead?.id || requirementsDialog?.lead?._id
          setRequirementsDialog(null)
          if (leadId) navigate(`/crm/leads/${leadId}`)
        }}
      />

      {/* ============================================================ */}
      {/* CREATE LEAD MODAL - Beautiful Glassmorphism */}
      {/* ============================================================ */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreateOpen(false)
          }}
        >
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
