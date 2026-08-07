import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopNavigation } from './TopNavigation'

const { mockUser } = vi.hoisted(() => ({
  mockUser: { role: 'employee' },
}))

const { mockAttendanceState } = vi.hoisted(() => ({
  mockAttendanceState: {
    status: null,
    record: null,
    loading: false,
    initialized: false,
    error: null,
  },
}))

vi.mock('../../store/authStore', () => ({
  useAuthStore: () => ({ user: mockUser }),
}))

vi.mock('../../store/attendanceStore', () => ({
  useAttendanceStore: (selector) => selector(mockAttendanceState),
}))

vi.mock('../../utils/rbac', () => ({
  filterNavItems: () => [],
}))

// Heavy navbar controls are irrelevant to the attendance pill under test.
vi.mock('../NotificationBell', () => ({ default: () => null }))
vi.mock('../ThemeToggle', () => ({ default: () => null }))
vi.mock('../GlobalClock', () => ({ default: () => null }))
vi.mock('../ai/SynzinAvatar', () => ({ SynzinAvatar: () => null }))

const renderTopNav = (pathname = '/') =>
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/" element={<TopNavigation onMenuClick={vi.fn()} onLogout={vi.fn()} />} />
        <Route
          path="/attendance"
          element={(
            <>
              <TopNavigation onMenuClick={vi.fn()} onLogout={vi.fn()} />
              <div>Attendance Page Placeholder</div>
            </>
          )}
        />
      </Routes>
    </MemoryRouter>,
  )

const setStatus = (status, { initialized = true, error = null, record = true } = {}) => {
  mockAttendanceState.status = status
  mockAttendanceState.initialized = initialized
  mockAttendanceState.error = error
  mockAttendanceState.record = record ? { id: 'att-1', status } : null
}

beforeEach(() => {
  localStorage.clear()
  mockUser.role = 'employee'
  Object.assign(mockAttendanceState, {
    status: null,
    record: null,
    loading: false,
    initialized: false,
    error: null,
  })
})

describe('TopNavigation attendance status pill', () => {
  it('renders the Working status', () => {
    setStatus('working')
    renderTopNav()

    expect(screen.getByRole('link', { name: 'Attendance status: Working' })).toBeTruthy()
    expect(screen.getByText('Working')).toBeTruthy()
  })

  it('renders the On Break status', () => {
    setStatus('on_break')
    renderTopNav()

    expect(screen.getByRole('link', { name: 'Attendance status: On Break' })).toBeTruthy()
    expect(screen.getByText('On Break')).toBeTruthy()
  })

  it('renders the Day Completed status', () => {
    setStatus('checked_out')
    renderTopNav()

    expect(screen.getByRole('link', { name: 'Attendance status: Day Completed' })).toBeTruthy()
    expect(screen.getByText('Day Completed')).toBeTruthy()
  })

  it('renders Not Checked In when the user has not checked in', () => {
    setStatus('not_checked_in')
    renderTopNav()

    expect(screen.getByRole('link', { name: 'Attendance status: Not Checked In' })).toBeTruthy()
  })

  it('navigates to /attendance when clicked', () => {
    setStatus('working')
    renderTopNav()

    fireEvent.click(screen.getByRole('link', { name: 'Attendance status: Working' }))
    expect(screen.getByText('Attendance Page Placeholder')).toBeTruthy()
  })

  it('marks the pill with aria-current on the attendance page', () => {
    setStatus('working')
    renderTopNav('/attendance')

    const pill = screen.getByRole('link', { name: 'Attendance status: Working' })
    expect(pill).toHaveAttribute('aria-current', 'page')
  })

  it('shows a skeleton while attendance is still loading', () => {
    mockAttendanceState.initialized = false
    mockAttendanceState.loading = true
    renderTopNav()

    expect(screen.getByRole('link', { name: 'Attendance status loading' })).toBeTruthy()
    expect(screen.queryByText('Not Checked In')).toBeNull()
  })

  it('shows a neutral unavailable state instead of a wrong status on load failure', () => {
    setStatus(null, { initialized: true, error: 'network down', record: false })
    renderTopNav()

    expect(screen.getByRole('link', { name: 'Attendance unavailable' })).toBeTruthy()
    expect(screen.queryByText('Not Checked In')).toBeNull()
  })

  it('keeps the last valid status when a refresh fails but a record exists', () => {
    setStatus('working', { initialized: true, error: 'network down', record: true })
    renderTopNav()

    expect(screen.getByRole('link', { name: 'Attendance status: Working' })).toBeTruthy()
  })
})
