import { describe, expect, test } from 'vitest'
import { readTaskRouteState, writeTaskRouteState } from './tasksRouteState'

describe('task route state helpers', () => {
  test('reads task view, search, and filters from url params', () => {
    const params = new URLSearchParams('view=board&q=api&status=in_progress&priority=high&assigned_to=u1&department_id=d1&due_from=2026-07-01&due_to=2026-07-31')

    expect(readTaskRouteState(params)).toEqual({
      view: 'board',
      searchQuery: 'api',
      filters: {
        status: 'in_progress',
        priority: 'high',
        assigned_to: 'u1',
        department_id: 'd1',
        due_from: '2026-07-01',
        due_to: '2026-07-31',
      },
    })
  })

  test('writes task view and clears empty filters', () => {
    const params = writeTaskRouteState(new URLSearchParams('page=2'), {
      view: 'list',
      searchQuery: '',
      filters: { status: '', priority: 'critical', assigned_to: '', department_id: '', due_from: '', due_to: '' },
    })

    expect(params.get('page')).toBe('2')
    expect(params.get('view')).toBe('list')
    expect(params.get('priority')).toBe('critical')
    expect(params.get('status')).toBeNull()
    expect(params.get('q')).toBeNull()
  })
})
