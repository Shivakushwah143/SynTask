import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StageRequirementsDialog } from './StageRequirementsDialog'
import { TRANSITION_BLOCKER } from '../../utils/salesTransition'

const makeBlocker = (overrides = {}) => ({
  category: TRANSITION_BLOCKER.MISSING_DETAILS,
  severity: 'warning',
  currentStage: 'Qualify',
  targetStage: 'Discovery',
  message: 'Cannot move to Discovery — missing Budget, Decision Maker.',
  missingFields: [
    { field: 'budget', label: 'Budget', type: 'currency' },
    { field: 'decision_maker', label: 'Decision Maker', type: 'text' },
  ],
  statusRequirement: null,
  actionRequirement: null,
  ...overrides,
})

describe('StageRequirementsDialog', () => {
  it('renders only the missing editable fields', () => {
    render(
      <StageRequirementsDialog
        open
        blocker={makeBlocker()}
        lead={{ budget: 50000, decision_maker: '' }}
        onClose={vi.fn()}
        onSaveFields={vi.fn()}
        onSaveAndMove={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/Budget/i)).toBeTruthy()
    expect(screen.getByLabelText(/Decision Maker/i)).toBeTruthy()
    // Budget is prefilled from existing lead data; decision maker stays empty.
    expect(screen.getByLabelText(/Budget/i).value).toBe('50000')
    expect(screen.getByText('Save Details')).toBeTruthy()
    expect(screen.getByText('Save and Move Forward')).toBeTruthy()
  })

  it('shows an amber warning banner when a status rule also blocks (mixed case)', () => {
    render(
      <StageRequirementsDialog
        open
        blocker={makeBlocker({
          missingFields: [{ field: 'budget', label: 'Budget', type: 'currency' }],
          statusRequirement: {
            field: 'qualify_status',
            label: 'Qualification Status',
            allowed_values: ['interested', 'qualified'],
            current_value: 'contacted',
          },
        })}
        lead={{}}
        onClose={vi.fn()}
        onSaveFields={vi.fn()}
        onSaveAndMove={vi.fn()}
      />
    )
    expect(screen.getByText(/Qualification Status required/i)).toBeTruthy()
    expect(screen.getByText(/Interested or Qualified/)).toBeTruthy()
  })

  it('renders unknown fields as a safe warning list, never as inputs', () => {
    render(
      <StageRequirementsDialog
        open
        blocker={makeBlocker({ missingFields: [{ field: 'client_id', label: 'Client', type: 'reference' }] })}
        lead={{}}
        onClose={vi.fn()}
        onSaveFields={vi.fn()}
        onSaveAndMove={vi.fn()}
      />
    )
    expect(screen.getByText(/Additional information is required/i)).toBeTruthy()
    expect(screen.getByText('Client')).toBeTruthy()
    // No editable input was rendered for the reference field.
    expect(screen.queryByLabelText(/Client/i)).toBeNull()
  })

  it('calls onSaveFields with the entered values', () => {
    const onSaveFields = vi.fn().mockResolvedValue(undefined)
    render(
      <StageRequirementsDialog
        open
        blocker={makeBlocker()}
        lead={{ budget: '', decision_maker: '' }}
        onClose={vi.fn()}
        onSaveFields={onSaveFields}
        onSaveAndMove={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText(/Budget/i), { target: { value: '250000' } })
    fireEvent.change(screen.getByLabelText(/Decision Maker/i), { target: { value: 'Rahul Sharma' } })
    fireEvent.click(screen.getByText('Save Details'))
    expect(onSaveFields).toHaveBeenCalledWith({ budget: '250000', decision_maker: 'Rahul Sharma' })
  })

  it('calls onSaveAndMove from the primary action', () => {
    const onSaveAndMove = vi.fn().mockResolvedValue(undefined)
    render(
      <StageRequirementsDialog
        open
        blocker={makeBlocker()}
        lead={{ budget: '', decision_maker: '' }}
        onClose={vi.fn()}
        onSaveFields={vi.fn()}
        onSaveAndMove={onSaveAndMove}
      />
    )
    fireEvent.click(screen.getByText('Save and Move Forward'))
    expect(onSaveAndMove).toHaveBeenCalledTimes(1)
  })

  it('renders one-click context actions (Won -> Clients inline completion)', () => {
    const onClick = vi.fn()
    render(
      <StageRequirementsDialog
        open
        blocker={makeBlocker({ missingFields: [{ field: 'client_id', label: 'Client', type: 'reference' }] })}
        lead={{}}
        onClose={vi.fn()}
        onSaveFields={vi.fn()}
        onSaveAndMove={vi.fn()}
        contextActions={[{ key: 'create_client', label: 'Create Client', onClick }]}
      />
    )
    fireEvent.click(screen.getByText('Create Client'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('keeps the lead on its current stage (no status auto-change)', () => {
    render(
      <StageRequirementsDialog
        open
        blocker={makeBlocker()}
        lead={{ budget: '', decision_maker: '' }}
        onClose={vi.fn()}
        onSaveFields={vi.fn()}
        onSaveAndMove={vi.fn()}
      />
    )
    // There is no status input rendered from a MISSING_DETAILS blocker.
    expect(screen.queryByLabelText(/Qualification Status/i)).toBeNull()
    expect(screen.getByText(/stays on its current stage/i)).toBeTruthy()
  })
})
