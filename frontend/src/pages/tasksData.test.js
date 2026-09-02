import { describe, expect, test } from 'vitest'
import { buildTaskGraphRows, buildTaskGraphSummary, buildTaskStatusBreakdown, isFollowUpTask } from './tasksData'

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
      expect.objectContaining({ id: 't3', progress: 75, priorityColor: '#F59E0B', statusLabel: 'In Review' }),
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

  test('resolves employee assignee from current user fallback', () => {
    const rows = buildTaskGraphRows([
      { id: 't1', title: 'Employee task', assigned_to: 'employee-1' },
    ], [
      { id: 'employee-1', first_name: 'Asha', last_name: 'Patel', role: 'employee' },
    ])

    expect(rows[0].assignee).toBe('Asha Patel')
  })

  test('excludes follow-up tasks from graph rows and summary', () => {
    const tasks = [
      { id: 't1', title: 'Real task', status: 'todo', priority: 'medium' },
      { id: 't2', title: 'Follow up call', status: 'in_progress', priority: 'high', source_type: 'sales_follow_up' },
    ]

    const rows = buildTaskGraphRows(tasks)
    expect(rows.map((r) => r.id)).toEqual(['t1'])

    const summary = buildTaskGraphSummary(tasks)
    expect(summary).toEqual({ total: 1, active: 1, completed: 0 })
  })

  test('isFollowUpTask flags sales follow-up tasks and scheduled placeholders', () => {
    expect(isFollowUpTask({ id: 't1', source_type: 'sales_follow_up' })).toBe(true)
    expect(isFollowUpTask({ id: 't2', source_type: 'SALES_FOLLOW_UP' })).toBe(true)
    // Scheduled follow-up placeholders now carry source_type from the job payload
    expect(isFollowUpTask({ id: 't3', is_scheduled_placeholder: true, source_type: 'sales_follow_up' })).toBe(true)
    expect(isFollowUpTask({ id: 't4', source_type: 'imported' })).toBe(false)
    expect(isFollowUpTask({ id: 't5' })).toBe(false)
  })

  test('keeps scheduled placeholders that are not follow-ups in graph rows', () => {
    const rows = buildTaskGraphRows([
      { id: 's1', title: 'Publish later', status: 'scheduled', is_scheduled_placeholder: true },
      { id: 'f1', title: 'Follow up call', status: 'scheduled', is_scheduled_placeholder: true, source_type: 'sales_follow_up' },
      { id: 't1', title: 'Real task', status: 'todo' },
    ])

    expect(rows.map((r) => r.id)).toEqual(['s1', 't1'])
    expect(rows[0].isScheduled).toBe(true)
  })

  test('counts tasks per status in the stage breakdown', () => {
    const breakdown = buildTaskStatusBreakdown([
      { status: 'todo' },
      { status: 'in_progress' },
      { status: 'in_progress' },
      { status: 'in_review' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
    ])

    expect(breakdown).toEqual({
      counts: { todo: 1, in_progress: 2, in_review: 1, completed: 3 },
      total: 7,
    })
  })

  test('stage breakdown excludes follow-up tasks', () => {
    const breakdown = buildTaskStatusBreakdown([
      { status: 'todo' },
      { status: 'in_progress', source_type: 'sales_follow_up' },
    ])

    expect(breakdown).toEqual({ counts: { todo: 1 }, total: 1 })
  })

  test('stage breakdown handles scheduled status and empty input', () => {
    expect(buildTaskStatusBreakdown([{ status: 'scheduled' }]).counts).toEqual({ scheduled: 1 })
    expect(buildTaskStatusBreakdown([])).toEqual({ counts: {}, total: 0 })
  })
})
