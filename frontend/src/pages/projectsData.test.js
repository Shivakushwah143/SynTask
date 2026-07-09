import { describe, expect, test } from 'vitest'
import { buildProjectGraphRows, buildProjectGraphSummary } from './projectsData'

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
})
