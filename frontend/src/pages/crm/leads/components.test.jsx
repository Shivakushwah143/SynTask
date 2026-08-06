import { describe, expect, it } from 'vitest'
import { buildLeadEditFields, buildLeadOverviewSections } from './components'
import { asArray } from '../../phase4Utils'

describe('lead sidebar edit fields', () => {
  it('builds labeled fields from real lead values and selection options', () => {
    const fields = buildLeadEditFields(
      {
        current_stage: 'Proposal',
        status: 'active',
        assigned_to: 'user-1',
        interest_level: 'warm',
        channel: 'Referral',
        tag: ['enterprise', 'urgent'],
      },
      [
        { id: 'stage-new', key: 'new', name: 'New' },
        { id: 'stage-proposal', key: 'proposal', name: 'Proposal' },
      ],
      [{ id: 'user-1', first_name: 'Ada', last_name: 'Admin' }],
    )

    expect(fields.map((field) => field.label)).toEqual(['Stage', 'Status', 'Owner', 'Priority', 'Source', 'Tags'])
    expect(fields.find((field) => field.key === 'current_stage')).toMatchObject({
      type: 'select',
      label: 'Stage',
      value: 'proposal',
      displayValue: 'Proposal',
    })
    // The select must receive every stage as an option.
    expect(fields.find((field) => field.key === 'current_stage').options.map((option) => option.label)).toEqual(['New', 'Proposal'])
    expect(fields.find((field) => field.key === 'assigned_to')).toMatchObject({
      label: 'Owner',
      value: 'user-1',
      displayValue: 'Ada Admin',
    })
    expect(fields.find((field) => field.key === 'tag')).toMatchObject({
      label: 'Tags',
      value: 'enterprise|urgent',
    })
  })

  it('populates stage options from the master list API response shape { total, items }', () => {
    // GET /sales/masters/stages returns { total, items }, not { stages }. The
    // sidebar must read the items so the Stage select is not empty.
    const stagesData = {
      total: 2,
      items: [
        { id: 'stage-new', key: 'new', name: 'New' },
        { id: 'stage-qualified', key: 'qualified', name: 'Qualified' },
      ],
    }

    const stages = asArray(stagesData, ['stages'])
    const fields = buildLeadEditFields({ current_stage: 'Qualified' }, stages, [])

    const stageField = fields.find((field) => field.key === 'current_stage')
    expect(stageField.options.map((option) => option.label)).toEqual(['New', 'Qualified'])
    expect(stageField.options.length).toBeGreaterThan(0)
  })

  it('surfaces the full fixed pipeline catalog when the company has no custom stages', () => {
    // When GET /sales/masters/stages has no configured rows, the backend falls
    // back to the fixed pipeline catalog. The Stage select must show every
    // stage name (New, Contacted, ...) with slug keys that match the pipeline.
    const fallbackResponse = {
      total: 8,
      items: [
        { id: null, name: 'New', key: 'new', order: 0, source: 'fixed' },
        { id: null, name: 'Contacted', key: 'contacted', order: 1, source: 'fixed' },
        { id: null, name: 'Qualified', key: 'qualified', order: 2, source: 'fixed' },
        { id: null, name: 'Discovery', key: 'discovery', order: 3, source: 'fixed' },
        { id: null, name: 'Proposal', key: 'proposal', order: 4, source: 'fixed' },
        { id: null, name: 'Negotiation', key: 'negotiation', order: 5, source: 'fixed' },
        { id: null, name: 'Won', key: 'won', order: 6, source: 'fixed' },
        { id: null, name: 'Lost', key: 'lost', order: 7, source: 'fixed' },
      ],
    }

    const stages = asArray(fallbackResponse, ['stages'])
    const fields = buildLeadEditFields({ current_stage: 'Discovery' }, stages, [])

    const stageField = fields.find((field) => field.key === 'current_stage')
    expect(stageField.options.map((option) => option.label)).toEqual([
      'New', 'Contacted', 'Qualified', 'Discovery', 'Proposal', 'Negotiation', 'Won', 'Lost',
    ])
    expect(stageField.options.map((option) => option.value)).toEqual([
      'new', 'contacted', 'qualified', 'discovery', 'proposal', 'negotiation', 'won', 'lost',
    ])
    expect(stageField.value).toBe('discovery')
    expect(stageField.displayValue).toBe('Discovery')
  })
})

describe('lead overview layout data', () => {
  it('splits overview fields into balanced sections with accent colors', () => {
    const sections = buildLeadOverviewSections({
      crm_contact_name: 'Sam Buyer',
      email: 'sam@example.com',
      phone: '555-0100',
      channel: 'Referral',
      estimated_close_date: '2026-07-20T00:00:00Z',
      days_in_stage: 4,
      custom_fields: {
        budget: '10000',
        region: 'West',
      },
    })

    expect(sections).toHaveLength(3)
    expect(sections.map((section) => section.tone)).toEqual(['emerald', 'amber', 'blue'])
    expect(sections[0].items).toHaveLength(3)
    expect(sections[1].items).toHaveLength(4)
    expect(sections[2].items).toHaveLength(2)
  })
})
