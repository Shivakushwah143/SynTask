import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttendanceStatusBootstrap } from './AttendanceStatusBootstrap'

const authMock = vi.hoisted(() => ({
  state: { user: { id: 'user-1' }, isAuthenticated: true },
}))

const attendanceMock = vi.hoisted(() => ({
  state: { initialize: vi.fn(), refresh: vi.fn(), reset: vi.fn() },
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: Object.assign((selector) => selector(authMock.state), {
    getState: () => authMock.state,
  }),
}))

vi.mock('../../store/attendanceStore', () => ({
  useAttendanceStore: Object.assign((selector) => selector(attendanceMock.state), {
    getState: () => attendanceMock.state,
  }),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  authMock.state.user = { id: 'user-1' }
  authMock.state.isAuthenticated = true
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllTimers()
})

describe('AttendanceStatusBootstrap', () => {
  it('initializes the store once on mount for an authenticated user', () => {
    render(<AttendanceStatusBootstrap />)
    expect(attendanceMock.state.initialize).toHaveBeenCalledTimes(1)
  })

  it('resets on logout and does not initialize while logged out', () => {
    authMock.state.isAuthenticated = false
    authMock.state.user = null

    render(<AttendanceStatusBootstrap />)

    expect(attendanceMock.state.reset).toHaveBeenCalled()
    expect(attendanceMock.state.initialize).not.toHaveBeenCalled()
  })

  it('debounces focus and visibility events into a single silent refresh', () => {
    render(<AttendanceStatusBootstrap />)

    fireEvent(window, new Event('focus'))
    fireEvent(document, new Event('visibilitychange'))
    vi.advanceTimersByTime(200)
    expect(attendanceMock.state.refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(attendanceMock.state.refresh).toHaveBeenCalledTimes(1)
    expect(attendanceMock.state.refresh).toHaveBeenCalledWith({ silent: true })
  })

  it('skips the refresh when the user logs out between events', () => {
    render(<AttendanceStatusBootstrap />)
    authMock.state.isAuthenticated = false

    fireEvent(window, new Event('focus'))
    vi.advanceTimersByTime(300)
    expect(attendanceMock.state.refresh).not.toHaveBeenCalled()
  })
})
