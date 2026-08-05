import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PipelineStageListView, pipelineLeadCardClassNames } from './components'

describe('pipeline lead card styles', () => {
  it('uses roomy, readable action controls in narrow columns', () => {
    expect(pipelineLeadCardClassNames.column).toContain('w-[300px]')
    expect(pipelineLeadCardClassNames.actions).toContain('flex-col')
    expect(pipelineLeadCardClassNames.nextButton).toContain('min-h-10')
    expect(pipelineLeadCardClassNames.actionButton).toContain('min-h-10')
  })
})

describe('pipeline stage list view', () => {
  it('renders a full-page lead list with row actions for stage routes', () => {
    const onLeadSelect = vi.fn()
    const onMoveLeadToStage = vi.fn()
    const onCopyLeadId = vi.fn()

    render(
      <PipelineStageListView
        stage={{ key: 'qualified', name: 'Qualified', nextStageKey: 'discovery', previousStageKey: 'contacted' }}
        stages={[
          { key: 'contacted', name: 'Contacted' },
          { key: 'qualified', name: 'Qualified', nextStageKey: 'discovery', previousStageKey: 'contacted' },
          { key: 'discovery', name: 'Discovery' },
        ]}
        leads={[
          {
            id: 'lead-1',
            company_name: 'Acme Pvt Ltd',
            email: 'acme@example.com',
            phone: '9876543210',
            priority: 'high',
            deal_value: 250000,
            created_at: '2026-06-20T00:00:00.000Z',
          },
          {
            id: 'lead-2',
            company_name: 'Beta Labs',
            email: 'beta@example.com',
            phone: '9123456780',
            priority: 'medium',
            deal_value: 50000,
            created_at: '2026-06-21T00:00:00.000Z',
          },
        ]}
        currency="INR"
        onLeadSelect={onLeadSelect}
        onMoveLeadToStage={onMoveLeadToStage}
        onCopyLeadId={onCopyLeadId}
        onResetFilters={vi.fn()}
      />,
    )

    expect(screen.getByRole('columnheader', { name: /^Lead$/i })).toBeTruthy()
    expect(screen.getByText('Acme Pvt Ltd')).toBeTruthy()
    expect(screen.getByText('Beta Labs')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Open lead$/i })).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: /Move to Discovery/i })[0])
    expect(onMoveLeadToStage).toHaveBeenCalledWith(expect.objectContaining({ id: 'lead-1' }), 'discovery')

    fireEvent.click(screen.getAllByRole('button', { name: /^Copy ID$/i })[0])
    expect(onCopyLeadId).toHaveBeenCalledWith(expect.objectContaining({ id: 'lead-1' }))

    fireEvent.click(screen.getAllByRole('button', { name: /^Open lead$/i })[0])
    expect(onLeadSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'lead-1' }))
  })
})
