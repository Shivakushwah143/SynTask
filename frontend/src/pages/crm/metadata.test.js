import { describe, expect, it } from 'vitest'
import { CRM_NAV_ITEMS, CRM_ROUTE_DESCRIPTIONS, CRM_ROUTE_LABELS } from './metadata'

describe('CRM metadata', () => {
  it('exposes a dedicated Meta integration admin route', () => {
    expect(CRM_NAV_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'meta',
          label: 'Meta Integration',
          path: '/crm/settings/meta',
          status: 'active',
        }),
      ]),
    )
    expect(CRM_ROUTE_LABELS['/crm/settings/meta']).toBe('Meta Integration')
    expect(CRM_ROUTE_DESCRIPTIONS['/crm/settings/meta']).toMatch(/Meta/i)
  })
})
