import { timeService } from '@/services/timeService'

export const PIPELINE_FILTER_KEYS = ['q', 'owner', 'priority', 'tags', 'minValue', 'maxValue', 'createdFrom', 'createdTo', 'stage', 'status']

export const PIPELINE_FILTER_DEFAULTS = {
  q: '',
  owner: '',
  priority: '',
  tags: '',
  minValue: '',
  maxValue: '',
  createdFrom: '',
  createdTo: '',
  stage: '',
  status: '',
}

// The pipeline Value column must match what the lead-detail page shows. For
// open leads the Budget (edited in the lead overview) is the canonical value;
// won_amount stays authoritative once a lead closes (the pipeline serializes
// both fields, so the order between them is what decides the display).
export const DEAL_VALUE_FIELDS = ['won_amount', 'budget', 'deal_value', 'dealValue', 'value', 'amount']
export const OWNER_FIELDS = ['owner_name', 'ownerName', 'assigned_to_name', 'assignedToName', 'assigned_user_name', 'assignee_name', 'owner', 'assigned_user', 'assignee', 'assigned_to']
export const OWNER_ID_FIELDS = ['owner_id', 'ownerId', 'assigned_to_id', 'assignedToId', 'assigned_to']
export const CONTACT_FIELDS = ['primary_contact', 'primary_contact_name', 'contact_name', 'contact', 'prospect_name']
export const TAG_FIELDS = ['tags', 'tag']

export const normalizeText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

export const normalizeNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const formatCurrency = (value, currency = 'INR') => {
  const amount = normalizeNumber(value)
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `Rs ${amount.toLocaleString('en-IN')}`
  }
}

