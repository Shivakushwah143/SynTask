import { describe, expect, it } from 'vitest'
import { buildLeadEditFields, buildLeadOverviewSections } from './components'

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
      [{ id: 'stage-proposal', key: 'proposal', name: 'Proposal' }],
      [{ id: 'user-1', first_name: 'Ada', last_name: 'Admin' }],
    )

    expect(fields.map((field) => field.label)).toEqual(['Stage', 'Status', 'Owner', 'Priority', 'Source', 'Tags'])
    expect(fields.find((field) => field.key === 'current_stage')).toMatchObject({
      type: 'select',
      label: 'Stage',
      value: 'proposal',
      displayValue: 'Proposal',
    })
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
    expect(sections[1].items).toHaveLength(3)
    expect(sections[2].items).toHaveLength(2)
  })
})
