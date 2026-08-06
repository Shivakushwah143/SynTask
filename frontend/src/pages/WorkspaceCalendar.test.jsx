import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'

// A fixed timezone makes the near-midnight grouping assertions deterministic
// regardless of the machine's local timezone (never tested against the host).
process.env.TZ = 'Asia/Kolkata'

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))

vi.mock('react-query', () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

vi.mock('../api/calendar', () => ({
  calendarApi: { getEvents: vi.fn() },
  invalidateWorkspaceCalendar: vi.fn(),
}))

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ user: { role: 'admin' } }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('../services/timeService', () => {
  // Fixed "now": 2026-08-13T04:30:00Z == 2026-08-13 10:00 IST.
  const FIXED_NOW = new Date('2026-08-13T04:30:00Z')
  const formatInZone = (value) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(value))
    } catch {
      return ''
    }
  }
  return {
    timeService: {
      now: vi.fn(() => new Date(FIXED_NOW.getTime())),
      getTimezone: vi.fn(() => 'Asia/Kolkata'),
      instant: vi.fn((value) => new Date(value)),
      toUtcISOString: vi.fn((value) => new Date(value).toISOString()),
      formatPattern: vi.fn(formatInZone),
      formatTime: vi.fn(() => '11:30 AM'),
      hourLabel: vi.fn((hour) => {
        const h = ((Number(hour) % 24) + 24) % 24
        const h12 = h % 12 === 0 ? 12 : h % 12
        return `${h12}${h >= 12 ? 'PM' : 'AM'}`
      }),
    },
  }
})

import WorkspaceCalendar, { getCalendarEventDate } from './WorkspaceCalendar'
import { useQuery } from 'react-query'
import { calendarApi } from '../api/calendar'

const followUpEvent = (overrides = {}) => ({
  id: 'scheduled_job_followup_1',
  type: 'sales_follow_up',
  title: 'Follow-up: Acme Corp',
  status: 'scheduled',
  scheduled_status: 'PENDING',
  start: '2026-08-12',
  start_at: '2026-08-12T20:30:00Z', // 02:00 on Aug 13 IST
  scheduled_run_at: '2026-08-12T20:30:00Z',
  is_scheduled_placeholder: true,
  priority: 'medium',
  assignee: 'Asha Patel',
  assignee_id: 'employee-1',
  related_entity_id: 'lead-1',
  related_entity_type: 'sales_lead',
  related_entity_stage: 'acquire',
  related_entity_url: '/crm/leads/lead-1',
  notes: 'Call about the proposal',
  ...overrides,
})

const scheduledTaskEvent = (overrides = {}) => ({
  id: 'scheduled_job_task_1',
  type: 'scheduled_task',
  title: 'Scheduled Task: Deploy build',
  status: 'scheduled',
  scheduled_status: 'PENDING',
  start: '2026-08-12',
  start_at: '2026-08-12T06:00:00Z', // 11:30 on Aug 12 IST
  scheduled_run_at: '2026-08-12T06:00:00Z',
  is_scheduled_placeholder: true,
  priority: 'medium',
  assignee: 'Ravi Sharma',
  assignee_id: 'employee-2',
  ...overrides,
})

const normalTaskEvent = (overrides = {}) => ({
  id: 'task_due_task_99',
  type: 'task_due',
  title: 'Task Due: Ship landing page',
  status: 'todo',
  priority: 'high',
  start: '2026-08-11',
  start_at: '2026-08-11T06:00:00Z',
  assignee: 'Asha Patel',
  ...overrides,
})

