import { describe, expect, it } from 'vitest'
import {
  STAGE_TRANSITION_BLOCKED_CODE,
  TRANSITION_BLOCKER,
  TRANSITION_FIELD_REGISTRY,
  buildStatusWarningMessage,
  classifyTransitionFailure,
  formatAllowedValues,
  statusRequirementFieldLabel,
} from './salesTransition'

const structuredError = (overrides = {}) => ({
  response: {
    status: 400,
    data: {
      detail: {
        code: STAGE_TRANSITION_BLOCKED_CODE,
        severity: 'warning',
        current_stage: 'Qualify',
        target_stage: 'Discovery',
        message: 'Cannot move to Discovery — missing Budget, Decision Maker.',
        missing_fields: [],
        status_requirement: null,
        action_requirement: null,
        ...overrides,
      },
    },
  },
})

describe('classifyTransitionFailure', () => {
  it('classifies missing editable details as MISSING_DETAILS with fields', () => {
    const blocker = classifyTransitionFailure(
      structuredError({
        missing_fields: [
          { field: 'budget', label: 'Budget', type: 'currency' },
          { field: 'decision_maker', label: 'Decision Maker', type: 'text' },
        ],
      })
    )
    expect(blocker.category).toBe(TRANSITION_BLOCKER.MISSING_DETAILS)
    expect(blocker.missingFields.map((item) => item.field)).toEqual(['budget', 'decision_maker'])
    expect(blocker.currentStage).toBe('Qualify')
    expect(blocker.targetStage).toBe('Discovery')
  })

  it('classifies a status-only blocker as STATUS_REQUIREMENT', () => {
    const blocker = classifyTransitionFailure(
      structuredError({
        message: 'The proposal must be accepted before moving to Negotiation.',
        status_requirement: {
          field: 'proposal_status',
          label: 'Proposal Status',
          allowed_values: ['accepted'],
          current_value: 'sent',
        },
      })
    )
    expect(blocker.category).toBe(TRANSITION_BLOCKER.STATUS_REQUIREMENT)
    expect(blocker.statusRequirement.allowed_values).toEqual(['accepted'])
  })

  it('classifies an action blocker as ACTION_REQUIREMENT', () => {
    const blocker = classifyTransitionFailure(
      structuredError({
        action_requirement: {
          field: 'first_contact',
          label: 'First Contact',
          message: 'Record a call, email, WhatsApp attempt before moving this lead to Qualify.',
        },
      })
    )
    expect(blocker.category).toBe(TRANSITION_BLOCKER.ACTION_REQUIREMENT)
    expect(blocker.actionRequirement.label).toBe('First Contact')
  })

  it('prefers MISSING_DETAILS when both details and a status rule block (mixed case)', () => {
    const blocker = classifyTransitionFailure(
      structuredError({
        missing_fields: [{ field: 'budget', label: 'Budget', type: 'currency' }],
        status_requirement: {
          field: 'qualify_status',
          label: 'Qualification Status',
          allowed_values: ['interested', 'qualified'],
          current_value: 'contacted',
        },
      })
    )
    expect(blocker.category).toBe(TRANSITION_BLOCKER.MISSING_DETAILS)
    expect(blocker.missingFields).toHaveLength(1)
    expect(blocker.statusRequirement).not.toBeNull()
  })

  it('classifies 403 as PERMISSION_DENIED without exposing details', () => {
    const blocker = classifyTransitionFailure({ response: { status: 403 } })
    expect(blocker.category).toBe(TRANSITION_BLOCKER.PERMISSION_DENIED)
    expect(blocker.message).not.toMatch(/internal|stack|trace/i)
  })

  it('classifies non-structured failures (network/server) as TECHNICAL_ERROR', () => {
    const blocker = classifyTransitionFailure({ message: 'Network Error' })
    expect(blocker.category).toBe(TRANSITION_BLOCKER.TECHNICAL_ERROR)
  })

  it('falls back to legacy text for old string-detail responses', () => {
    const blocker = classifyTransitionFailure({
      response: { status: 400, data: { detail: 'Record a first contact attempt before moving this lead to Qualify.' } },
    })
    expect(blocker.category).toBe(TRANSITION_BLOCKER.ACTION_REQUIREMENT)

    const signed = classifyTransitionFailure({
      response: { status: 400, data: { detail: 'The agreement must be signed before moving this lead to Won.' } },
    })
    expect(signed.category).toBe(TRANSITION_BLOCKER.STATUS_REQUIREMENT)
  })

  it('does not crash on unknown structured fields', () => {
    const blocker = classifyTransitionFailure(structuredError({ missing_fields: [{ field: 'mystery_field' }] }))
    expect(blocker.category).toBe(TRANSITION_BLOCKER.MISSING_DETAILS)
    expect(blocker.missingFields).toHaveLength(1)
  })
})

describe('transition field registry safety', () => {
  it('never exposes proposal or agreement status as editable popup fields', () => {
    expect(TRANSITION_FIELD_REGISTRY.proposal_status).toBeUndefined()
    expect(TRANSITION_FIELD_REGISTRY.agreement_status).toBeUndefined()
  })

  it('keeps editable qualification/discovery fields available', () => {
    expect(TRANSITION_FIELD_REGISTRY.budget.type).toBe('currency')
    expect(TRANSITION_FIELD_REGISTRY.discovery_outcome.optionsKey).toBe('discovery')
    expect(TRANSITION_FIELD_REGISTRY.account_manager_id.type).toBe('user')
  })
})

describe('warning copy helpers', () => {
  it('formats allowed values into readable copy', () => {
    expect(formatAllowedValues(['interested', 'qualified'])).toBe('Interested or Qualified')
  })

  it('builds action-oriented status warnings with target stage', () => {
    const blocker = {
      category: TRANSITION_BLOCKER.STATUS_REQUIREMENT,
      targetStage: 'Negotiation',
      statusRequirement: {
        field: 'proposal_status',
        label: 'Proposal Status',
        allowed_values: ['accepted'],
        current_value: 'sent',
      },
    }
    const message = buildStatusWarningMessage(blocker)
    expect(message).toContain('Proposal Status must be Accepted')
    expect(message).toContain('before moving to Negotiation')
  })

  it('builds action-oriented action warnings', () => {
    const blocker = {
      category: TRANSITION_BLOCKER.ACTION_REQUIREMENT,
      message: 'Record the first contact attempt before moving this lead to Qualify.',
      actionRequirement: { label: 'First Contact' },
    }
    expect(buildStatusWarningMessage(blocker)).toContain('First Contact required')
  })

  it('labels status requirement fields with human labels', () => {
    expect(statusRequirementFieldLabel({ field: 'agreement_status' })).toBe('Agreement Status')
  })
})
