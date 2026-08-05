// Shared classifier for Sales stage-transition failures.
//
// The backend returns structured STAGE_TRANSITION_BLOCKED responses
// ({ code, severity, current_stage, target_stage, message, missing_fields,
//   status_requirement, action_requirement }). This module classifies any
// transition failure into one stable category so every stage-movement entry
// point (pipeline board, stage table, lead detail, transfer) behaves the same:
//
//   MISSING_DETAILS      -> open the required-details popup
//   STATUS_REQUIREMENT   -> show a warning (never auto-change the status)
//   ACTION_REQUIREMENT   -> show a warning with the existing action where available
//   PERMISSION_DENIED    -> show an access warning (no editable fields exposed)
//   TECHNICAL_ERROR      -> show an error toast
//
// A small text fallback exists only for legacy error responses; the primary
// path is the structured backend payload.

export const TRANSITION_BLOCKER = Object.freeze({
  MISSING_DETAILS: 'MISSING_DETAILS',
  STATUS_REQUIREMENT: 'STATUS_REQUIREMENT',
  ACTION_REQUIREMENT: 'ACTION_REQUIREMENT',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  TECHNICAL_ERROR: 'TECHNICAL_ERROR',
})

export const STAGE_TRANSITION_BLOCKED_CODE = 'STAGE_TRANSITION_BLOCKED'

// Editable fields the required-details popup knows how to render. Unknown
// fields returned by the backend are shown as a safe warning list instead of
// being rendered as uncontrolled inputs.
// NOTE: proposal_status and agreement_status are intentionally NOT editable here.
// They are domain-owned (the Proposal record) or signature-verified, so the
// popup must never let a salesperson manually set "Accepted"/"Signed". If the
// backend reports them as missing, they fall through to the safe warning list.
export const TRANSITION_FIELD_REGISTRY = Object.freeze({
  budget: { label: 'Budget', type: 'currency', field: 'budget' },
  decision_maker: { label: 'Decision Maker', type: 'text', field: 'decision_maker' },
  timeline: { label: 'Timeline', type: 'text', field: 'timeline' },
  // The phone field renders a country-code input + tel input together inside
  // the dialog (see StageRequirementsDialog); country_code itself is never a
  // standalone missing field.
  phone: { label: 'Mobile Number', type: 'phone', field: 'phone' },
  discovery_outcome: { label: 'Discovery Outcome', type: 'select', field: 'discovery_outcome', optionsKey: 'discovery' },
  qualify_status: { label: 'Qualification Status', type: 'select', field: 'qualify_status', optionsKey: 'qualify' },
  negotiation_status: { label: 'Negotiation Status', type: 'select', field: 'negotiation_status', optionsKey: 'negotiation' },
  won_status: { label: 'Won Status', type: 'select', field: 'won_status', optionsKey: 'won' },
  account_manager_id: { label: 'Account Manager', type: 'user', field: 'account_manager_id' },
  company_name: { label: 'Company', type: 'text', field: 'company_name' },
  industry: { label: 'Industry', type: 'text', field: 'industry' },
  location: { label: 'Location', type: 'text', field: 'location' },
  requirement: { label: 'Requirement', type: 'text', field: 'requirement' },
  pain_points: { label: 'Pain Points', type: 'textarea', field: 'pain_points' },
})

const STATUS_REQUIREMENT_LABELS = Object.freeze({
  qualify_status: 'Qualification Status',
  discovery_outcome: 'Discovery Outcome',
  proposal_status: 'Proposal Status',
  negotiation_status: 'Negotiation Status',
  agreement_status: 'Agreement Status',
  won_status: 'Won Status',
  current_stage: 'Sales Stage',
})

const getDetail = (error) => {
  const body = error?.response?.data
  if (body && typeof body.detail === 'object' && body.detail !== null) return body.detail
  return null
}

const getLegacyMessage = (error) => {
  const body = error?.response?.data
  if (body && typeof body.detail === 'string') return body.detail
  if (typeof error?.detail === 'string') return error.detail
  return error?.message || ''
}

const slugify = (value) => String(value || '').toLowerCase().trim().replace(/\s+/g, ' ')

