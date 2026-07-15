import { beforeEach, describe, expect, test, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('./axios', () => ({
  default: apiMock,
}))

import { tasksAPI } from './tasks'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('tasksAPI contract', () => {
  test('lists tasks with stable query params', async () => {
    apiMock.get.mockResolvedValueOnce({ data: { tasks: [], total: 0, skip: 0, limit: 20 } })

    await tasksAPI.listTasks({
      status: 'todo',
      priority: 'high',
      assigned_to: 'user-1',
      department_id: 'dept-1',
      skip: 40,
      limit: 20,
    })

    expect(apiMock.get).toHaveBeenCalledWith('/tasks/?status_filter=todo&priority=high&assigned_to=user-1&department_id=dept-1&skip=40&limit=20')
  })

  test('creates, updates, and transitions tasks through form encoded payloads', async () => {
    apiMock.post.mockResolvedValueOnce({ data: { id: 'task-1' } })
    apiMock.put.mockResolvedValueOnce({ data: { id: 'task-1' } })
    apiMock.patch.mockResolvedValueOnce({ data: { id: 'task-1' } })

    await tasksAPI.createTask({ title: 'Demo', priority: 'medium', due_date: '2026-07-20' })
    await tasksAPI.updateTask('task-1', { title: 'Updated', tags: 'a,b' })
    await tasksAPI.updateTaskStatus('task-1', 'completed')

    expect(apiMock.post.mock.calls[0][0]).toBe('/tasks/')
    expect(String(apiMock.post.mock.calls[0][1])).toContain('title=Demo')
    expect(apiMock.put.mock.calls[0][0]).toBe('/tasks/task-1')
    expect(String(apiMock.put.mock.calls[0][1])).toContain('tags=a%2Cb')
    expect(apiMock.patch.mock.calls[0][0]).toBe('/tasks/task-1/status')
    expect(String(apiMock.patch.mock.calls[0][1])).toContain('new_status=completed')
  })

  test('covers extension and health endpoints', async () => {
    apiMock.get
      .mockResolvedValueOnce({ data: { status: 'ok' } })
      .mockResolvedValueOnce({ data: { summary: { healthy: 1 } } })
      .mockResolvedValueOnce({ data: { summary: { completed: 1 } } })
      .mockResolvedValueOnce({ data: { summary: { overdue: 1 } } })
      .mockResolvedValueOnce({ data: { summary: { pending: 1 } } })
      .mockResolvedValueOnce({ data: { requests: [] } })
    apiMock.post
      .mockResolvedValueOnce({ data: { message: 'Extension request submitted' } })
      .mockResolvedValueOnce({ data: { message: 'Extension approved' } })
      .mockResolvedValueOnce({ data: { message: 'Extension rejected' } })
      .mockResolvedValueOnce({ data: { message: 'Comment added successfully' } })

    await tasksAPI.getMyTaskHealth()
    await tasksAPI.getTaskHealthSummary()
    await tasksAPI.getTeamCompletionSummary()
    await tasksAPI.getOverdueTaskSummary()
    await tasksAPI.getExtensionRequestSummary()
    await tasksAPI.listExtensionRequests('task-1')
    await tasksAPI.requestExtension('task-1', { requested_due_date: '2026-07-20T09:00:00Z', reason: 'Need more time' })
    await tasksAPI.approveExtensionRequest('request-1', 'ok')
    await tasksAPI.rejectExtensionRequest('request-2', 'no')
    await tasksAPI.addComment('task-1', 'Hello')

    expect(apiMock.get.mock.calls.map((call) => call[0])).toEqual([
      '/tasks/health/me',
      '/tasks/health/summary',
      '/tasks/health/team-completion',
      '/tasks/health/overdue',
      '/tasks/health/extensions',
      '/tasks/task-1/extension-requests',
    ])
    expect(apiMock.post.mock.calls.map((call) => call[0])).toEqual([
      '/tasks/task-1/extension-requests',
      '/tasks/extension-requests/request-1/approve',
      '/tasks/extension-requests/request-2/reject',
      '/tasks/task-1/comments',
    ])
  })
})
