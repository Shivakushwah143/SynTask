import { describe, expect, test } from 'vitest'
import {
  ATTENTION_FILTERS,
  ATTENTION_TO_QUERY,
  BOARD_STATUSES,
  LIFECYCLE_TABS,
  STATUS_LABELS,
  activeFilterCount,
  attentionCount,
  buildTaskQueryParams,
  emptyStateMessage,
  projectEmptyStateMessage,
  tabCount,
} from './tasksLifecycle'

describe('task lifecycle tabs', () => {
  test('covers every backend TaskStatus exactly once plus All Tasks', () => {
    const tabIds = LIFECYCLE_TABS.map((tab) => tab.id)
    expect(tabIds).toEqual([
      '',
      'todo',
      'assigned',
      'in_progress',
      'in_review',
      'revision_required',
      'approved',
      'completed',
      'cancelled',
    ])
  })

  test('scheduled is not a lifecycle tab', () => {
    expect(LIFECYCLE_TABS.some((tab) => tab.id === 'scheduled')).toBe(false)
  })

  test('board columns are the active lifecycle states without cancelled', () => {
    expect(BOARD_STATUSES.map((column) => column.id)).toEqual([
      'todo',
      'assigned',
      'in_progress',
      'in_review',
      'revision_required',
      'approved',
      'completed',
    ])
  })

  test('attention filters are separate from lifecycle statuses', () => {
    expect(ATTENTION_FILTERS.map((item) => item.id)).toEqual(['blocked', 'overdue', 'due_today', 'critical'])
    expect(ATTENTION_TO_QUERY).toEqual({
      blocked: { blocked: true },
      overdue: { overdue: true },
      due_today: { due_today: true },
      critical: { critical: true },
    })
  })

  test('each attention view has its own distinct appearance', () => {
    const activeClasses = ATTENTION_FILTERS.map((item) => item.activeClass)
    const idleClasses = ATTENTION_FILTERS.map((item) => item.idleClass)
    // Every condition must look different from the others (its own accent)
    expect(new Set(activeClasses).size).toBe(ATTENTION_FILTERS.length)
    expect(new Set(idleClasses).size).toBe(ATTENTION_FILTERS.length)
    ATTENTION_FILTERS.forEach((item) => {
      expect(item.dotClass).toBeTruthy()
      expect(item.activeClass).toBeTruthy()
      expect(item.idleClass).toBeTruthy()
    })
  })
})

describe('tabCount and attentionCount', () => {
  const summary = {
    all: 126,
    todo: 18,
    assigned: 22,
    in_progress: 31,
    in_review: 9,
    revision_required: 4,
    approved: 6,
    completed: 34,
    cancelled: 2,
    blocked: 5,
    overdue: 8,
    due_today: 7,
    critical: 3,
  }

  test('all tab uses the summary all count', () => {
    expect(tabCount(summary, '')).toBe(126)
  })

  test('lifecycle tabs use their backend status counts', () => {
    expect(tabCount(summary, 'todo')).toBe(18)
    expect(tabCount(summary, 'cancelled')).toBe(2)
  })

  test('attention chips use their backend attention counts', () => {
    expect(attentionCount(summary, 'blocked')).toBe(5)
    expect(attentionCount(summary, 'critical')).toBe(3)
  })

  test('missing summary or key falls back to zero', () => {
    expect(tabCount(null, 'todo')).toBe(0)
    expect(tabCount(summary, 'unknown')).toBe(0)
    expect(attentionCount(null, 'blocked')).toBe(0)
  })
})

