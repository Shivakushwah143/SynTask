import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReminderToastListener, { filterNewReminderToasts, getReminderRoute } from './ReminderToastListener'

const apiMock = vi.hoisted(() => ({
  listReminderToasts: vi.fn(),
  acknowledgeReminderToasts: vi.fn(),
}))

const authMock = vi.hoisted(() => ({
  user: { id: 'user-1' },
  isAuthenticated: true,
}))

const toastMock = vi.hoisted(() => ({
  custom: vi.fn(),
  dismiss: vi.fn(),
}))

vi.mock('../api/notifications', () => ({
  notificationsAPI: apiMock,
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: () => authMock,
}))

vi.mock('react-hot-toast', () => ({
  default: toastMock,
}))

beforeEach(() => {
  vi.clearAllMocks()
  apiMock.acknowledgeReminderToasts.mockResolvedValue({ updated: 1 })
})

describe('ReminderToastListener', () => {
  it('does not acknowledge reminders until user dismisses popup', async () => {
    apiMock.listReminderToasts.mockResolvedValue({
      notifications: [
        {
          id: 'notif-1',
          title: 'Task due today',
          message: 'Task Demo is due today.',
          priority: 'critical',
          action_url: '/tasks/task-1',
        },
      ],
    })

    render(
      <MemoryRouter>
        <ReminderToastListener />
      </MemoryRouter>
    )

    await waitFor(() => expect(toastMock.custom).toHaveBeenCalledTimes(1))
    expect(apiMock.acknowledgeReminderToasts).not.toHaveBeenCalled()

    const renderToast = toastMock.custom.mock.calls[0][0]
    render(renderToast({ id: 'toast-1' }), { wrapper: MemoryRouter })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reminder popup' }))

    expect(apiMock.acknowledgeReminderToasts).toHaveBeenCalledWith(['notif-1'])
  })

  it('keeps routes and duplicate filtering stable', () => {
    expect(getReminderRoute({ action_url: '/tasks/task-1' })).toBe('/tasks/task-1')
    expect(getReminderRoute({ related_type: 'content' })).toBe('/content-calendar')
    expect(filterNewReminderToasts([{ id: 'a' }, { id: 'b' }], new Set(['a']))).toEqual([{ id: 'b' }])
  })
})
