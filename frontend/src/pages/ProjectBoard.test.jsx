import { describe, expect, it } from 'vitest'
import { buildProjectTaskQuery, getProjectRoleAssignmentIds, getProjectRoleNames, getTaskAssigneeUsers, groupTasksByStatus, normalizeBoardPayload, normalizeEstimatedHours, resolveWorkspaceTab, workspaceTabParam } from './ProjectBoard.helpers'

const phase2Columns = ['todo', 'assigned', 'in_progress', 'in_review', 'revision_required', 'approved', 'completed']

describe('ProjectBoard task form helpers', () => {
  it('accepts positive task estimates above and below 24 hours', () => {
    expect(normalizeEstimatedHours('0.25')).toBe('0.25')
    expect(normalizeEstimatedHours('12')).toBe('12')
    expect(normalizeEstimatedHours('24')).toBe('24')
    expect(normalizeEstimatedHours('24.25')).toBe('24.25')
    expect(normalizeEstimatedHours('48')).toBe('48')
  })

  it('rejects empty and zero estimates', () => {
    expect(normalizeEstimatedHours('')).toBeNull()
    expect(normalizeEstimatedHours('0')).toBeNull()
  })

  it('keeps active employees from different managers in task assignee options', () => {
    const users = [
      { id: 'emp-a', first_name: 'Asha', role: 'employee', status: 'active', reports_to: 'lead-1' },
      { id: 'emp-b', first_name: 'Ben', role: 'employee', status: 'active', reports_to: 'lead-2' },
      { id: 'lead-1', first_name: 'Lead', role: 'lead', status: 'active' },
      { id: 'inactive', first_name: 'Old', role: 'employee', status: 'inactive' },
    ]

    expect(getTaskAssigneeUsers(users, { id: 'manager-1' }).map((item) => item.id)).toEqual(['emp-a', 'emp-b'])
  })
})

describe('ProjectBoard normalizeBoardPayload', () => {
  it('replaces empty custom phase columns with status-based stage cards', () => {
    // Real project shape: custom PLANNING/EXECUTION/DELIVERY columns while all
    // tasks are still in "todo" - the custom cards must be dropped and the
    // standard status cards shown instead.
    const normalized = normalizeBoardPayload({
      data: {
        board_columns: [
          { id: 'phase-1', label: 'PLANNING' },
          { id: 'phase-2', label: 'EXECUTION' },
          { id: 'phase-3', label: 'DELIVERY' },
        ],
        tasks_by_status: {
          'phase-1': [],
          'phase-2': [],
          'phase-3': [],
          todo: [{ id: 't1', title: 'Build onboarding', status: 'todo' }],
        },
      },
    })

    expect(normalized.board_columns.map((column) => column.id)).toEqual(phase2Columns)
    expect(normalized.tasks_by_status.todo).toHaveLength(1)
  })

  it('adds a card for any non-standard status that actually has tasks', () => {
    const normalized = normalizeBoardPayload({
      data: {
        board_columns: [{ id: 'phase-1', label: 'PLANNING' }],
        tasks_by_status: {
          'phase-1': [],
          todo: [],
          blocked: [{ id: 't1', title: 'Stuck', status: 'blocked' }],
        },
      },
    })

    const ids = normalized.board_columns.map((column) => column.id)
    expect(ids).toEqual([...phase2Columns, 'blocked'])
    expect(normalized.board_columns[7].label).toBe('Blocked')
    expect(normalized.tasks_by_status.blocked).toHaveLength(1)
  })

  it('does not duplicate standard columns that already have tasks', () => {
    const normalized = normalizeBoardPayload({
      data: {
        board_columns: [{ id: 'in_progress', label: 'In Progress' }],
        tasks_by_status: {
          in_progress: [{ id: 't1', status: 'in_progress' }],
        },
      },
    })

    expect(normalized.board_columns.map((column) => column.id)).toEqual(phase2Columns)
    expect(normalized.tasks_by_status.in_progress).toHaveLength(1)
  })

  it('keeps the standard cards and never adds empty buckets', () => {
    const normalized = normalizeBoardPayload({
      data: {
        board_columns: [{ id: 'phase-1', label: 'PLANNING' }],
        tasks_by_status: {
          'phase-1': [],
          in_progress: [],
        },
      },
    })

    expect(normalized.board_columns.map((column) => column.id)).toEqual(phase2Columns)
  })
})

