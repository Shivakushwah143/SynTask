import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import ScheduledJobs from './ScheduledJobs'

vi.mock('../api/scheduledJobs', () => ({
  scheduledJobsAPI: {
    listJobs: vi.fn(),
  },
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({
    user: { role: 'admin' },
  }),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

import { scheduledJobsAPI } from '../api/scheduledJobs'

describe('ScheduledJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scheduledJobsAPI.listJobs.mockResolvedValue({ jobs: [], total: 0, skip: 0, limit: 20 })
  })

  test('renders empty state without passing JSX as icon component', async () => {
    render(
      <MemoryRouter>
        <ScheduledJobs />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('No scheduled jobs yet')).toBeInTheDocument())
  })
})
