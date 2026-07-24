import { describe, expect, it, vi } from 'vitest'

import axios from './axios'
import { metaIdentityApi } from './metaIdentity'

vi.mock('./axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('metaIdentityApi', () => {
  it('maps companyId to company_id for suggestions', () => {
    metaIdentityApi.getSuggestions('identity-1', { companyId: 'tenant-1' })

    expect(axios.get).toHaveBeenCalledWith(
      '/integrations/meta/identity/suggestions/identity-1',
      { params: { company_id: 'tenant-1' } },
    )
  })

  it('maps companyId to company_id for confirmed links', () => {
    metaIdentityApi.confirmLink({ identity_id: 'identity-1', target_identity_id: 'identity-2' }, { companyId: 'tenant-1' })

    expect(axios.post).toHaveBeenCalledWith(
      '/integrations/meta/identity/links',
      { identity_id: 'identity-1', target_identity_id: 'identity-2' },
      { params: { company_id: 'tenant-1' } },
    )
  })
})
