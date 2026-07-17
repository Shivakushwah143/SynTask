import { describe, expect, test } from 'vitest'
import { buildTaskGraphRows, buildTaskGraphSummary } from './tasksData'

describe('tasks graph data helpers', () => {
  test('maps task status to progress and priority to color', () => {
    const rows = buildTaskGraphRows([
      { id: 't1', title: 'Plan launch', status: 'todo', priority: 'critical' },
      { id: 't2', title: 'Build UI', status: 'in_progress', priority: 'high' },
      { id: 't3', title: 'Review copy', status: 'in_review', priority: 'medium' },
      { id: 't4', title: 'Ship', status: 'completed', priority: 'low' },
    ])

    expect(rows).toEqual([
      expect.objectContaining({ id: 't1', progress: 12, priorityColor: '#991B1B', statusLabel: 'To Do' }),
      expect.objectContaining({ id: 't2', progress: 45, priorityColor: '#EF4444', statusLabel: 'In Progress' }),
      expect.objectContaining({ id: 't3', progress: 75, priorityColor: '#F59E0B', statusLabel: 'Review' }),
      expect.objectContaining({ id: 't4', progress: 100, priorityColor: '#2FB47C', statusLabel: 'Completed' }),
    ])
  })

  test('summarizes tasks by active and completed counts', () => {
    const summary = buildTaskGraphSummary([
      { status: 'todo' },
      { status: 'in_progress' },
      { status: 'completed' },
    ])

    expect(summary).toEqual({ total: 3, active: 2, completed: 1 })
  })

  test('resolves assignee name from assignable users when task has only id', () => {
    const rows = buildTaskGraphRows([
      { id: 't1', title: 'Follow up', assigned_to: 'u1' },
      { id: 't2', title: 'Unowned' },
    ], [
      { id: 'u1', first_name: 'Anita', last_name: 'Rao' },
    ])

    expect(rows[0].assignee).toBe('Anita Rao')
    expect(rows[1].assignee).toBe('Unassigned')
  })
})