// Legacy text fallback: only used when the backend did not return structured
// data. Keeps old deployments readable without parsing prose as the source of
// truth.
const classifyLegacyText = (message, status) => {
  const lower = slugify(message)
  if (status === 403) {
    return {
      category: TRANSITION_BLOCKER.PERMISSION_DENIED,
      message: message || 'You do not have permission to perform this action.',
    }
  }
  if (
    lower.includes('missing')
    || lower.includes('required') && lower.includes('budget')
    || lower.includes('required') && lower.includes('decision')
  ) {
    const missingFields = []
    if (lower.includes('budget')) missingFields.push({ field: 'budget', label: 'Budget', type: 'currency' })
    if (lower.includes('decision maker') || lower.includes('decision')) missingFields.push({ field: 'decision_maker', label: 'Decision Maker', type: 'text' })
    if (lower.includes('timeline')) missingFields.push({ field: 'timeline', label: 'Timeline', type: 'text' })
    return {
      category: missingFields.length ? TRANSITION_BLOCKER.MISSING_DETAILS : TRANSITION_BLOCKER.STATUS_REQUIREMENT,
      message: message || 'Complete the required details before moving this lead forward.',
      missingFields,
    }
  }
  if (lower.includes('first contact')) {
    return {
      category: TRANSITION_BLOCKER.ACTION_REQUIREMENT,
      message: message || 'Record the first contact attempt before moving this lead to Qualify.',
      actionRequirement: { field: 'first_contact', label: 'First Contact' },
    }
  }
  if (lower.includes('cannot skip') || lower.includes('workflow steps') || lower.includes('workflow sequence')) {
    return {
      category: TRANSITION_BLOCKER.ACTION_REQUIREMENT,
      message: message || 'Move the lead through the stages in the required order.',
      actionRequirement: { field: 'stage_sequence', label: 'Stage Sequence' },
    }
  }
  if (lower.includes('must be signed') || lower.includes('not signed') || lower.includes('agreement')) {
    return {
      category: TRANSITION_BLOCKER.STATUS_REQUIREMENT,
      message: message || 'The agreement must be signed before moving this lead to Won.',
    }
  }
  if (lower.includes('must be accepted') || lower.includes('accepted before') || lower.includes('proposal acceptance')) {
    return {
      category: TRANSITION_BLOCKER.STATUS_REQUIREMENT,
      message: message || 'The proposal must be accepted before moving this lead forward.',
    }
  }
  return { category: TRANSITION_BLOCKER.TECHNICAL_ERROR, message: message || 'The request could not be completed.' }
}

// Classify any transition failure into a stable blocker object. The result is
// the source of truth for every UI branch (popup vs warning vs error).
export const classifyTransitionFailure = (error, fallbackMessage = 'The request could not be completed.') => {
  const detail = getDetail(error)
  const httpStatus = error?.response?.status || error?.status

  if (httpStatus === 403) {
    return {
      category: TRANSITION_BLOCKER.PERMISSION_DENIED,
      message: 'You do not have permission to perform this action on this lead.',
    }
  }

  if (detail?.code === STAGE_TRANSITION_BLOCKED_CODE) {
    const missingFields = Array.isArray(detail.missing_fields)
      ? detail.missing_fields.filter((item) => item && item.field)
      : []
    const statusRequirement = detail.status_requirement || null
    const actionRequirement = detail.action_requirement || null

    let category = TRANSITION_BLOCKER.TECHNICAL_ERROR
    if (missingFields.length > 0) category = TRANSITION_BLOCKER.MISSING_DETAILS
    else if (statusRequirement) category = TRANSITION_BLOCKER.STATUS_REQUIREMENT
    else if (actionRequirement) category = TRANSITION_BLOCKER.ACTION_REQUIREMENT

    return {
      category,
      code: detail.code,
      severity: detail.severity || 'warning',
      currentStage: detail.current_stage || '',
      targetStage: detail.target_stage || '',
      message: detail.message || fallbackMessage,
      missingFields,
      statusRequirement,
      actionRequirement,
    }
  }

  return classifyLegacyText(getLegacyMessage(error) || fallbackMessage, httpStatus)
}

// Amber warning-toast options (react-hot-toast) for business validation blockers.
export const TRANSITION_WARNING_TOAST = {
  icon: '⚠️',
  style: {
    background: '#fef3c7',
    color: '#92400e',
    border: '1px solid #fcd34d',
  },
}

// Human-readable copy for status requirements (e.g. "Interested or Qualified").
export const formatAllowedValues = (allowedValues) => {
  if (!Array.isArray(allowedValues) || !allowedValues.length) return ''
  return allowedValues
    .map((value) => String(value).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()))
    .join(' or ')
}

export const statusRequirementFieldLabel = (statusRequirement) => {
  const field = statusRequirement?.field
  return (field && STATUS_REQUIREMENT_LABELS[field]) || statusRequirement?.label || 'Status'
}

// Build a user-safe action-oriented warning message for status/action blockers.
export const buildStatusWarningMessage = (blocker) => {
  if (!blocker) return ''
  if (blocker.category === TRANSITION_BLOCKER.ACTION_REQUIREMENT) {
    const action = blocker.actionRequirement?.label
    return action ? `${action} required — ${blocker.message}` : blocker.message
  }
  if (blocker.category === TRANSITION_BLOCKER.STATUS_REQUIREMENT) {
    const label = statusRequirementFieldLabel(blocker.statusRequirement)
    const allowed = formatAllowedValues(blocker.statusRequirement?.allowed_values)
    const target = blocker.targetStage ? ` before moving to ${blocker.targetStage}` : ''
    if (allowed) {
      return `${label} must be ${allowed}${target}.`
    }
    return blocker.message || `${label} is not ready${target}.`
  }
  return blocker.message || ''
}
