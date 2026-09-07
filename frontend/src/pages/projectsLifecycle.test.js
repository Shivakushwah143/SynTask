import { describe, expect, it } from 'vitest'
import {
  PROJECT_HEALTH_FILTERS,
  PROJECT_LIFECYCLE_TABS,
  PROJECT_STATUS_LABELS,
  activeProjectFilterCount,
  buildProjectQueryParams,
  emptyProjectsStateMessage,
  healthFilterCount,
  patchProjectsRoute,
  readProjectsRouteState,
  tabCount,
  writeProjectsRouteState,
} from './projectsLifecycle'

describe('project lifecycle tabs', () => {
  it('has All + the eight lifecycle tabs and never Kickoff or Client Review', () => {
    const ids = PROJECT_LIFECYCLE_TABS.map((tab) => tab.id)
    expect(ids).toEqual([
      '',
      'created',
      'execution',
      'review',
      'completed',
      'reporting',
      'on_hold',
      'archived',
      'cancelled',
    ])
    expect(ids).not.toContain('kickoff')
    expect(ids).not.toContain('client_review')
    expect(PROJECT_STATUS_LABELS.execution).toBe('Execution')
  })

  it('keeps health and needs_setup as secondary filters, never lifecycle', () => {
    const kinds = PROJECT_HEALTH_FILTERS.map((item) => item.kind)
    expect(kinds).toEqual(['health', 'health', 'health', 'attention'])
    expect(PROJECT_LIFECYCLE_TABS.some((tab) => tab.id === 'healthy')).toBe(false)
    expect(PROJECT_LIFECYCLE_TABS.some((tab) => tab.id === 'needs_setup')).toBe(false)
  })
})

describe('tab/health counts', () => {
  const summary = { all: 31, created: 6, execution: 12, healthy: 18, needs_attention: 5, at_risk: 3, needs_setup: 4 }

  it('reads lifecycle and all counts from the summary payload', () => {
    expect(tabCount(summary, '')).toBe(31)
    expect(tabCount(summary, 'created')).toBe(6)
    expect(tabCount(summary, 'execution')).toBe(12)
    expect(tabCount(null, 'created')).toBe(0)
  })

  it('reads health and needs_setup counts', () => {
    expect(healthFilterCount(summary, { id: 'healthy' })).toBe(18)
    expect(healthFilterCount(summary, { id: 'at_risk' })).toBe(3)
    expect(healthFilterCount(summary, { id: 'needs_setup' })).toBe(4)
    expect(healthFilterCount(null, { id: 'at_risk' })).toBe(0)
  })
})

