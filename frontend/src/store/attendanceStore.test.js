import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  getTodayAttendance: vi.fn(),
  checkIn: vi.fn(),
  startBreak: vi.fn(),
  endBreak: vi.fn(),
  checkOut: vi.fn(),
}))

const authMock = vi.hoisted(() => ({
  isAuthenticated: true,
  user: { id: 'user-1' },
}))

vi.mock('../api/attendance', () => ({
  attendanceAPI: apiMock,
}))

vi.mock('./authStore', () => ({
  useAuthStore: { getState: () => authMock },
}))

import { useAttendanceStore } from './attendanceStore'
import { extractAttendanceRecord } from '../features/attendance/attendanceStatus'

class MockBroadcastChannel {
  static instances = []
  name
  onmessage = null
  postMessage = vi.fn()
  close = vi.fn()

  constructor(name) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }
}

const workingRecord = (overrides = {}) => ({
  id: 'att-1',
  attendance_date: '2026-08-06',
  date: '2026-08-06',
  status: 'working',
  check_in_at: '2026-08-06T06:00:00.000Z',
  check_out_at: null,
  current_break_started_at: null,
  total_break_seconds: 0,
  total_work_seconds: 0,
  total_working_hours: 0,
  server_time: '2026-08-06T06:00:00.000Z',
  ...overrides,
})

const apiResponse = (record) => ({ success: true, data: record })

