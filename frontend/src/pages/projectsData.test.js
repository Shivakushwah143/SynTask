import { describe, expect, test } from 'vitest'
import {
  buildProjectGraphRows,
  buildProjectGraphSummary,
  filterProjects,
  getProjectGridPageSize,
  getVisibleProjectCountForGrid,
} from './projectsData'

describe('projects graph data helpers', () => {
  test('builds progress rows from project task counts', () => {
    const rows = buildProjectGraphRows([
      { id: 'p1', name: 'Alpha Website', assigned_to_name: 'John Smith', task_count: 10, completed_task_count: 6 },
      { id: 'p2', name: 'Beta App', lead_name: 'Jane Doe', progress_percentage: 80, task_count: 5 },
    ])

    expect(rows).toEqual([
      expect.objectContaining({ id: 'p1', name: 'Alpha Website', owner: 'John Smith', progress: 60, totalTasks: 10, completedTasks: 6 }),
      expect.objectContaining({ id: 'p2', name: 'Beta App', owner: 'Jane Doe', progress: 80, totalTasks: 5, completedTasks: 4 }),
    ])
  })

  test('summarizes project workload for the graph header', () => {
    const summary = buildProjectGraphSummary([
      { task_count: 10, completed_task_count: 6 },
      { task_count: 5, completed_task_count: 4 },
    ])

    expect(summary).toEqual({ totalTasks: 15, remainingTasks: 5 })
  })

  test('limits project graph rows when a display count is provided', () => {
    const projects = Array.from({ length: 12 }, (_, index) => ({ id: `p${index}`, name: `Project ${index}` }))

    expect(buildProjectGraphRows(projects, 10)).toHaveLength(10)
  })

  test('shows manager and lead names in project graph owner line', () => {
    const rows = buildProjectGraphRows([{
      id: 'p1',
      name: 'Alpha Website',
      assigned_users: [
        { id: 'manager-1', name: 'Maya Manager', role: 'manager' },
        { id: 'lead-1', name: 'Leena Lead', role: 'lead' },
      ],
      task_count: 2,
    }])

    expect(rows[0].owner).toBe('Manager: Maya Manager / Lead: Leena Lead')
  })

  test('filters the full project dataset before visible rows are selected', () => {
    const projects = Array.from({ length: 14 }, (_, index) => ({
      id: `p${index}`,
      name: index === 12 ? 'Needle Migration' : `Project ${index}`,
      key: `P${index}`,
      status: index === 12 ? 'completed' : 'active',
      type: index === 12 ? 'operations' : 'software',
    }))

    const filtered = filterProjects(projects, {
      searchQuery: 'needle',
      filters: { status: 'completed', type: 'operations', owner: '' },
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('p12')
  })

  test('uses grid-aware page sizes that complete rows', () => {
    expect(getProjectGridPageSize(3)).toBe(12)
    expect(getProjectGridPageSize(2)).toBe(10)
    expect(getProjectGridPageSize(1)).toBe(6)
  })

  test('keeps visible count aligned to grid rows after load more and filtering', () => {
    expect(getVisibleProjectCountForGrid({ columns: 3, page: 1, total: 30 })).toBe(12)
    expect(getVisibleProjectCountForGrid({ columns: 3, page: 2, total: 30 })).toBe(24)
    expect(getVisibleProjectCountForGrid({ columns: 2, page: 1, total: 30 })).toBe(10)
    expect(getVisibleProjectCountForGrid({ columns: 2, page: 2, total: 30 })).toBe(20)
    expect(getVisibleProjectCountForGrid({ columns: 3, page: 2, total: 19 })).toBe(19)
  })
})
