import { describe, expect, it } from 'vitest'
import { buildLeadDashboardAnalytics, getOwnerName, getSalesCollection } from './page'

describe('CRM leads page helpers', () => {
  it('reads sales collections from backend items response', () => {
    const data = { total: 1, items: [{ id: 'cat-1', name: 'Retail' }] }

    expect(getSalesCollection(data, 'categories')).toEqual([{ id: 'cat-1', name: 'Retail' }])
  })

  it('shows owner name from assignable user map instead of raw id', () => {
    const mongoId = '64f1b2c3d4e5f67890123456'
    const users = new Map([['user-1', 'Anika Rao'], [mongoId, 'Nisha Shah']])

    expect(getOwnerName({ assigned_to: 'user-1' }, users)).toBe('Anika Rao')
    expect(getOwnerName({ assigned_to: 'user-2' }, users)).toBe('Unassigned')
    expect(getOwnerName({ owner_name: mongoId, assigned_to: mongoId }, users)).toBe('Nisha Shah')
    expect(getOwnerName({ owner_name: '64f1b2c3d4e5f67890123457' }, users)).toBe('Unassigned')
  })

  it('builds compact dashboard analytics from lead data', () => {
    const analytics = buildLeadDashboardAnalytics(
      [
        { created_at: '2026-06-10', current_stage: 'Qualified', interest_level: 'hot', estimated_value: 1000, custom_fields: { meeting_scheduled: true } },
        { created_at: '2026-07-02', current_stage: 'Qualified', interest_level: 'warm', deal_value: 500 },
        { created_at: '2026-07-08', current_stage: 'Proposal', interest_level: 'cold', won_amount: 250 },
      ],
      [{ key: 'qualified', name: 'Qualified' }, { key: 'proposal', name: 'Proposal' }],
      new Date('2026-07-13T00:00:00Z'),
      'INR'
    )

    expect(analytics.monthlyTrend.at(-2)).toMatchObject({ name: 'Jun', count: 1 })
    expect(analytics.monthlyTrend.at(-1)).toMatchObject({ name: 'Jul', count: 2 })
    expect(analytics.stageStack).toEqual([
      { name: 'Qualified', hot: 1, warm: 1, cold: 0 },
      { name: 'Proposal', hot: 0, warm: 0, cold: 1 },
    ])
    expect(analytics.insights.find((item) => item.label === 'Meetings')?.value).toBe(1)
  })
})
