import { describe, expect, test } from 'vitest'
import { readTaskRouteState, writeTaskRouteState } from './tasksRouteState'

describe('task route state helpers', () => {
  test('reads task view, search, filters, and attention from url params', () => {
    const params = new URLSearchParams('view=board&q=api&status=in_progress&priority=high&assigned_to=u1&department_id=d1&project_id=PROJ-001&due_from=2026-07-01&due_to=2026-07-31&attention=blocked')

    expect(readTaskRouteState(params)).toEqual({
      view: 'board',
      searchQuery: 'api',
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
    })
  })

  test('reads legacy status_filter deep links as the canonical status param', () => {
    const params = new URLSearchParams('status_filter=revision_required&attention=overdue')

    const state = readTaskRouteState(params)

    expect(state.filters.status).toBe('revision_required')
    expect(state.attention).toBe('overdue')
  })

  test('canonical status wins over the legacy status_filter alias', () => {
    const params = new URLSearchParams('status=in_review&status_filter=todo')

    expect(readTaskRouteState(params).filters.status).toBe('in_review')
  })

  test('ignores unknown attention values', () => {
    const params = new URLSearchParams('attention=urgent')

    expect(readTaskRouteState(params).attention).toBe('')
  })

  test('writes task view, attention, and clears empty filters', () => {
    const params = writeTaskRouteState(new URLSearchParams('page=2'), {
      view: 'list',
      searchQuery: '',
      attention: 'due_today',
      filters: { status: '', priority: 'critical', assigned_to: '', department_id: '', project_id: '', due_from: '', due_to: '' },
    })

    expect(params.get('page')).toBe('2')
    expect(params.get('view')).toBe('list')
    expect(params.get('attention')).toBe('due_today')
    expect(params.get('priority')).toBe('critical')
    expect(params.get('status')).toBeNull()
    expect(params.get('q')).toBeNull()
  })

  test('clears attention when no attention is active', () => {
    const params = writeTaskRouteState(new URLSearchParams('attention=blocked'), {
      view: 'list',
      searchQuery: '',
      attention: '',
      filters: { status: '' },
    })

    expect(params.get('attention')).toBeNull()
  })
})