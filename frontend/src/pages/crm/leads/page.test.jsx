import { describe, expect, it } from 'vitest'
import {
  buildLeadDashboardAnalytics,
  getOwnerName,
  getProductCities,
  getProductStates,
  getSalesCollection,
  hasSalesCrmModule,
  isValidLeadOwner,
  mergeSalesCollectionItem,
  normalizeCreatedProduct,
  normalizeCreatedSalesOption,
} from './page'

describe('CRM leads page helpers', () => {
  it('treats sales_crm module as sales lead form permission', () => {
    expect(hasSalesCrmModule(['sales_crm'])).toBe(true)
    expect(hasSalesCrmModule(['sales'])).toBe(true)
    expect(hasSalesCrmModule(['task'])).toBe(false)
  })

  it('allows active assignable company users in lead owner options', () => {
    const base = { id: 'u1', first_name: 'Ada', last_name: 'Admin', status: 'active' }

    expect(isValidLeadOwner({ ...base, role: 'admin' })).toBe(true)
    expect(isValidLeadOwner({ ...base, role: 'sub_admin' })).toBe(true)
    expect(isValidLeadOwner({ ...base, role: 'super_admin' })).toBe(false)

    expect(isValidLeadOwner({ ...base, role: 'manager' })).toBe(true)
    expect(isValidLeadOwner({ ...base, role: 'lead' })).toBe(true)
    expect(isValidLeadOwner({ ...base, role: 'employee' })).toBe(true)

    // Inactive users are never assignable
    expect(isValidLeadOwner({ ...base, role: 'employee', status: 'inactive' })).toBe(false)
  })

  it('reads sales collections from backend items response', () => {
    const data = { total: 1, items: [{ id: 'cat-1', name: 'Retail' }] }

    expect(getSalesCollection(data, 'categories')).toEqual([{ id: 'cat-1', name: 'Retail' }])
  })

  it('keeps a newly created category visible in dropdown cache', () => {
    const created = normalizeCreatedSalesOption({ id: 'cat-2', name: 'Enterprise' }, { name: 'Enterprise' })
    const next = mergeSalesCollectionItem({ total: 1, items: [{ id: 'cat-1', name: 'Retail' }] }, 'categories', created)

    expect(getSalesCollection(next, 'categories')).toEqual([
      { id: 'cat-1', name: 'Retail' },
      { id: 'cat-2', name: 'Enterprise' },
    ])
  })

  it('builds a visible product option when create API returns ids only', () => {
    const created = normalizeCreatedProduct(
      { created: 1, ids: ['prod-2'] },
      { name: 'CRM Suite', category_id: 'cat-1', rate: '5000', unit: 'month' }
    )
    const next = mergeSalesCollectionItem({ total: 1, items: [{ id: 'prod-1', name: 'Starter' }] }, 'products', created)

    expect(created).toMatchObject({ id: 'prod-2', name: 'CRM Suite', category_id: 'cat-1' })
    expect(getSalesCollection(next, 'products').at(-1)).toMatchObject({ id: 'prod-2', name: 'CRM Suite' })
  })

  it('returns city options after selecting a product state', () => {
    expect(getProductStates()).toHaveLength(36)
    expect(getProductStates()).toContain('Kerala')
    expect(getProductStates()).toContain('Andaman and Nicobar Islands')
    expect(getProductCities('Maharashtra')).toContain('Mumbai')
    expect(getProductCities('Kerala')).toContain('Kochi')
    expect(getProductCities('')).toEqual([])
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