export const formatShortDate = (value) => {
  if (!value) return 'N/A'
  const date = timeService.instant(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return timeService.formatPattern(value, 'MMM d, yyyy')
}

export const buildLeadSearchText = (lead) => {
  const values = [
    lead?.company_name,
    lead?.crm_company_name,
    lead?.crm_contact_name,
    ...CONTACT_FIELDS.map((field) => lead?.[field]),
    ...OWNER_FIELDS.map((field) => lead?.[field]),
    lead?.prospect_name,
    lead?.current_stage,
  ]
  return values.filter(Boolean).map(normalizeText).join(' ')
}

const CLOSED_STAGE_KEYS = new Set(['won', 'lost'])

// The lead-detail header edit writes won_amount ("Deal value"); an empty save
// stores 0. That 0 is not a deal size and must never shadow a real value stored
// in a sibling field (the overview writes budget) — a Qualify lead with budget
// set must not display Rs 0 just because won_amount is 0. Once a deal closes,
// however, won_amount is the authoritative closed value: a genuinely closed
// lead must report its recorded won amount (even 0) rather than fall back to a
// pre-close budget.
export const getLeadDealValue = (lead) => {
  const stageKey = getCanonicalPipelineStageKey(lead?.current_stage || lead?.stage)
  const isClosed = CLOSED_STAGE_KEYS.has(stageKey)
  for (const field of DEAL_VALUE_FIELDS) {
    const raw = lead?.[field]
    if (raw === undefined || raw === null || raw === '') continue
    const value = normalizeNumber(raw)
    if (value !== 0) return value
    // For closed leads a recorded zero won_amount is authoritative (deal closed
    // at 0 / free pilot) — it must win over any leftover budget.
    if (isClosed && field === 'won_amount') return 0
  }
  return 0
}

export const getLeadPriority = (lead) => normalizeText(lead?.priority || lead?.interest_level || 'medium') || 'medium'

export const getLeadTags = (lead) => {
  for (const field of TAG_FIELDS) {
    const tags = lead?.[field]
    if (Array.isArray(tags)) return tags.filter(Boolean).map(String)
    if (typeof tags === 'string' && tags.trim()) return tags.split('|').map((tag) => tag.trim()).filter(Boolean)
  }
  return []
}

const LIKELY_ID_PATTERN = /^(?:[a-f\d]{24}|[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})$/i

const isLikelyIdentifier = (value) => LIKELY_ID_PATTERN.test(String(value || '').trim())

const getDisplayName = (value) => {
  if (!value) return ''
  if (typeof value === 'object') {
    const nameParts = [value.first_name || value.firstName, value.last_name || value.lastName].filter(Boolean)
    const label = value.full_name || value.fullName || value.name || value.display_name || value.displayName || nameParts.join(' ')
    return label && !isLikelyIdentifier(label) ? String(label) : ''
  }
  return isLikelyIdentifier(value) ? '' : String(value)
}

export const getLeadOwnerLabel = (lead) => {
  for (const field of OWNER_FIELDS) {
    const owner = getDisplayName(lead?.[field])
    if (owner) return owner
  }
  return 'Unassigned'
}

export const getLeadOwnerValue = (lead) => {
  for (const field of OWNER_ID_FIELDS) {
    const value = lead?.[field]
    if (value !== undefined && value !== null && value !== '') return normalizeText(value)
  }
  return normalizeText(getLeadOwnerLabel(lead))
}

const getUserOptionLabel = (user) => {
  if (!user) return ''
  const nameParts = [user.first_name || user.firstName, user.last_name || user.lastName].filter(Boolean)
  const label = user.full_name || user.fullName || user.name || user.display_name || user.displayName || nameParts.join(' ')
  return String(label || user.email || '').trim()
}

const getUserOptionValue = (user) => {
  const value = user?.id || user?._id || user?.user_id || user?.userId
  return value === undefined || value === null ? '' : String(value).trim()
}

// Single source of truth for the lead's person name: returns the first non-empty
// contact field as-is (no fallback label), shared by the label helper and the
// pipeline table so every view shows the same person.
export const getLeadRawContactName = (lead) => {
  const contact =
    lead?.crm_contact_name ||
    lead?.primary_contact_name ||
    lead?.contact_name ||
    lead?.prospect_name ||
    lead?.primary_contact ||
    lead?.contact
  return getDisplayName(contact)
}

export const getLeadContactLabel = (lead) => {
  return getLeadRawContactName(lead) || 'Unassigned contact'
}

export const getLeadStageKey = (lead) => normalizeText(lead?.current_stage || lead?.stage || lead?.stage_key)

export const getStageKey = (stage) => normalizeText(stage?.key || stage?.name || stage?.stage || stage?.id)

export const getStageLabel = (stage) => stage?.name || stage?.label || stage?.title || stage?.key || stage?.id || 'Stage'

// ── Stage inner-status configuration (mirrors backend STAGE_INNER_STATUSES) ──
// The ONLY allowed statuses per stage, kept in sync with app/crm/pipeline.py.
// Repeated labels (Draft / Sent / Accepted / ...) are always scoped by the stage.
export const STAGE_INNER_STATUSES = {
  acquire: [
    { value: 'new', label: 'New' },
    { value: 'imported', label: 'Imported' },
    { value: 'assigned', label: 'Assigned' },
    { value: 'not_contacted', label: 'Not Contacted' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'wrong_number', label: 'Wrong Number' },
    { value: 'no_response', label: 'No Response' },
    { value: 'duplicate', label: 'Duplicate' },
    { value: 'spam', label: 'Spam' },
  ],
  qualify: [
    { value: 'not_contacted', label: 'Not Contacted' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'busy', label: 'Busy' },
    { value: 'call_back', label: 'Call Back' },
    { value: 'wrong_number', label: 'Wrong Number' },
    { value: 'no_response', label: 'No Response' },
    { value: 'interested', label: 'Interested' },
    { value: 'not_interested', label: 'Not Interested' },
    { value: 'spam', label: 'Spam' },
    { value: 'qualified', label: 'Qualified' },
  ],
  discovery: [
    { value: 'need_proposal', label: 'Need Proposal' },
    { value: 'need_audit', label: 'Need Audit' },
    { value: 'need_second_meeting', label: 'Need Second Meeting' },
    { value: 'follow_up_required', label: 'Follow-up Required' },
    { value: 'not_interested', label: 'Not Interested' },
    { value: 'lost', label: 'Lost' },
    { value: 'qualified', label: 'Qualified' },
  ],
  proposal: [
    { value: 'draft', label: 'Draft' },
    { value: 'generated', label: 'Generated' },
    { value: 'sent', label: 'Sent' },
    { value: 'viewed', label: 'Viewed' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'revision_requested', label: 'Revision Requested' },
    { value: 'expired', label: 'Expired' },
  ],
  negotiation: [
    { value: 'negotiation_started', label: 'Negotiation Started' },
    { value: 'waiting_client', label: 'Waiting Client' },
    { value: 'waiting_internal', label: 'Waiting Internal' },
    { value: 'discount_approval', label: 'Discount Approval' },
    { value: 'final_offer', label: 'Final Offer' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'rejected', label: 'Rejected' },
  ],
  agreement: [
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'viewed', label: 'Viewed' },
    { value: 'signed', label: 'Signed' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'expired', label: 'Expired' },
  ],
  won: [
    { value: 'payment_pending', label: 'Payment Pending' },
    { value: 'payment_received', label: 'Payment Received' },
    { value: 'onboarding_started', label: 'Onboarding Started' },
    { value: 'ready', label: 'Ready' },
    { value: 'transferred', label: 'Transferred' },
  ],
}