describe('buildTaskQueryParams', () => {
  test('maps lifecycle status, attention, advanced filters, search, and pagination', () => {
    const params = buildTaskQueryParams({
      filters: {
        status: 'in_progress',
        priority: 'high',
        assigned_to: 'u1',
        department_id: 'd1',
        project_id: 'PROJ-001',
        due_from: '2026-07-01',
        due_to: '2026-07-31',
      },
      attention: 'blocked',
      search: 'website',
      page: 2,
      pageSize: 20,
    })

    expect(params).toEqual({
      status: 'in_progress',
      priority: 'high',
      assigned_to: 'u1',
      department_id: 'd1',
      project_id: 'PROJ-001',
      due_from: '2026-07-01',
      due_to: '2026-07-31',
      blocked: true,
      exclude_follow_up: true,
      search: 'website',
      skip: 20,
      limit: 20,
    })
  })

  test('status and attention combine without replacing each other', () => {
    const params = buildTaskQueryParams({ filters: { status: 'in_review' }, attention: 'overdue', page: 1, pageSize: 20 })
    expect(params.status).toBe('in_review')
    expect(params.overdue).toBe(true)
  })

  test('omits empty values and always excludes follow-ups and paginates', () => {
    const params = buildTaskQueryParams({ filters: {}, attention: '', search: '', page: 1, pageSize: 20 })
    expect(params).toEqual({ exclude_follow_up: true, skip: 0, limit: 20 })
  })
})

describe('empty state messages', () => {
  test('no filters shows the generic empty state', () => {
    expect(emptyStateMessage({ filters: {}, attention: '', search: '' })).toBe('No tasks yet. Create your first task to get started.')
  })

  test('status tab alone names the lifecycle status', () => {
    expect(emptyStateMessage({ filters: { status: 'revision_required' }, attention: '', search: '' }))
      .toBe('No Tasks are currently in Revision Required.')
  })

  test('attention filter gets a dedicated message', () => {
    expect(emptyStateMessage({ filters: {}, attention: 'blocked', search: '' }))
      .toBe('No tasks match the Blocked attention filter.')
  })

  test('combined filters fall back to the generic filtered message', () => {
    expect(emptyStateMessage({ filters: { status: 'in_progress', priority: 'high' }, attention: '', search: 'api' }))
      .toBe('No Tasks match the selected filters.')
  })
})

describe('project empty state messages', () => {
  test('zero-task project names the project context', () => {
    expect(projectEmptyStateMessage({ filters: {}, attention: '', search: '' }))
      .toBe('No Tasks have been created for this Project yet.')
  })

  test('status tab alone names the lifecycle status', () => {
    expect(projectEmptyStateMessage({ filters: { status: 'revision_required' }, attention: '', search: '' }))
      .toBe('No Tasks are currently in Revision Required.')
  })

  test('attention filter gets a project-flavored message', () => {
    expect(projectEmptyStateMessage({ filters: {}, attention: 'blocked', search: '' }))
      .toBe('No Project Tasks are currently blocked.')
  })

  test('combined filters fall back to the project filtered message', () => {
    expect(projectEmptyStateMessage({ filters: { status: 'in_progress', priority: 'high' }, attention: '', search: 'api' }))
      .toBe('No Tasks match the selected filters for this Project.')
  })
})

describe('activeFilterCount', () => {
  test('counts status, attention, advanced filters, and search independently', () => {
    expect(activeFilterCount({ status: 'todo' }, '', '')).toBe(1)
    expect(activeFilterCount({}, 'blocked', 'api')).toBe(2)
    expect(activeFilterCount({ status: 'todo', priority: 'high', assigned_to: 'u1', department_id: 'd1', project_id: 'P1', due_from: '2026-07-01' }, 'overdue', '')).toBe(7)
    expect(activeFilterCount({}, '', '')).toBe(0)
  })

  test('a due range counts once', () => {
    expect(activeFilterCount({ due_from: '2026-07-01', due_to: '2026-07-31' }, '', '')).toBe(1)
  })
})

test('STATUS_LABELS matches the tab labels', () => {
  expect(STATUS_LABELS).toEqual({
    todo: 'To Do',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    in_review: 'In Review',
    revision_required: 'Revision Required',
    approved: 'Approved',
    completed: 'Completed',
    cancelled: 'Cancelled',
  })
})