describe('URL state round-trip', () => {
  it('reads defaults when no params exist', () => {
    const route = readProjectsRouteState(new URLSearchParams(''))
    expect(route).toEqual({
      status: '',
      health: '',
      attention: '',
      view: 'list',
      search: '',
      page: 1,
      filters: { client_id: '', owner_id: '', priority: '', type: '', delivery: '' },
    })
  })

  it('reads lifecycle + health + attention + view + filters from the URL', () => {
    const params = new URLSearchParams(
      'status=execution&health=at_risk&view=board&q=Website&page=3&client_id=c-1&owner_id=u-1&priority=high&type=software&delivery=next_7_days',
    )
    const route = readProjectsRouteState(params)
    expect(route.status).toBe('execution')
    expect(route.health).toBe('at_risk')
    expect(route.view).toBe('board')
    expect(route.search).toBe('Website')
    expect(route.page).toBe(3)
    expect(route.filters).toEqual({
      client_id: 'c-1',
      owner_id: 'u-1',
      priority: 'high',
      type: 'software',
      delivery: 'next_7_days',
    })
  })

  it('supports attention=needs_setup and rejects unknown attention values', () => {
    expect(readProjectsRouteState(new URLSearchParams('attention=needs_setup')).attention).toBe('needs_setup')
    expect(readProjectsRouteState(new URLSearchParams('attention=blocked')).attention).toBe('')
  })

  it('falls back to list view for unknown view values', () => {
    expect(readProjectsRouteState(new URLSearchParams('view=calendar')).view).toBe('list')
  })

  it('write -> read round-trips a full route', () => {
    const written = writeProjectsRouteState(new URLSearchParams(''), {
      status: 'review',
      health: '',
      attention: 'needs_setup',
      view: 'board',
      search: 'Acme',
      page: 2,
      filters: { client_id: 'c-9', owner_id: '', priority: 'critical', type: '', delivery: 'overdue' },
    })
    const route = readProjectsRouteState(written)
    expect(route.status).toBe('review')
    expect(route.attention).toBe('needs_setup')
    expect(route.view).toBe('board')
    expect(route.search).toBe('Acme')
    expect(route.page).toBe(2)
    expect(route.filters.client_id).toBe('c-9')
    expect(route.filters.priority).toBe('critical')
    expect(route.filters.delivery).toBe('overdue')
    expect(written.get('health')).toBeNull()
    expect(written.get('owner_id')).toBeNull()
    expect(written.get('type')).toBeNull()
  })

  it('patches preserve unrelated params', () => {
    const { nextParams } = patchProjectsRoute(
      new URLSearchParams('view=board&priority=critical'),
      { status: 'execution', filters: { owner_id: 'u-5' } },
    )
    expect(nextParams.get('view')).toBe('board')
    expect(nextParams.get('priority')).toBe('critical')
    expect(nextParams.get('status')).toBe('execution')
    expect(nextParams.get('owner_id')).toBe('u-5')
  })
})

describe('server query params', () => {
  it('builds lifecycle/health/attention and advanced filters for the API', () => {
    const params = buildProjectQueryParams({
      status: 'execution',
      health: 'at_risk',
      search: 'web',
      filters: { client_id: 'c-1', owner_id: 'u-1', priority: 'high', type: 'software', delivery: 'next_7_days' },
      page: 2,
      pageSize: 12,
    })
    expect(params).toEqual({
      status: 'execution',
      health: 'at_risk',
      client_id: 'c-1',
      owner_id: 'u-1',
      priority: 'high',
      type: 'software',
      delivery: 'next_7_days',
      search: 'web',
      skip: 12,
      limit: 12,
    })
  })

  it('sends attention only for needs_setup and never mixes with health', () => {
    expect(buildProjectQueryParams({ attention: 'needs_setup' }).attention).toBe('needs_setup')
    expect(buildProjectQueryParams({ attention: 'needs_setup' }).health).toBeUndefined()
    expect(buildProjectQueryParams({}).attention).toBeUndefined()
  })

  it('omits empty filters so the server default scope applies', () => {
    const params = buildProjectQueryParams({})
    expect(Object.keys(params)).toEqual(['skip', 'limit'])
  })
})

describe('empty-state copy', () => {
  it('says all projects have an execution plan for needs_setup', () => {
    expect(emptyProjectsStateMessage({ attention: 'needs_setup' })).toBe('All Projects have an execution plan.')
  })

  it('uses lifecycle-specific copy when only the status tab is active', () => {
    expect(emptyProjectsStateMessage({ status: 'created' })).toBe('No Projects are currently in Created.')
  })

  it('uses health copy and generic copy otherwise', () => {
    expect(emptyProjectsStateMessage({ health: 'at_risk' })).toBe('No accessible Projects are currently At Risk.')
    expect(emptyProjectsStateMessage({ filters: { priority: 'high' } })).toBe('No Projects match the selected filters.')
    expect(emptyProjectsStateMessage({})).toBe('No Projects yet. Create your first project to get started.')
  })

  it('counts active filters', () => {
    expect(activeProjectFilterCount({})).toBe(0)
    expect(activeProjectFilterCount({ status: 'execution', health: 'at_risk', search: 'x', filters: { client_id: 'c-1' } })).toBe(4)
  })
})