// Per-stage domain field that owns the canonical status on the lead record
// (mirrors backend STAGE_STATUS_DOMAIN_FIELD) — used for backward-compatible reads.
const STAGE_STATUS_DOMAIN_FIELD = {
  acquire: null,
  qualify: 'qualify_status',
  discovery: 'discovery_outcome',
  proposal: 'proposal_status',
  negotiation: 'negotiation_status',
  agreement: 'agreement_status',
  won: 'won_status',
}

export const getStageStatusOptions = (stageKey) =>
  STAGE_INNER_STATUSES[getCanonicalPipelineStageKey(stageKey)] || []

export const getLeadStageStatus = (lead) => {
  const snapshot = String(lead?.current_stage_status || '').toLowerCase().replace(/\s+/g, '_')
  if (snapshot) return snapshot
  const stageKey = getCanonicalPipelineStageKey(lead?.current_stage || '')
  const domainField = STAGE_STATUS_DOMAIN_FIELD[stageKey]
  const domainValue = domainField ? lead?.[domainField] : null
  return domainValue ? String(domainValue).toLowerCase().replace(/\s+/g, '_') : ''
}

export const getStageStatusLabel = (stageKey, statusKey) => {
  const status = normalizeText(statusKey)
  if (!status) return ''
  const option = getStageStatusOptions(stageKey).find((item) => item.value === status)
  return option?.label || status
}

// Guided sales journey stages. Legacy values (new/contacted/qualified) map onto the
// canonical Acquire/Qualify stages so existing leads keep their meaning.
const PIPELINE_STAGE_ALIASES = {
  acquire: 'acquire',
  lead: 'acquire',
  new: 'acquire',
  qualify: 'qualify',
  contacted: 'qualify',
  'follow-up': 'qualify',
  'follow up': 'qualify',
  'follow up call': 'qualify',
  qualified: 'qualify',
  qualification: 'qualify',
  discovery: 'discovery',
  meeting: 'discovery',
  'discovery scheduled': 'discovery',
  'discovery completed': 'discovery',
  'meeting completed': 'discovery',
  proposal: 'proposal',
  'proposal sent': 'proposal',
  negotiation: 'negotiation',
  agreement: 'agreement',
  won: 'won',
  client: 'won',
  lost: 'lost',
}

export const PIPELINE_ALLOWED_TRANSITIONS = {
  acquire: ['qualify', 'lost'],
  qualify: ['discovery', 'lost'],
  discovery: ['proposal', 'lost'],
  proposal: ['negotiation', 'lost'],
  negotiation: ['agreement', 'lost'],
  agreement: ['won', 'lost'],
  won: [],
  lost: ['acquire'],
}

