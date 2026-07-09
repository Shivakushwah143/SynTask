import { describe, expect, test } from 'vitest'
import { buildBriefingChartData } from './aiBriefingData'

describe('ai briefing chart data', () => {
  test('colors each status bar by the highest priority task in that status', () => {
    const data = buildBriefingChartData([
      { status: 'todo', priority: 'low' },
      { status: 'todo', priority: 'critical' },
      { status: 'in_progress', priority: 'medium' },
      { status: 'completed', priority: 'high' },
    ])

    expect(data).toEqual([
      expect.objectContaining({ label: 'todo', value: 2, priority: 'Critical', color: '#991B1B' }),
      expect.objectContaining({ label: 'in_progress', value: 1, priority: 'Medium', color: '#F59E0B' }),
      expect.objectContaining({ label: 'completed', value: 1, priority: 'High', color: '#EF4444' }),
    ])
  })
})
