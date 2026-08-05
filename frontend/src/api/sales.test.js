import { beforeEach, describe, expect, test, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('./axios', () => ({
  default: apiMock,
}))

vi.mock('./crm', () => ({
  crmApi: {
    updatePipelineStage: vi.fn(),
  },
}))

vi.mock('@/services/timeService', () => ({
  timeService: {
    now: () => new Date('2026-08-04T00:00:00.000Z'),
    toUtcISOString: (value) => value.toISOString(),
  },
}))

import { salesApi } from './sales'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('salesApi prospect updates', () => {
  test('sends caller FormData directly for legacy prospect PUT', async () => {
    apiMock.put.mockResolvedValueOnce({ data: { message: 'ok' } })
    const formData = new FormData()
    formData.append('assigned_to', 'user-1')

    await salesApi.updateProspectForm('lead-1', formData)

    expect(apiMock.put).toHaveBeenCalledWith('/sales/prospects/lead-1', formData)
  })
})
