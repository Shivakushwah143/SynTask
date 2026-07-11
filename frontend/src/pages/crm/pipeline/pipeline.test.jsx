import { describe, expect, it } from 'vitest'
import { buildPipelineBoard, filterPipelineLeads, moveLeadInBoard } from './utils'

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
