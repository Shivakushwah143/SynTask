import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import AnswerBlocks, { AnswerBlock, friendlyToolLabel, severityColorKey } from './AnswerBlocks'

describe('AnswerBlocks renderers', () => {
  test('renders a count block as a KPI headline', () => {
    render(<AnswerBlock block={{ type: 'count', title: 'Overdue tasks', value: 8 }} />)
    expect(screen.getByText('Overdue tasks')).toBeInTheDocument()
    expect(screen.getByTestId('block-count-value').textContent).toBe('8')
  })

  test('renders a summary block as a fact grid', () => {
    render(<AnswerBlock block={{ type: 'summary', title: 'Company', facts: [{ label: 'Projects', value: 3 }, { label: 'Tasks', value: 30 }] }} />)
    const facts = screen.getAllByTestId('block-summary-fact')
    expect(facts).toHaveLength(2)
    expect(facts[0].textContent).toContain('Projects')
    expect(facts[0].textContent).toContain('3')
  })

  test('renders a list block with string and record items', () => {
    render(<AnswerBlock block={{ type: 'list', title: 'Employees', items: ['Riya Jain', { Name: 'Gaurav Sharma', Status: 'Active' }] }} />)
    const items = screen.getAllByTestId('block-list-item')
    expect(items).toHaveLength(2)
    expect(items[1].textContent).toContain('Gaurav Sharma')
  })

  test('renders a table block without leaking raw markdown pipes', () => {
    const { container } = render(
      <AnswerBlock block={{
        type: 'table',
        title: 'Team workload',
        columns: ['Name', 'Tasks', 'Overdue'],
        rows: [['Riya Jain', 12, 3], ['Gaurav Sharma', 7, 0]],
      }} />,
    )
    const rows = container.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('Riya Jain')
    expect(container.textContent).not.toContain('|')
  })

  test('renders detail fields', () => {
    render(<AnswerBlock block={{ type: 'detail', title: 'Client 360', fields: [{ label: 'Name', value: 'Orchid Labs' }, { label: 'Status', value: 'active' }] }} />)
    expect(screen.getByTestId('block-detail').textContent).toContain('Orchid Labs')
  })

  test('renders risk items with severity badges and actions', () => {
    render(
      <AnswerBlock block={{
        type: 'risk',
        title: 'Attention items',
        items: [{ priority: 'HIGH', title: 'Overdue tasks', detail: '12 tasks past due', action: 'Reassign' }],
      }} />,
    )
    const card = screen.getByTestId('block-risk-item')
    expect(card.textContent).toContain('Overdue tasks')
    expect(card.textContent).toContain('Reassign')
    expect(card.textContent).toContain('HIGH')
  })

  test('drops Mongo ObjectIds from display values', () => {
    const oid = '5f8f9a2b3c4d5e6f7a8b9c0d'
    render(<AnswerBlock block={{ type: 'detail', title: 'Record', fields: [{ label: 'Id', value: oid }, { label: 'Name', value: 'Alpha' }] }} />)
    expect(screen.getByTestId('block-detail').textContent).not.toContain(oid)
    expect(screen.getByTestId('block-detail').textContent).toContain('Alpha')
  })

  test('renders nothing for empty or unknown blocks', () => {
    const { container } = render(<AnswerBlocks blocks={[]} />)
    expect(container).toBeEmptyDOMElement()
    render(<AnswerBlock block={{ type: 'mystery', title: 'X' }} />)
    expect(screen.queryByText('X')).toBeNull()
  })
})

describe('helpers', () => {
  test('maps internal tool names to friendly labels', () => {
    expect(friendlyToolLabel('get_overdue_invoices')).toBe('Overdue invoices')
    expect(friendlyToolLabel('list_tasks')).toBe('Tasks')
    expect(friendlyToolLabel('weird_tool_name')).toBe('Weird Tool Name')
    expect(friendlyToolLabel('')).toBe('Company data')
  })

  test('maps severities to badge color keys', () => {
    expect(severityColorKey('CRITICAL')).toBe('critical')
    expect(severityColorKey('high')).toBe('critical')
    expect(severityColorKey('medium')).toBe('medium')
    expect(severityColorKey('low')).toBe('low')
    expect(severityColorKey('info')).toBe('draft')
  })
})
