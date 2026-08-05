import { describe, expect, it } from 'vitest'
import { DEAL_VALUE_FIELDS, buildPipelineBoard, filterPipelineLeads, getLeadDealValue, getStageStatusOptions, moveLeadInBoard } from './utils'

const pipelineResponse = {
  meta: { currency: 'INR' },
  stages: [
    {
      key: 'new',
      name: 'New',
      order: 1,
      leads: [
        {
          id: 'lead-1',
          company_name: 'Acme Pvt Ltd',
          primary_contact: 'Priya Shah',
          owner_name: 'Asha',
          priority: 'high',
          tags: ['hot', 'enterprise'],
          deal_value: 250000,
          days_in_stage: 4,
          created_at: '2026-06-20T00:00:00.000Z',
          current_stage: 'new',
        },
      ],
    },
    {
      key: 'qualified',
      name: 'Qualified',
      order: 2,
      leads: [],
    },
  ],
}

const board = buildPipelineBoard(pipelineResponse)

describe('crm pipeline helpers', () => {
  it('normalizes board data from the pipeline response', () => {
    expect(board.stages).toHaveLength(2)
    expect(board.leadIndex['lead-1']).toEqual({ stageKey: 'new', stageName: 'New' })
  })

  it('filters leads by search and metadata', () => {
    const leads = board.stages.flatMap((stage) => stage.leads)
    const filtered = filterPipelineLeads(leads, {
      q: 'acme',
      owner: 'asha',
      priority: 'high',
      tags: 'enterprise',
      minValue: '',
      maxValue: '',
      createdFrom: '',
      createdTo: '',
      stage: 'new',
    })
    expect(filtered).toHaveLength(1)
  })

  it('reflects the lead-detail Budget in the pipeline Value column', () => {
    // The lead detail overview edits `budget`; the pipeline Value column must
    // show the same number. Previously budget was not in DEAL_VALUE_FIELDS, so
    // a Qualify-stage lead with only a budget set displayed as Rs 0.
    expect(DEAL_VALUE_FIELDS).toContain('budget')
    expect(getLeadDealValue({ budget: 500000 })).toBe(500000)
    expect(getLeadDealValue({ budget: 500000, won_amount: null })).toBe(500000)
  })

  it('keeps won_amount authoritative for closed leads', () => {
    expect(getLeadDealValue({ budget: 500000, won_amount: 450000 })).toBe(450000)
  })

  it('exposes Not Contacted / Contacted in the Acquire stage status options', () => {
    // Reported feedback: the Qualify select offered Contacted / Not Contacted
    // but the Acquire stage did not. Both stages share the contact progression.
    const values = getStageStatusOptions('acquire').map((option) => option.value)
    expect(values).toContain('not_contacted')
    expect(values).toContain('contacted')
  })

  it('moves a lead into another stage and updates counts', () => {
    const moved = moveLeadInBoard(board, 'lead-1', 'qualified', {
      id: 'lead-1',
      current_stage: 'qualified',
      days_in_stage: 0,
    })

    expect(moved.stages.find((stage) => stage.key === 'new').leadCount).toBe(0)
    expect(moved.stages.find((stage) => stage.key === 'qualified').leadCount).toBe(1)
    expect(moved.leadIndex['lead-1']).toEqual({ stageKey: 'qualified', stageName: 'Qualified' })
  })
})
