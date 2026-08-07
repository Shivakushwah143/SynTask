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

  it('ignores a zero won_amount so it cannot shadow a real budget', () => {
    // The lead-detail header edit writes won_amount ("Deal value"); saving an
    // empty field stores 0. That 0 must never make the Value column show Rs 0
    // when the overview already saved a real budget — the reported sync bug.
    expect(getLeadDealValue({ budget: 500000, won_amount: 0 })).toBe(500000)
    expect(getLeadDealValue({ budget: 500000, won_amount: '' })).toBe(500000)
    expect(getLeadDealValue({ budget: 500000, won_amount: 0, deal_value: 0 })).toBe(500000)
    // All zeros means the lead genuinely has no deal size recorded.
    expect(getLeadDealValue({ budget: 0, won_amount: 0 })).toBe(0)
  })

  it('keeps a zero won_amount authoritative once a deal is Won', () => {
    // A deal that closed at 0 (free pilot / promotional close) must report 0,
    // not fall back to the pre-close Budget — the closed value is authoritative.
    expect(getLeadDealValue({ current_stage: 'won', budget: 500000, won_amount: 0 })).toBe(0)
    expect(getLeadDealValue({ current_stage: 'lost', budget: 500000, won_amount: 0 })).toBe(0)
    // Open stages still ignore the stray zero.
    expect(getLeadDealValue({ current_stage: 'qualify', budget: 500000, won_amount: 0 })).toBe(500000)
  })

  it('exposes Wrong Number / No Response in both Acquire and Qualify status options', () => {
    // Reported feedback: Wrong Number / No Response should appear in the Acquire
    // intake select AND stay available in Qualify.
    const acquireValues = getStageStatusOptions('acquire').map((option) => option.value)
    expect(acquireValues).toContain('not_contacted')
    expect(acquireValues).toContain('contacted')
    expect(acquireValues).toContain('wrong_number')
    expect(acquireValues).toContain('no_response')

    const qualifyValues = getStageStatusOptions('qualify').map((option) => option.value)
    expect(qualifyValues).toContain('wrong_number')
    expect(qualifyValues).toContain('no_response')
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
