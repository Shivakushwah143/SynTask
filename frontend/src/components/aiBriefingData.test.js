import { describe, expect, test } from 'vitest'
import { buildBriefingChartData } from './aiBriefingData'
import { buildBriefing, buildSuggestions } from './AIBriefingCenter'

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

  test('does not invent admin project counts when stats are missing', () => {
    const briefing = buildBriefing({
      user: { first_name: 'Ava', role: 'admin' },
      stats: { role: 'admin' },
      recentTasks: [],
      recentTickets: [],
    })

    expect(briefing.metrics).toEqual([
      expect.objectContaining({ label: 'Projects', value: 0 }),
      expect.objectContaining({ label: 'Healthy', value: 0 }),
      expect.objectContaining({ label: 'At Risk', value: 0 }),
      expect.objectContaining({ label: 'Critical Issues', value: 0 }),
    ])
  })

  test('uses honest empty employee briefing instead of fake priority tasks and hours', () => {
    const briefing = buildBriefing({
      user: { first_name: 'Ava', role: 'employee' },
      stats: { role: 'employee' },
      recentTasks: [],
      recentTickets: [],
    })

    expect(briefing.metrics).toContainEqual(expect.objectContaining({ label: 'Estimated Work', value: '0h' }))
    expect(briefing.sections[0].items).toEqual(['No active tasks found in your current dashboard data'])
  })

  test('builds stable suggestion from real dashboard counts', () => {
    const suggestions = buildSuggestions({
      stats: { total_tasks: 3, total_tickets: 2 },
      recentTasks: [
        { id: 1, title: 'Plan launch', status: 'todo', priority: 'medium' },
        { id: 2, title: 'QA release', status: 'in_progress', priority: 'medium' },
        { id: 3, title: 'Archive notes', status: 'completed', priority: 'low' },
      ],
      recentTickets: [
        { id: 1, title: 'Billing request', status: 'closed' },
        { id: 2, title: 'Access question', status: 'resolved' },
      ],
    })

    expect(suggestions[0]).toEqual(expect.objectContaining({
      title: '2 active tasks, 0 open requests',
      detail: '3 tasks and 2 requests are visible in current dashboard data.',
    }))
  })

  test('uses current empty counts in no-task suggestion', () => {
    const suggestions = buildSuggestions({
      stats: { total_tasks: 0, total_tickets: 2 },
      recentTasks: [],
      recentTickets: [
        { id: 1, title: 'Closed request', status: 'closed' },
        { id: 2, title: 'Resolved request', status: 'resolved' },
      ],
    })

    expect(suggestions[0]).toEqual(expect.objectContaining({
      title: '0 tasks visible',
      detail: '2 requests are visible, but no active tasks were returned for this dashboard view.',
    }))
  })
})
