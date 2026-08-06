import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Attendance from './Attendance'

const apiMock = vi.hoisted(() => ({
  getMyAttendanceHistory: vi.fn(),
}))

const storeMock = vi.hoisted(() => ({
  state: {
    record: null,
    loading: false,
    refreshing: false,
    error: null,
    pendingAction: null,
    initialize: vi.fn(),
    refresh: vi.fn(),
    checkIn: vi.fn(),
    startBreak: vi.fn(),
    resumeWork: vi.fn(),
    checkOut: vi.fn(),
  },
}))

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../../api/attendance', () => ({
  attendanceAPI: apiMock,
}))

vi.mock('../../store/attendanceStore', () => ({
  useAttendanceStore: (selector) => selector(storeMock.state),
}))

vi.mock('react-hot-toast', () => ({ default: toastMock }))

const baseRecord = {
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
  received_at: Date.now(),
}

const setRecord = (overrides = {}) => {
  Object.assign(storeMock.state, {
    record: { ...baseRecord, ...overrides },
    loading: false,
    refreshing: false,
    error: null,
    pendingAction: null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(storeMock.state, {
    record: null,
    loading: false,
    refreshing: false,
    error: null,
    pendingAction: null,
  })
  apiMock.getMyAttendanceHistory.mockResolvedValue({ data: [] })
  toastMock.success.mockResolvedValue()
  toastMock.error.mockResolvedValue()
})

describe('Attendance page (global store integration)', () => {
  it('shows the working timer with the store record', () => {
    setRecord()
    render(<Attendance />)

    expect(screen.getByLabelText(/Net working time:/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start Break' })).toBeTruthy()
  })

  it('Check In calls the store once and toasts success once', async () => {
    setRecord({ status: 'not_checked_in' })
    storeMock.state.checkIn.mockResolvedValue({ ...baseRecord, status: 'working' })

    render(<Attendance />)
    fireEvent.click(screen.getByRole('button', { name: 'Check In' }))

    await waitFor(() => expect(storeMock.state.checkIn).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Checked in successfully'))
    expect(toastMock.success).toHaveBeenCalledTimes(1)
  })

  it('Start Break toasts success once', async () => {
    setRecord()
    storeMock.state.startBreak.mockResolvedValue({ ...baseRecord, status: 'on_break', current_break_started_at: '2026-08-06T07:00:00.000Z' })

    render(<Attendance />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Break' }))

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Break started'))
    expect(toastMock.success).toHaveBeenCalledTimes(1)
  })

  it('Resume Work toasts success once', async () => {
    setRecord({ status: 'on_break', current_break_started_at: '2026-08-06T07:00:00.000Z' })
    storeMock.state.resumeWork.mockResolvedValue({ ...baseRecord, status: 'working' })

    render(<Attendance />)
    fireEvent.click(screen.getByRole('button', { name: 'Resume Work' }))

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Work resumed'))
    expect(toastMock.success).toHaveBeenCalledTimes(1)
  })

  it('Check Out via the confirmation modal toasts success once and closes the modal', async () => {
    setRecord()
    storeMock.state.checkOut.mockResolvedValue({ ...baseRecord, status: 'checked_out', check_out_at: '2026-08-06T14:00:00.000Z' })

    render(<Attendance />)
    fireEvent.click(screen.getByRole('button', { name: 'Check Out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Check Out' }))

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Checked out successfully'))
    expect(toastMock.success).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Confirm Check Out' })).toBeNull()
  })

  it('shows the failure toast and no success toast when Check In fails', async () => {
    setRecord({ status: 'not_checked_in' })
    storeMock.state.checkIn.mockRejectedValue(new Error('boom'))

    render(<Attendance />)
    fireEvent.click(screen.getByRole('button', { name: 'Check In' }))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("We couldn't check you in. Please try again."))
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('does not toast when the store skips a guarded duplicate action', async () => {
    setRecord({ status: 'not_checked_in' })
    storeMock.state.checkIn.mockResolvedValue(undefined)

    render(<Attendance />)
    fireEvent.click(screen.getByRole('button', { name: 'Check In' }))

    await waitFor(() => expect(storeMock.state.checkIn).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('shows the skeleton while the store is still loading', () => {
    Object.assign(storeMock.state, { record: null, loading: true, error: null })
    render(<Attendance />)

    expect(screen.queryByRole('button', { name: 'Check In' })).toBeNull()
    expect(screen.getByText('Check in, manage breaks, and track today\'s working time.')).toBeTruthy()
  })

  it('shows the error screen and retries via the store when no record can load', async () => {
    Object.assign(storeMock.state, { record: null, loading: false, error: 'network down' })
    storeMock.state.refresh.mockResolvedValue()

    render(<Attendance />)
    expect(screen.getByText('Attendance could not be loaded.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }))
    expect(storeMock.state.refresh).toHaveBeenCalledTimes(1)
  })
})
