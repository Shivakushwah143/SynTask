import { describe, expect, test } from 'vitest'
import { buildProjectHealthData, buildTaskDuePriorityData } from './dashboardData'

describe('dashboard chart data helpers', () => {
  test('groups upcoming task due dates by priority', () => {
    const data = buildTaskDuePriorityData([
      { id: '1', title: 'Urgent', priority: 'High', due_date: '2026-07-09T10:00:00Z' },
      { id: '2', title: 'Normal', priority: 'medium', due_date: '2026-07-09T12:00:00Z' },
      { id: '3', title: 'Later', priority: 'low', due_date: '2026-07-10T12:00:00Z' },
      { id: '4', title: 'Unscheduled', priority: 'high' },
    ], new Date('2026-07-09T00:00:00Z'))

    expect(data).toEqual([
      expect.objectContaining({ high: 1, medium: 1, low: 0 }),
      expect.objectContaining({ high: 0, medium: 0, low: 1 }),
    ])
  })

  test('builds project health bars with stable statuses', () => {
    const data = buildProjectHealthData([
      { id: 'p1', name: 'Alpha', status: 'active', task_count: 4 },
      { id: 'p2', name: 'Beta', status: 'completed', task_count: 2 },
    ])

    expect(data).toEqual([
      expect.objectContaining({ name: 'Alpha', active: 4, completed: 0, route: '/projects/p1/board' }),
      expect.objectContaining({ name: 'Beta', active: 0, completed: 2, route: '/projects/p2/board' }),
    ])
  })
})