describe('ProjectBoard role overview helpers', () => {
  it('resolves manager name from current user when manager is not in assignable users', () => {
    const names = getProjectRoleNames(
      { assigned_user_ids: ['manager-1', 'lead-1'] },
      [{ id: 'lead-1', first_name: 'Leena', last_name: 'Rao', role: 'lead' }],
      { id: 'manager-1', first_name: 'Maya', last_name: 'Shah', role: 'manager' },
    )

    expect(names.manager).toEqual(['Maya Shah'])
    expect(names.lead).toEqual(['Leena Rao'])
  })

  it('uses assigned_users payload names before lookup fallbacks', () => {
    const names = getProjectRoleNames(
      { assigned_users: [{ id: 'manager-2', name: 'Amit Verma', role: 'manager' }] },
      [],
      null,
    )

    expect(names.manager).toEqual(['Amit Verma'])
  })

  it('splits project assignment ids into manager and leader controls', () => {
    const roleIds = getProjectRoleAssignmentIds(
      { assigned_user_ids: ['manager-1', 'lead-1'] },
      [
        { id: 'manager-1', role: 'manager' },
        { id: 'lead-1', role: 'lead' },
      ],
      null,
    )

    expect(roleIds).toEqual({ manager: 'manager-1', lead: 'lead-1' })
  })

  it('uses current manager id when assignable users only include leaders', () => {
    const roleIds = getProjectRoleAssignmentIds(
      { assigned_user_ids: ['manager-1', 'lead-1'] },
      [{ id: 'lead-1', role: 'lead' }],
      { id: 'manager-1', role: 'manager' },
    )

    expect(roleIds).toEqual({ manager: 'manager-1', lead: 'lead-1' })
  })
})

describe('ProjectBoard task workspace URL + grouping helpers', () => {
  it('resolves workspace tab params with Tasks as the default', () => {
    expect(resolveWorkspaceTab(undefined)).toBe('board')
    expect(resolveWorkspaceTab(null)).toBe('board')
    expect(resolveWorkspaceTab('tasks')).toBe('board')
    expect(resolveWorkspaceTab('board')).toBe('board')
    expect(resolveWorkspaceTab('summary')).toBe('summary')
    expect(resolveWorkspaceTab('files')).toBe('pages')
    expect(resolveWorkspaceTab('pages')).toBe('pages')
  })

  it('writes the canonical workspace tab param', () => {
    expect(workspaceTabParam('board')).toBe('tasks')
    expect(workspaceTabParam('summary')).toBe('summary')
    expect(workspaceTabParam('pages')).toBe('files')
  })

  it('groups a filtered task list into status buckets', () => {
    const tasks = [
      { id: 't1', status: 'in_progress' },
      { id: 't2', status: 'in_progress' },
      { id: 't3', status: 'todo' },
      { id: 't4', status: 'completed' },
    ]
    const grouped = groupTasksByStatus(tasks)
    expect(grouped.in_progress.map((task) => task.id)).toEqual(['t1', 't2'])
    expect(grouped.todo.map((task) => task.id)).toEqual(['t3'])
    expect(grouped.completed.map((task) => task.id)).toEqual(['t4'])
    expect(grouped.cancelled).toBeUndefined()
  })
})

describe('ProjectBoard buildProjectTaskQuery', () => {
  it('always fixes project_id to the current Project', () => {
    const params = buildProjectTaskQuery({ projectId: '6a996e90a1cf3f4b658c012d' })
    expect(params.project_id).toBe('6a996e90a1cf3f4b658c012d')
  })

  it('sends the active lifecycle tab to the backend as status_filter', () => {
    const params = buildProjectTaskQuery({ taskStatus: 'in_progress', projectId: 'p1' })
    expect(params.status).toBe('in_progress')
  })

  it('omits status_filter when All Tasks is active', () => {
    const params = buildProjectTaskQuery({ taskStatus: '', projectId: 'p1' })
    expect(params.status).toBeUndefined()
  })

  it('combines lifecycle tab, attention condition, and advanced filters', () => {
    const params = buildProjectTaskQuery({
      filters: { priority: 'high', assigned_to: 'u1' },
      taskStatus: 'in_progress',
      attention: 'blocked',
      search: 'homepage',
      projectId: 'p1',
    })
    expect(params.status).toBe('in_progress')
    expect(params.blocked).toBe(true)
    expect(params.priority).toBe('high')
    expect(params.assigned_to).toBe('u1')
    expect(params.search).toBe('homepage')
    expect(params.project_id).toBe('p1')
  })
})
