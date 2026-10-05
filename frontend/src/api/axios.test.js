import { beforeEach, describe, expect, test, vi } from 'vitest'

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

const handlers = vi.hoisted(() => ({ responseError: null }))

vi.mock('react-hot-toast', () => ({ default: toastMock }))

vi.mock('axios', () => ({
  default: {
    create: () => ({
      interceptors: {
        request: { use: () => {} },
        response: {
          use: (_ok, err) => {
            handlers.responseError = err
          },
        },
      },
      post: vi.fn(),
    }),
  },
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      token: 'token',
      refreshToken: 'refresh',
      isAuthenticated: true,
      isLoggingOut: false,
    }),
  },
}))

vi.mock('../utils/storage', () => ({
  getAccessToken: () => null,
  getRefreshToken: () => null,
  updateAccessToken: () => {},
}))

import './axios'

const makeError = ({ status, data, responseType, suppressGlobalToast }) => ({
  config: { responseType, suppressGlobalToast, url: '/invoices/1/pdf' },
  response: { status, data },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('response error interceptor', () => {
  test('decodes JSON error from a Blob response into the toast message', async () => {
    const blob = new Blob([JSON.stringify({ detail: 'Invoice PDF could not be generated' })], { type: 'application/json' })
    const error = makeError({ status: 500, data: blob, responseType: 'blob' })

    await expect(handlers.responseError(error)).rejects.toBe(error)

    expect(toastMock.error).toHaveBeenCalledTimes(1)
    expect(toastMock.error).toHaveBeenCalledWith('Invoice PDF could not be generated')
  })

  test('shows no toast when suppressGlobalToast is set (caller handles it)', async () => {
    const blob = new Blob([JSON.stringify({ detail: 'Invoice PDF could not be generated' })], { type: 'application/json' })
    const error = makeError({ status: 500, data: blob, responseType: 'blob', suppressGlobalToast: true })

    await expect(handlers.responseError(error)).rejects.toBe(error)

    expect(toastMock.error).not.toHaveBeenCalled()
  })

  test('keeps the existing JSON error toast behavior for non-blob requests', async () => {
    const error = makeError({ status: 400, data: { detail: 'Invalid items format' }, responseType: undefined })

    await expect(handlers.responseError(error)).rejects.toBe(error)

    expect(toastMock.error).toHaveBeenCalledTimes(1)
    expect(toastMock.error).toHaveBeenCalledWith('Invalid items format')
  })

  test('does not toast for 401/403 responses', async () => {
    const error = makeError({ status: 403, data: { detail: 'Access denied' }, responseType: 'blob' })

    await expect(handlers.responseError(error)).rejects.toBe(error)

    expect(toastMock.error).not.toHaveBeenCalled()
  })
})
