import { beforeEach, describe, expect, test, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('./axios', () => ({
  default: apiMock,
}))

import { clientsAPI } from './clients'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('clientsAPI onboarding assets', () => {
  test('uploads selected files as multipart files field', async () => {
    apiMock.post.mockResolvedValueOnce({ data: { message: 'ok' } })
    const file = new File(['logo'], 'logo.png', { type: 'image/png' })

    await clientsAPI.uploadAssetRequirementFiles('client-1', 'asset-1', {
      source: 'manual_upload',
      files: [file],
    })

    const [url, formData] = apiMock.post.mock.calls[0]
    expect(url).toBe('/clients/client-1/onboarding/assets/requirements/asset-1/files')
    expect(formData.get('source')).toBe('manual_upload')
    expect(formData.getAll('files')).toEqual([file])
  })

  test('creates request link with custom client detail', async () => {
    apiMock.post.mockResolvedValueOnce({ data: { assets: { token: 'tok' } } })

    await clientsAPI.generateAssetRequestLink('client-1', 'asset-1', {
      request_note: 'Upload latest logo.',
    })

    expect(apiMock.post).toHaveBeenCalledWith(
      '/clients/client-1/onboarding/assets/requirements/asset-1/request-link',
      { request_note: 'Upload latest logo.' },
    )
  })

  test('loads public asset upload request without auth refresh', async () => {
    apiMock.get.mockResolvedValueOnce({ data: { requirement: { name: 'Logo' } } })

    await clientsAPI.getAssetUploadRequest('tok')

    expect(apiMock.get).toHaveBeenCalledWith('/clients/asset-upload/tok', {
      allowUnauthenticated: true,
      skipAuthRefresh: true,
    })
  })
})