export const getCanonicalPipelineStageKey = (value) => {
  const normalized = normalizeText(value).replace(/\s+/g, ' ')
  const slug = normalized.replace(/\s+/g, '-')
  return PIPELINE_STAGE_ALIASES[normalized] || PIPELINE_STAGE_ALIASES[slug] || slug
}

export const isAllowedPipelineTransition = (currentStage, targetStage) => {
  const current = getCanonicalPipelineStageKey(currentStage?.key || currentStage?.name || currentStage?.stage || currentStage)
  const target = getCanonicalPipelineStageKey(targetStage?.key || targetStage?.name || targetStage?.stage || targetStage)
  return Boolean(current && target && current !== target && PIPELINE_ALLOWED_TRANSITIONS[current]?.includes(target))
}

export const getAllowedPipelineStageKeys = (currentStage, stages = []) =>
  stages
    .filter((stage) => isAllowedPipelineTransition(currentStage, stage))
    .map((stage) => getStageKey(stage))

export const getStageOrder = (stage, index = 0) => {
  const order = Number(stage?.order)
  return Number.isFinite(order) ? order : index
}

export const getStageLeadCount = (stage, leads = []) => {
  if (typeof stage?.lead_count === 'number') return stage.lead_count
  return leads.length
}

export const getStageDealValue = (leads = []) => leads.reduce((total, lead) => total + getLeadDealValue(lead), 0)

export const parsePipelineFilters = (searchParams) =>
  PIPELINE_FILTER_KEYS.reduce((acc, key) => {
    acc[key] = searchParams.get(key) || PIPELINE_FILTER_DEFAULTS[key]
    return acc
  }, {})

export const filterPipelineLeads = (leads = [], filters = PIPELINE_FILTER_DEFAULTS) => {
  const query = normalizeText(filters.q)
  const owner = normalizeText(filters.owner)
  const priority = normalizeText(filters.priority)
  const tags = normalizeText(filters.tags)
  const stage = normalizeText(filters.stage)
  const status = normalizeText(filters.status)
  const minValue = filters.minValue !== '' ? normalizeNumber(filters.minValue) : null
  const maxValue = filters.maxValue !== '' ? normalizeNumber(filters.maxValue) : null
  const createdFrom = filters.createdFrom ? timeService.instant(filters.createdFrom) : null
  const createdTo = filters.createdTo ? timeService.instant(filters.createdTo) : null

  return leads.filter((lead) => {
    const searchText = buildLeadSearchText(lead)
    const ownerLabel = normalizeText(getLeadOwnerLabel(lead))
    const ownerValue = getLeadOwnerValue(lead)
    const priorityLabel = getLeadPriority(lead)
    const tagLabels = getLeadTags(lead).map(normalizeText)
    const leadStage = getLeadStageKey(lead)
    const dealValue = getLeadDealValue(lead)
    const createdAt = lead?.created_at || lead?.createdAt || lead?.created_date || lead?.createdDate
    const createdDate = createdAt ? timeService.instant(createdAt) : null

    if (query && !searchText.includes(query)) return false
    if (owner && ownerValue !== owner && !ownerLabel.includes(owner)) return false
    if (priority && priorityLabel !== priority) return false
    if (tags) {
      const tokens = tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      if (tokens.length && !tokens.some((tag) => tagLabels.includes(normalizeText(tag)))) return false
    }
    if (stage && leadStage !== stage) return false
    // Inner status is always scoped by the current stage (repeated labels like
    // Draft / Accepted / Sent appear in several stages).
    if (status && getLeadStageStatus(lead) !== status) return false
    if (minValue !== null && dealValue < minValue) return false
    if (maxValue !== null && dealValue > maxValue) return false
    if (createdFrom && createdDate && createdDate < createdFrom) return false
    if (createdTo && createdDate) {
      const endOfDay = timeService.instant(createdTo)
      endOfDay.setHours(23, 59, 59, 999)
      if (createdDate > endOfDay) return false
    }

    return true
  })
}

