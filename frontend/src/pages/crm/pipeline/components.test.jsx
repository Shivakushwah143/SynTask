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
  it('renders a compact lead list where the title opens the lead and only essential actions remain', () => {
    const onLeadSelect = vi.fn()
    const onMoveLeadToStage = vi.fn()

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
        onResetFilters={vi.fn()}
      />,
    )

    expect(screen.getByRole('columnheader', { name: /^Lead$/i })).toBeTruthy()
    expect(screen.getByText('Acme Pvt Ltd')).toBeTruthy()
    expect(screen.getByText('Beta Labs')).toBeTruthy()

    // Compact redesign: the lead title itself opens the lead, and the only
    // redundant helper buttons (Open lead / Copy ID) are gone.
    expect(screen.queryByRole('button', { name: /^Open lead$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Copy ID$/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Open Acme Pvt Ltd$/i }))
    expect(onLeadSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'lead-1' }))

    fireEvent.click(screen.getAllByRole('button', { name: /Move to Discovery/i })[0])
    expect(onMoveLeadToStage).toHaveBeenCalledWith(expect.objectContaining({ id: 'lead-1' }), 'discovery')
  })

  it('resolves the Owner column from the users list by assigned id, never a stale serialized name', () => {
    // The board cards already resolve owners via the live users list; the table
    // must do the same so a stale owner_name (or an id-shaped value) can never
    // surface as wrong Owner detail.
    render(
      <PipelineStageListView
        stage={{ key: 'acquire', name: 'Acquire', nextStageKey: 'qualify' }}
        stages={[
          { key: 'acquire', name: 'Acquire', nextStageKey: 'qualify' },
          { key: 'qualify', name: 'Qualify' },
        ]}
        users={[{ id: 'user-9', first_name: 'Riya', last_name: 'Shah' }]}
        leads={[
          { id: 'lead-1', company_name: 'Acme Pvt Ltd', assigned_to: 'user-9', owner_name: 'Stale Legacy Name' },
        ]}
        onLeadSelect={vi.fn()}
        onMoveLeadToStage={vi.fn()}
        onResetFilters={vi.fn()}
      />,
    )
    expect(screen.getByText('Riya Shah')).toBeTruthy()
    expect(screen.queryByText('Stale Legacy Name')).toBeNull()
  })

  it('shows Assigned as the inner status for an owned Acquire lead', () => {
    // The backend serializes current_stage_status as "assigned" for owned
    // Acquire leads (creation, import, reassignment and read-time resolution);
    // the stage list Status column must surface that value in the select.
    render(
      <PipelineStageListView
        stage={{ key: 'acquire', name: 'Acquire', nextStageKey: 'qualify' }}
        stages={[
          { key: 'acquire', name: 'Acquire', nextStageKey: 'qualify' },
          { key: 'qualify', name: 'Qualify' },
        ]}
        users={[{ id: 'user-9', first_name: 'Riya', last_name: 'Shah' }]}
        leads={[
          { id: 'lead-1', company_name: 'Acme Pvt Ltd', assigned_to: 'user-9', current_stage_status: 'assigned' },
        ]}
        onLeadSelect={vi.fn()}
        onMoveLeadToStage={vi.fn()}
        onResetFilters={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Update inner status').value).toBe('assigned')
  })
})