beforeEach(() => {
  vi.resetAllMocks()
  MockBroadcastChannel.instances.length = 0
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
  window.localStorage.clear()
  authMock.isAuthenticated = true
  authMock.user = { id: 'user-1' }
  useAttendanceStore.getState().reset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('attendanceStore', () => {
  it('initializes from /attendance/me/today', async () => {
    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord()))

    await useAttendanceStore.getState().initialize()

    const state = useAttendanceStore.getState()
    expect(apiMock.getTodayAttendance).toHaveBeenCalledTimes(1)
    expect(state.status).toBe('working')
    expect(state.record.status).toBe('working')
    expect(state.initialized).toBe(true)
    expect(state.loading).toBe(false)
    expect(state.userId).toBe('user-1')
  })

  it('does not fetch while logged out and clears stale state', async () => {
    authMock.isAuthenticated = false
    useAttendanceStore.getState().setRecord(apiResponse(workingRecord()))

    await useAttendanceStore.getState().initialize()

    expect(apiMock.getTodayAttendance).not.toHaveBeenCalled()
    expect(useAttendanceStore.getState().record).toBeNull()
  })

  it('normalizes the API response and attaches sync metadata', async () => {
    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord({ status: 'on_break' })))

    await useAttendanceStore.getState().initialize()

    const { record, status } = useAttendanceStore.getState()
    expect(status).toBe('on_break')
    expect(record.status).toBe('on_break')
    expect(typeof record.received_at).toBe('number')
  })

  it('falls back to not_checked_in for unknown status values', () => {
    const record = extractAttendanceRecord(apiResponse(workingRecord({ status: 'Offline' })))
    expect(record.status).toBe('not_checked_in')
  })

  it('checkIn applies the record immediately and publishes a sync event', async () => {
    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord()))
    await useAttendanceStore.getState().initialize()

    apiMock.checkIn.mockResolvedValue(apiResponse(workingRecord({ id: 'att-9' })))
    const record = await useAttendanceStore.getState().checkIn()

    expect(record.status).toBe('working')
    expect(useAttendanceStore.getState().record.id).toBe('att-9')
    expect(useAttendanceStore.getState().status).toBe('working')
    const channel = MockBroadcastChannel.instances[0]
    expect(channel.postMessage).toHaveBeenCalledWith({ type: 'attendance-changed', userId: 'user-1' })
  })

  it('startBreak, resumeWork and checkOut update the store status immediately', async () => {
    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord()))
    await useAttendanceStore.getState().initialize()

    apiMock.startBreak.mockResolvedValue(apiResponse(workingRecord({ status: 'on_break', current_break_started_at: '2026-08-06T07:00:00.000Z' })))
    await useAttendanceStore.getState().startBreak()
    expect(useAttendanceStore.getState().status).toBe('on_break')

    apiMock.endBreak.mockResolvedValue(apiResponse(workingRecord({ status: 'working' })))
    await useAttendanceStore.getState().resumeWork()
    expect(useAttendanceStore.getState().status).toBe('working')

    apiMock.checkOut.mockResolvedValue(apiResponse(workingRecord({ status: 'checked_out', check_out_at: '2026-08-06T14:00:00.000Z' })))
    await useAttendanceStore.getState().checkOut()
    expect(useAttendanceStore.getState().status).toBe('checked_out')
  })

  it('blocks duplicate mutations while one is pending', async () => {
    let resolveCheckIn
    apiMock.checkIn.mockReturnValue(new Promise((resolve) => { resolveCheckIn = resolve }))

    const first = useAttendanceStore.getState().checkIn()
    const second = useAttendanceStore.getState().checkIn()
    const startBreakSkipped = await useAttendanceStore.getState().startBreak()

    expect(startBreakSkipped).toBeUndefined()
    await expect(second).resolves.toBeUndefined()

    resolveCheckIn(apiResponse(workingRecord()))
    await expect(first).resolves.toMatchObject({ status: 'working' })
    expect(apiMock.checkIn).toHaveBeenCalledTimes(1)
    expect(apiMock.startBreak).not.toHaveBeenCalled()
    expect(useAttendanceStore.getState().pendingAction).toBeNull()
  })

  it('keeps the last valid record when a silent refresh fails', async () => {
    apiMock.checkIn.mockResolvedValue(apiResponse(workingRecord()))
    await useAttendanceStore.getState().checkIn()

    apiMock.getTodayAttendance.mockRejectedValue(new Error('network down'))
    await useAttendanceStore.getState().refresh({ silent: true })

    const state = useAttendanceStore.getState()
    expect(state.record?.status).toBe('working')
    expect(state.error).toBeTruthy()
    expect(state.refreshing).toBe(false)

    // A later successful refresh clears the error.
    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord({ status: 'on_break' })))
    await useAttendanceStore.getState().refresh({ silent: true })
    expect(useAttendanceStore.getState().error).toBeNull()
    expect(useAttendanceStore.getState().status).toBe('on_break')
  })

  it('deduplicates concurrent refreshes into a single request', async () => {
    let resolveRefresh
    apiMock.getTodayAttendance.mockReturnValue(new Promise((resolve) => { resolveRefresh = resolve }))

    const first = useAttendanceStore.getState().refresh()
    const second = useAttendanceStore.getState().refresh()
    expect(apiMock.getTodayAttendance).toHaveBeenCalledTimes(1)

    resolveRefresh(apiResponse(workingRecord({ status: 'on_break' })))
    await Promise.all([first, second])
    expect(useAttendanceStore.getState().status).toBe('on_break')
  })

  it('does not let a slow refresh overwrite a newer mutation result', async () => {
    let resolveRefresh
    apiMock.getTodayAttendance.mockReturnValue(new Promise((resolve) => { resolveRefresh = resolve }))
    const slowRefresh = useAttendanceStore.getState().refresh()

    apiMock.checkIn.mockResolvedValue(apiResponse(workingRecord()))
    await useAttendanceStore.getState().checkIn()

    resolveRefresh(apiResponse(workingRecord({ status: 'checked_out' })))
    await slowRefresh

    expect(useAttendanceStore.getState().status).toBe('working')
  })

  it('ignores a refresh response for a user who changed mid-flight', async () => {
    let resolveRefresh
    apiMock.getTodayAttendance.mockReturnValue(new Promise((resolve) => { resolveRefresh = resolve }))
    const slowRefresh = useAttendanceStore.getState().refresh()

    authMock.user = { id: 'user-2' }
    resolveRefresh(apiResponse(workingRecord({ id: 'att-other' })))
    await slowRefresh

    expect(useAttendanceStore.getState().record).toBeNull()
    expect(useAttendanceStore.getState().status).toBeNull()
  })

  it('resets the previous user record when a different user logs in', async () => {
    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord()))
    await useAttendanceStore.getState().initialize()
    expect(useAttendanceStore.getState().status).toBe('working')

    authMock.user = { id: 'user-2' }
    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord({ id: 'att-2' })))
    await useAttendanceStore.getState().initialize()

    const state = useAttendanceStore.getState()
    expect(state.userId).toBe('user-2')
    expect(state.record?.id).toBe('att-2')
    expect(state.status).toBe('working')
  })

  it('clears the old user record synchronously before fetching for a new user', async () => {
    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord()))
    await useAttendanceStore.getState().initialize()
    expect(useAttendanceStore.getState().status).toBe('working')

    authMock.user = { id: 'user-2' }
    apiMock.getTodayAttendance.mockReturnValue(new Promise(() => {}))
    useAttendanceStore.getState().initialize()

    expect(useAttendanceStore.getState().record).toBeNull()
    expect(useAttendanceStore.getState().status).toBeNull()
  })

  it('clears attendance state on reset (logout)', () => {
    useAttendanceStore.getState().setRecord(apiResponse(workingRecord()))
    expect(useAttendanceStore.getState().status).toBe('working')

    useAttendanceStore.getState().reset()

    const state = useAttendanceStore.getState()
    expect(state.record).toBeNull()
    expect(state.status).toBeNull()
    expect(state.initialized).toBe(false)
    expect(state.userId).toBeNull()
  })

  it('refreshes from another tab via BroadcastChannel', async () => {
    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord()))
    await useAttendanceStore.getState().initialize()
    expect(useAttendanceStore.getState().status).toBe('working')

    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord({ status: 'on_break' })))
    const channel = MockBroadcastChannel.instances[0]
    channel.onmessage({ data: { type: 'attendance-changed', userId: 'user-1' } })

    await vi.waitFor(() => expect(useAttendanceStore.getState().status).toBe('on_break'))
  })

  it('ignores cross-tab events for a different user', async () => {
    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord()))
    await useAttendanceStore.getState().initialize()
    apiMock.getTodayAttendance.mockClear()

    const channel = MockBroadcastChannel.instances[0]
    channel.onmessage({ data: { type: 'attendance-changed', userId: 'someone-else' } })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(apiMock.getTodayAttendance).not.toHaveBeenCalled()
  })

  it('uses the storage-event fallback when BroadcastChannel is unavailable', async () => {
    vi.stubGlobal('BroadcastChannel', undefined) // force the fallback path
    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord()))
    await useAttendanceStore.getState().initialize()
    expect(useAttendanceStore.getState().syncChannel).toBeNull()

    apiMock.getTodayAttendance.mockResolvedValue(apiResponse(workingRecord({ status: 'on_break' })))
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'syntask:attendance-sync',
        newValue: JSON.stringify({ userId: 'user-1', at: Date.now() }),
      }),
    )

    await vi.waitFor(() => expect(useAttendanceStore.getState().status).toBe('on_break'))
  })
})
