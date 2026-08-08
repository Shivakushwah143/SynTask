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
    // The new separate columns: company, mobile and email each get their own header.
    expect(screen.getByRole('columnheader', { name: /^Company$/i })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: /^Mobile$/i })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: /^Email$/i })).toBeTruthy()

    // Company appears in its own column (and as the fallback lead title here,
    // since these fixtures have no contact name), so it may match twice.
    expect(screen.getAllByText('Acme Pvt Ltd').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Beta Labs').length).toBeGreaterThan(0)
    // Mobile and email render in their dedicated columns.
    expect(screen.getByText('9876543210')).toBeTruthy()
    expect(screen.getByText('9123456780')).toBeTruthy()
    expect(screen.getByText('acme@example.com')).toBeTruthy()
    expect(screen.getByText('beta@example.com')).toBeTruthy()

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

  it('supports multi-select and bulk assigns the chosen leads to a user', async () => {
    // Reported feedback: the Acquire stage needs a multi-select so bulk leads
    // can be assigned to anyone at once.
    const onBulkAssign = vi.fn(() => Promise.resolve())
    render(
      <PipelineStageListView
        stage={{ key: 'acquire', name: 'Acquire', nextStageKey: 'qualify' }}
        stages={[
          { key: 'acquire', name: 'Acquire', nextStageKey: 'qualify' },
          { key: 'qualify', name: 'Qualify' },
        ]}
        users={[{ id: 'user-9', first_name: 'Riya', last_name: 'Shah' }]}
        leads={[
          { id: 'lead-1', company_name: 'Acme Pvt Ltd' },
          { id: 'lead-2', company_name: 'Beta Labs' },
        ]}
        onLeadSelect={vi.fn()}
        onMoveLeadToStage={vi.fn()}
        onResetFilters={vi.fn()}
        onBulkAssign={onBulkAssign}
      />,
    )

    // No bulk bar until leads are selected.
    expect(screen.queryByText(/selected/)).toBeNull()

    // Select both rows via the header select-all checkbox.
    fireEvent.click(screen.getByLabelText('Select all leads'))
    expect(screen.getByText('2 selected')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Assign selected leads to'), { target: { value: 'user-9' } })
    fireEvent.click(screen.getByRole('button', { name: /^Assign$/i }))

    expect(onBulkAssign).toHaveBeenCalledWith(['lead-1', 'lead-2'], 'user-9')
  })

  it('keeps the lead in its row with an in-flight indicator while the move request is pending', () => {
    // Reported feedback: the lead must NOT appear moved until the backend
    // confirms. While the move is in flight (movingLeadId set) the row stays in
    // the current stage and the button shows a loading state, so a failed
    // request never makes the lead visibly jump stages and snap back.
    render(
      <PipelineStageListView
        stage={{ key: 'qualify', name: 'Qualify', nextStageKey: 'discovery' }}
        stages={[
          { key: 'qualify', name: 'Qualify', nextStageKey: 'discovery' },
          { key: 'discovery', name: 'Discovery' },
        ]}
        leads={[{ id: 'lead-1', company_name: 'Acme Pvt Ltd' }]}
        movingLeadId="lead-1"
        onLeadSelect={vi.fn()}
        onMoveLeadToStage={vi.fn()}
        onResetFilters={vi.fn()}
      />,
    )

    // The lead stays visible in the current stage while the request runs.
    // (Company renders as the lead title and in the Company column.)
    expect(screen.getAllByText('Acme Pvt Ltd').length).toBeGreaterThan(0)
    // The Move button is disabled and shows the in-flight label + spinner.
    const moveButton = screen.getByRole('button', { name: /Updating stage/i })
    expect(moveButton).toBeTruthy()
    expect(moveButton).toBeDisabled()
    expect(moveButton).toHaveAttribute('aria-busy', 'true')
  })

  it('clears the bulk selection instead of assigning when the user cancels', () => {
    render(
      <PipelineStageListView
        stage={{ key: 'acquire', name: 'Acquire', nextStageKey: 'qualify' }}
        stages={[
          { key: 'acquire', name: 'Acquire', nextStageKey: 'qualify' },
          { key: 'qualify', name: 'Qualify' },
        ]}
        users={[{ id: 'user-9', first_name: 'Riya', last_name: 'Shah' }]}
        leads={[{ id: 'lead-1', company_name: 'Acme Pvt Ltd' }]}
        onLeadSelect={vi.fn()}
        onMoveLeadToStage={vi.fn()}
        onResetFilters={vi.fn()}
        onBulkAssign={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByLabelText('Select Acme Pvt Ltd'))
    expect(screen.getByText('1 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Clear$/i }))
    expect(screen.queryByText(/selected/)).toBeNull()
  })

  it('offers a bulk Delete action for selected leads', () => {
    const onBulkDelete = vi.fn()
    render(
      <PipelineStageListView
        stage={{ key: 'acquire', name: 'Acquire', nextStageKey: 'qualify' }}
        stages={[
          { key: 'acquire', name: 'Acquire', nextStageKey: 'qualify' },
          { key: 'qualify', name: 'Qualify' },
        ]}
        users={[{ id: 'user-9', first_name: 'Riya', last_name: 'Shah' }]}
        leads={[
          { id: 'lead-1', company_name: 'Acme Pvt Ltd' },
          { id: 'lead-2', company_name: 'Beta Corp' },
        ]}
        onLeadSelect={vi.fn()}
        onMoveLeadToStage={vi.fn()}
        onResetFilters={vi.fn()}
        onBulkAssign={vi.fn()}
        onBulkDelete={onBulkDelete}
      />,
    )

    // No Delete button until leads are selected.
    expect(screen.queryByRole('button', { name: /^Delete$/i })).toBeNull()

    fireEvent.click(screen.getByLabelText('Select all leads'))
    expect(screen.getByText('2 selected')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }))
    expect(onBulkDelete).toHaveBeenCalledWith(['lead-1', 'lead-2'])
  })
})
