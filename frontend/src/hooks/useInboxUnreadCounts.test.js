import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computeInboxCounts, useInboxUnreadCounts } from './useInboxUnreadCounts'

const { mocks, authState } = vi.hoisted(() => ({
  mocks: {
    listNotifications: vi.fn(),
    getConversations: vi.fn(),
  },
  // Stable reference: a fresh object per call would change the hook's effect deps
  // (user identity) on every render and restart polling endlessly.
  authState: { user: { role: 'admin' }, isAuthenticated: true },
}))

vi.mock('../api/notifications', () => ({
  notificationsAPI: { listNotifications: mocks.listNotifications },
}))

vi.mock('../api/metaInbox', () => ({
  metaInboxApi: { getConversations: mocks.getConversations },
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: () => authState,
}))

describe('computeInboxCounts (Phase 6 aggregator)', () => {
  it('sums unread per channel and returns a grand total including notifications', () => {
    const items = [
      { channel: 'whatsapp', unread_count: 4 },
      { channel: 'whatsapp', unread_count: 1 },
      { channel: 'instagram', unread_count: 2 },
      { channel: 'messenger', unread_count: 0 },
      { channel: 'instagram', unread_count: 3 },
    ]
    expect(computeInboxCounts(items, 7)).toEqual({
      whatsapp: 5,
      instagram: 5,
      messenger: 0,
      metaTotal: 10,
      notifications: 7,
      total: 17,
    })
  })

  it('ignores conversations without an unread_count field', () => {
    const items = [
      { channel: 'whatsapp' },
      { channel: 'instagram', unread_count: '3' },
    ]
    expect(computeInboxCounts(items, 0)).toMatchObject({ whatsapp: 0, instagram: 3, total: 3 })
  })

  it('defaults to zero counts for empty input', () => {
    expect(computeInboxCounts()).toEqual({
      whatsapp: 0,
      instagram: 0,
      messenger: 0,
      metaTotal: 0,
      notifications: 0,
      total: 0,
    })
  })
})

describe('useInboxUnreadCounts (Phase 6 hook)', () => {
  beforeEach(() => {
    mocks.listNotifications.mockReset()
    mocks.getConversations.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetches and aggregates counts on mount', async () => {
    mocks.listNotifications.mockResolvedValue({ unread_count: 7 })
    mocks.getConversations.mockResolvedValue({ data: { items: [{ channel: 'whatsapp', unread_count: 3 }] } })

    const { result } = renderHook(() => useInboxUnreadCounts())
    await waitFor(() => expect(result.current.whatsapp).toBe(3))

    expect(mocks.listNotifications).toHaveBeenCalledWith(null, 0, 1)
    expect(mocks.getConversations).toHaveBeenCalledWith({ companyId: undefined })
    expect(result.current).toEqual({
      whatsapp: 3,
      instagram: 0,
      messenger: 0,
      metaTotal: 3,
      notifications: 7,
      total: 10,
    })
  })

  it('survives a failing notifications fetch and still shows meta counts', async () => {
    mocks.listNotifications.mockRejectedValue(new Error('network down'))
    mocks.getConversations.mockResolvedValue({ data: { items: [{ channel: 'instagram', unread_count: 2 }] } })

    const { result } = renderHook(() => useInboxUnreadCounts())
    await waitFor(() => expect(result.current.instagram).toBe(2))

    expect(result.current).toMatchObject({ metaTotal: 2, notifications: 0, total: 2 })
  })

  it('polls every 30 seconds for fresh counts', async () => {
    // Only fake the timer APIs — leave microtasks real so promise chains flush.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    mocks.listNotifications.mockResolvedValue({ unread_count: 1 })
    mocks.getConversations.mockResolvedValue({ data: { items: [] } })

    renderHook(() => useInboxUnreadCounts())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mocks.listNotifications).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(mocks.listNotifications).toHaveBeenCalledTimes(2)
  })
})
