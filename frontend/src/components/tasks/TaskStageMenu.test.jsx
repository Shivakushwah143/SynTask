import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import TaskStageMenu from './TaskStageMenu'

vi.mock('../../api/tasks', () => ({
  tasksAPI: {
    startTask: vi.fn().mockResolvedValue({}),
    submitForReview: vi.fn().mockResolvedValue({}),
    requestRevision: vi.fn().mockResolvedValue({}),
    approveTask: vi.fn().mockResolvedValue({}),
    completeTask: vi.fn().mockResolvedValue({}),
    reopenTask: vi.fn().mockResolvedValue({}),
    updateTask: vi.fn().mockResolvedValue({}),
  },
}))

import { tasksAPI } from '../../api/tasks'

const makeTask = (overrides = {}) => ({
  id: 'task-1',
  title: 'Build landing page',
  status: 'assigned',
  assigned_to: 'emp-1',
  assigned_to_name: 'Emma Employee',
  reviewer_id: 'rev-1',
  review_required: true,
  is_blocked: false,
  checklist: [],
  created_by: 'rev-1',
  ...overrides,
})

const user = (id, role = 'employee') => ({ id, role })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TaskStageMenu', () => {
  test('renders nothing when the user has no stage options on the task', () => {
    const { container } = render(
      <TaskStageMenu task={makeTask({ status: 'in_review' })} user={user('other-emp')} canManage={false} />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('runs the single assignee action (submit for review) directly', async () => {
    const onUpdated = vi.fn()
    render(
      <TaskStageMenu
        task={makeTask({ status: 'in_progress' })}
        user={user('emp-1')}
        canManage={false}
        onUpdated={onUpdated}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    await waitFor(() => expect(tasksAPI.submitForReview).toHaveBeenCalledWith('task-1', null))
    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
  })

  test('reviewer on an in_progress task sees disabled options that explain the waiting step', () => {
    render(
      <TaskStageMenu
        task={makeTask({ status: 'in_progress', assigned_to: 'emp-1', reviewer_id: 'rev-1' })}
        user={user('rev-1', 'admin')}
        canManage
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /next stage/i }))
    expect(screen.getByText('The assignee must submit the task for review before it can be approved.')).toBeInTheDocument()
    expect(screen.getByText('The assignee must submit the task for review before a revision can be requested.')).toBeInTheDocument()
  })

  test('in_review opens the next-stage modal listing Approve and Request revision; choosing Request revision collects the reason first', async () => {
    const onUpdated = vi.fn()
    render(
      <TaskStageMenu
        task={makeTask({ status: 'in_review', reviewer_id: 'mgr-1' })}
        user={user('mgr-1', 'manager')}
        canManage
        onUpdated={onUpdated}
      />,
    )
    // Both options surface through the modal, not as separate row buttons.
    fireEvent.click(screen.getByRole('button', { name: /next stage/i }))
    expect(screen.getByText('Approve')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Request revision'))
    const reasonInput = screen.getByLabelText(/revision reason/i)
    fireEvent.change(reasonInput, { target: { value: 'Copy needs to match the brand guide.' } })
    fireEvent.click(screen.getByRole('button', { name: /send for revision/i }))
    await waitFor(() =>
      expect(tasksAPI.requestRevision).toHaveBeenCalledWith('task-1', 'Copy needs to match the brand guide.'),
    )
    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
  })

  test('an admin who is not the assigned reviewer can approve from the in_review next-stage modal', async () => {
    const onUpdated = vi.fn()
    render(
      <TaskStageMenu
        task={makeTask({ status: 'in_review', reviewer_id: 'rev-1' })}
        user={user('mgr-1', 'manager')}
        canManage
        onUpdated={onUpdated}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /next stage/i }))
    expect(screen.getByText('Request revision')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(tasksAPI.approveTask).toHaveBeenCalledWith('task-1'))
    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
  })

  test('assign requires picking an assignee before it runs', async () => {
    const onUpdated = vi.fn()
    render(
      <TaskStageMenu
        task={makeTask({ status: 'todo', assigned_to: null })}
        user={user('mgr-1', 'manager')}
        canManage
        assignableUsers={[{ id: 'emp-9', first_name: 'Noah', last_name: 'Newhire' }]}
        onUpdated={onUpdated}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /assign to team member/i }))
    expect(tasksAPI.updateTask).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /assign task/i }))
    expect(screen.getByText('Select an employee to assign the task to.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/assign to/i), { target: { value: 'emp-9' } })
    fireEvent.click(screen.getByRole('button', { name: /assign task/i }))
    await waitFor(() => expect(tasksAPI.updateTask).toHaveBeenCalledWith('task-1', { assigned_to: 'emp-9' }))
    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
  })
})