const renderCalendar = (events) => {
  useQuery.mockReturnValue({
    data: { events },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
  return render(
    <MemoryRouter>
      <WorkspaceCalendar />
    </MemoryRouter>
  )
}

const dayCell = (dateKey) => document.querySelector(`[data-calendar-day="${dateKey}"]`)

// Month chips live inside a specific day cell; the follow-up sits in the Aug 13
// cell (local date) even though its UTC date is Aug 12.
const monthChip = (title) => {
  for (const key of ['2026-08-12', '2026-08-13']) {
    const cell = dayCell(key)
    const match = cell && within(cell).queryByText(title)
    if (match) return match.closest('button')
  }
  return null
}

describe('WorkspaceCalendar scheduled placeholders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigateMock.mockClear()
    calendarApi.getEvents.mockClear()
  })

  test('scheduled task appears in Month view', () => {
    renderCalendar([scheduledTaskEvent()])
    expect(within(dayCell('2026-08-12')).getByText('Scheduled Task: Deploy build')).toBeInTheDocument()
  })

  test('sales follow-up appears in Month view', () => {
    renderCalendar([followUpEvent()])
    // start_at 2026-08-12T20:30:00Z is Aug 13 02:00 IST → Aug 13 cell.
    expect(within(dayCell('2026-08-13')).getByText('Follow-up: Acme Corp')).toBeInTheDocument()
  })

  test('follow-up appears in Week view', () => {
    renderCalendar([followUpEvent()])
    fireEvent.click(screen.getAllByText('Week')[0])
    // The follow-up can also be listed in the side panel, so at least one match.
    expect(screen.getAllByText('Follow-up: Acme Corp').length).toBeGreaterThanOrEqual(1)
  })

  test('follow-up appears in Day view', () => {
    renderCalendar([followUpEvent()])
    fireEvent.click(screen.getAllByText('Day')[0])
    expect(screen.getAllByText('Follow-up: Acme Corp').length).toBeGreaterThanOrEqual(1)
  })

  test('follow-up filter hides and shows follow-ups', () => {
    renderCalendar([followUpEvent(), scheduledTaskEvent()])
    const followUpFilter = screen.getByLabelText('Sales Follow-ups')
    fireEvent.click(followUpFilter)
    expect(within(dayCell('2026-08-13')).queryByText('Follow-up: Acme Corp')).not.toBeInTheDocument()
    expect(within(dayCell('2026-08-12')).getByText('Scheduled Task: Deploy build')).toBeInTheDocument()
    fireEvent.click(followUpFilter)
    expect(within(dayCell('2026-08-13')).getByText('Follow-up: Acme Corp')).toBeInTheDocument()
  })

  test('scheduled task filter hides and shows generic scheduled tasks', () => {
    renderCalendar([followUpEvent(), scheduledTaskEvent()])
    const scheduledFilter = screen.getByLabelText('Scheduled Tasks')
    fireEvent.click(scheduledFilter)
    expect(within(dayCell('2026-08-12')).queryByText('Scheduled Task: Deploy build')).not.toBeInTheDocument()
    expect(within(dayCell('2026-08-13')).getByText('Follow-up: Acme Corp')).toBeInTheDocument()
    fireEvent.click(scheduledFilter)
    expect(within(dayCell('2026-08-12')).getByText('Scheduled Task: Deploy build')).toBeInTheDocument()
  })

  test('Select All includes the new filters', () => {
    renderCalendar([followUpEvent(), scheduledTaskEvent()])
    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(within(dayCell('2026-08-13')).queryByText('Follow-up: Acme Corp')).not.toBeInTheDocument()
    expect(within(dayCell('2026-08-12')).queryByText('Scheduled Task: Deploy build')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(within(dayCell('2026-08-13')).getByText('Follow-up: Acme Corp')).toBeInTheDocument()
    expect(within(dayCell('2026-08-12')).getByText('Scheduled Task: Deploy build')).toBeInTheDocument()
  })

  test('Clear All excludes the new filters', () => {
    renderCalendar([followUpEvent(), scheduledTaskEvent()])
    fireEvent.click(screen.getByRole('button', { name: 'None' }))
    expect(within(dayCell('2026-08-13')).queryByText('Follow-up: Acme Corp')).not.toBeInTheDocument()
    expect(within(dayCell('2026-08-12')).queryByText('Scheduled Task: Deploy build')).not.toBeInTheDocument()
  })

  test('follow-up chip uses the distinct fuchsia styling', () => {
    renderCalendar([followUpEvent()])
    const chip = monthChip('Follow-up: Acme Corp')
    expect(chip).not.toBeNull()
    expect(chip.className).toContain('fuchsia')
  })

  test('failed scheduled job renders a failed state', () => {
    renderCalendar([
      scheduledTaskEvent({
        id: 'scheduled_job_failed',
        title: 'Scheduled Task: Broken deploy',
        status: 'failed',
        scheduled_status: 'FAILED',
        error: 'Task creation failed',
        start_at: '2026-08-12T06:00:00Z',
      }),
    ])
    const chip = within(dayCell('2026-08-12')).getByText('Scheduled Task: Broken deploy').closest('button')
    expect(chip.className).toContain('border-red-200')
    expect(chip.className).toContain('bg-red-50')
  })

  test('groups events using start_at in the local timezone', () => {
    renderCalendar([followUpEvent()])
    // UTC date is Aug 12 but local (IST) date is Aug 13 → only the Aug 13 cell shows it.
    expect(within(dayCell('2026-08-13')).getByText('Follow-up: Acme Corp')).toBeInTheDocument()
    expect(within(dayCell('2026-08-12')).queryByText('Follow-up: Acme Corp')).not.toBeInTheDocument()
  })

  test('event near UTC midnight lands on the correct local date', () => {
    renderCalendar([followUpEvent()])
    const localDate = getCalendarEventDate(followUpEvent())
    // With TZ=Asia/Kolkata, 2026-08-12T20:30:00Z is Aug 13 02:00 local.
    expect(localDate.getFullYear()).toBe(2026)
    expect(localDate.getMonth()).toBe(7) // August
    expect(localDate.getDate()).toBe(13)
  })

  test('clicking a sales follow-up opens the originating lead route', () => {
    renderCalendar([followUpEvent()])
    const chip = monthChip('Follow-up: Acme Corp')
    fireEvent.click(chip)
    fireEvent.click(screen.getByRole('button', { name: /Open Lead/i }))
    expect(navigateMock).toHaveBeenCalledWith('/crm/leads/lead-1')
  })

  test('clicking a generic scheduled task opens Scheduled Work', () => {
    renderCalendar([scheduledTaskEvent()])
    const chip = monthChip('Scheduled Task: Deploy build')
    fireEvent.click(chip)
    fireEvent.click(screen.getByRole('button', { name: /Manage Schedule/i }))
    expect(navigateMock).toHaveBeenCalledWith('/scheduled-jobs')
  })

  test('normal task navigation remains unchanged', () => {
    renderCalendar([normalTaskEvent()])
    fireEvent.click(within(dayCell('2026-08-11')).getByText('Task Due: Ship landing page').closest('button'))
    fireEvent.click(screen.getByRole('button', { name: /Open Record/i }))
    expect(navigateMock).toHaveBeenCalledWith('/tasks/task_99')
  })

  test('upcoming count includes future follow-ups', () => {
    renderCalendar([followUpEvent({ start_at: '2026-08-14T06:00:00Z', start: '2026-08-14' })])
    const upcomingCard = screen.getByText('Upcoming').closest('.group')
    expect(upcomingCard.querySelectorAll('p')[0].textContent).toBe('1')
  })

  test('overdue count includes missed pending and failed jobs', () => {
    renderCalendar([
      followUpEvent({ id: 'scheduled_job_missed', start_at: '2026-08-05T06:00:00Z', start: '2026-08-05' }),
      scheduledTaskEvent({
        id: 'scheduled_job_failed_2',
        title: 'Scheduled Task: Failed job',
        status: 'failed',
        scheduled_status: 'FAILED',
        start_at: '2026-08-06T06:00:00Z',
        start: '2026-08-06',
      }),
    ])
    const overdueCard = screen.getByText('Overdue').closest('.group')
    expect(Number(overdueCard.querySelectorAll('p')[0].textContent)).toBeGreaterThanOrEqual(2)
  })

  test('cancelled and completed scheduled jobs are not rendered', () => {
    renderCalendar([
      followUpEvent({ id: 'job_completed', scheduled_status: 'COMPLETED', status: 'completed', title: 'Follow-up: Completed' }),
      scheduledTaskEvent({ id: 'job_cancelled', scheduled_status: 'CANCELLED', status: 'cancelled', title: 'Scheduled Task: Cancelled' }),
    ])
    expect(screen.queryByText('Follow-up: Completed')).not.toBeInTheDocument()
    expect(screen.queryByText('Scheduled Task: Cancelled')).not.toBeInTheDocument()
  })

  test('no duplicate placeholder appears once the generated task exists', () => {
    renderCalendar([
      followUpEvent({ id: 'job_done', result_type: 'task', result_id: 'task-777', title: 'Follow-up: Executed' }),
    ])
    expect(screen.queryByText('Follow-up: Executed')).not.toBeInTheDocument()
  })

  test('existing filters and views keep working', () => {
    renderCalendar([normalTaskEvent(), followUpEvent()])
    fireEvent.click(screen.getByLabelText('Tasks'))
    expect(within(dayCell('2026-08-11')).queryByText('Task Due: Ship landing page')).not.toBeInTheDocument()
    expect(within(dayCell('2026-08-13')).getByText('Follow-up: Acme Corp')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Tasks'))
    expect(within(dayCell('2026-08-11')).getByText('Task Due: Ship landing page')).toBeInTheDocument()
  })
})

describe('getCalendarEventDate', () => {
  test('prioritizes start_at over due_date and start', () => {
    const date = getCalendarEventDate({
      start: '2026-08-07',
      start_at: '2026-08-08T06:00:00Z',
      scheduled_run_at: '2026-08-08T06:00:00Z',
      due_date: '2026-08-09T06:00:00Z',
    })
    expect(date.toISOString()).toBe('2026-08-08T06:00:00.000Z')
  })

  test('falls back to due_date when no start_at is present', () => {
    const date = getCalendarEventDate({ start: '2026-08-07', due_date: '2026-08-09T06:00:00Z' })
    expect(date.toISOString()).toBe('2026-08-09T06:00:00.000Z')
  })

  test('falls back to start when nothing else exists', () => {
    const date = getCalendarEventDate({ start: '2026-08-07' })
    expect(date.toISOString().slice(0, 10)).toBe('2026-08-07')
  })
})
