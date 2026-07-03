import { format } from 'date-fns'

export const PIPELINE_FILTER_KEYS = ['q', 'owner', 'priority', 'tags', 'minValue', 'maxValue', 'createdFrom', 'createdTo', 'stage']

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
}

export const DEAL_VALUE_FIELDS = ['deal_value', 'dealValue', 'value', 'won_amount', 'amount']
export const OWNER_FIELDS = ['owner_name', 'owner', 'ownerName', 'assigned_to_name', 'assigned_to']
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
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return format(date, 'MMM d, yyyy')
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

export const getLeadDealValue = (lead) => {
  for (const field of DEAL_VALUE_FIELDS) {
    if (lead?.[field] !== undefined && lead?.[field] !== null && lead?.[field] !== '') {
      return normalizeNumber(lead[field])
    }
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

export const getLeadOwnerLabel = (lead) => {
  const owner = lead?.owner_name || lead?.assigned_to_name || lead?.assigned_to
  return owner ? String(owner) : 'Unassigned'
}

export const getLeadContactLabel = (lead) => {
  const contact = lead?.crm_contact_name || lead?.primary_contact || lead?.primary_contact_name || lead?.contact_name || lead?.contact || lead?.prospect_name
  return contact ? String(contact) : 'Unassigned contact'
}

export const getLeadStageKey = (lead) => normalizeText(lead?.current_stage || lead?.stage || lead?.stage_key)

export const getStageKey = (stage) => normalizeText(stage?.key || stage?.name || stage?.stage || stage?.id)

export const getStageLabel = (stage) => stage?.name || stage?.label || stage?.title || stage?.key || stage?.id || 'Stage'

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
  const minValue = filters.minValue !== '' ? normalizeNumber(filters.minValue) : null
  const maxValue = filters.maxValue !== '' ? normalizeNumber(filters.maxValue) : null
  const createdFrom = filters.createdFrom ? new Date(filters.createdFrom) : null
  const createdTo = filters.createdTo ? new Date(filters.createdTo) : null

  return leads.filter((lead) => {
    const searchText = buildLeadSearchText(lead)
    const ownerLabel = normalizeText(getLeadOwnerLabel(lead))
    const priorityLabel = getLeadPriority(lead)
    const tagLabels = getLeadTags(lead).map(normalizeText)
    const leadStage = getLeadStageKey(lead)
    const dealValue = getLeadDealValue(lead)
    const createdAt = lead?.created_at || lead?.createdAt || lead?.created_date || lead?.createdDate
    const createdDate = createdAt ? new Date(createdAt) : null

    if (query && !searchText.includes(query)) return false
    if (owner && !ownerLabel.includes(owner)) return false
    if (priority && priorityLabel !== priority) return false
    if (tags) {
      const tokens = tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      if (tokens.length && !tokens.some((tag) => tagLabels.includes(normalizeText(tag)))) return false
    }
    if (stage && leadStage !== stage) return false
    if (minValue !== null && dealValue < minValue) return false
    if (maxValue !== null && dealValue > maxValue) return false
    if (createdFrom && createdDate && createdDate < createdFrom) return false
    if (createdTo && createdDate) {
      const endOfDay = new Date(createdTo)
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

export const ownerOptionsFromBoard = (board) => {
  const values = new Map()
  ;(board?.stages || []).forEach((stage) => {
    stage.leads.forEach((lead) => {
      const owner = normalizeText(getLeadOwnerLabel(lead))
      if (owner) values.set(owner, getLeadOwnerLabel(lead))
    })
  })
  return Array.from(values.entries()).map(([value, label]) => ({ value, label }))
}