export const buildPipelineBoard = (pipelineResponse) => {
  const stages = Array.isArray(pipelineResponse?.stages) ? pipelineResponse.stages : []
  const leadsByStage = pipelineResponse?.leads_by_stage && typeof pipelineResponse.leads_by_stage === 'object'
    ? pipelineResponse.leads_by_stage
    : {}

  const normalizedStages = stages.map((stage, index) => {
    const key = getStageKey(stage)
    const leads = Array.isArray(stage?.leads) && !Object.keys(leadsByStage).length
      ? stage.leads
      : Array.isArray(leadsByStage[stage?.name])
        ? leadsByStage[stage.name]
        : Array.isArray(leadsByStage[key])
          ? leadsByStage[key]
          : []
    return {
      ...stage,
      key,
      name: getStageLabel(stage),
      order: getStageOrder(stage, index),
      leadCount: getStageLeadCount(stage, leads),
      totalDealValue: getStageDealValue(leads),
      leads,
    }
  })

  const normalizedLeadIndex = normalizedStages.reduce((acc, stage) => {
    stage.leads.forEach((lead) => {
      acc[lead.id || lead._id] = {
        stageKey: stage.key,
        stageName: stage.name,
      }
    })
    return acc
  }, {})

  return {
    stages: normalizedStages.sort((left, right) => left.order - right.order),
    leadIndex: normalizedLeadIndex,
    summary: pipelineResponse?.summary || {},
    meta: pipelineResponse?.meta || {},
  }
}

export const moveLeadInBoard = (board, leadId, nextStageKey, updatedLead = null) => {
  if (!board?.stages?.length) return board

  const movingLead = board.stages
    .flatMap((stage) => stage.leads || [])
    .find((lead) => (lead.id || lead._id) === leadId)

  const nextStages = board.stages.map((stage) => {
    const nextLeads = []
    stage.leads.forEach((lead) => {
      const id = lead.id || lead._id
      if (id === leadId) {
        return
      }
      if (stage.key === nextStageKey && updatedLead && (updatedLead.id === id || updatedLead._id === id)) {
        nextLeads.push({
          ...lead,
          ...updatedLead,
          current_stage: updatedLead.current_stage || updatedLead.stage || nextStageKey,
        })
        return
      }
      nextLeads.push(lead)
    })
    if (movingLead && stage.key === nextStageKey) {
      nextLeads.unshift({
        ...movingLead,
        ...(updatedLead || {}),
        current_stage: updatedLead?.current_stage || updatedLead?.stage || nextStageKey,
      })
    }
    return {
      ...stage,
      leads: nextLeads,
      leadCount: nextLeads.length,
      totalDealValue: getStageDealValue(nextLeads),
    }
  })

  const updatedLeadIndex = nextStages.reduce((acc, stage) => {
    stage.leads.forEach((lead) => {
      acc[lead.id || lead._id] = {
        stageKey: stage.key,
        stageName: stage.name,
      }
    })
    return acc
  }, {})

  return {
    ...board,
    stages: nextStages,
    leadIndex: updatedLeadIndex,
  }
}

export const stageOptionsFromBoard = (board) =>
  (board?.stages || []).map((stage) => ({
    value: stage.key,
    label: stage.name,
  }))

export const ownerOptionsFromBoard = (board, users = []) => {
  const values = new Map()
  users.forEach((user) => {
    const value = getUserOptionValue(user)
    const label = getUserOptionLabel(user)
    if (value && label) values.set(value, label)
  })
  ;(board?.stages || []).forEach((stage) => {
    stage.leads.forEach((lead) => {
      const ownerLabel = getLeadOwnerLabel(lead)
      if (ownerLabel === 'Unassigned') return
      const owner = normalizeText(ownerLabel)
      const ownerValue = getLeadOwnerValue(lead) || owner
      if (ownerValue && !values.has(ownerValue)) values.set(ownerValue, ownerLabel)
    })
  })
  return Array.from(values.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label))
}
