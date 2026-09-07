import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProjectLifecycleTabs from './ProjectLifecycleTabs'
import { PROJECT_STAGE_COLORS } from '../../pages/projectsLifecycle'

const summary = {
  all: 31,
  created: 6,
  execution: 12,
  review: 3,
  completed: 5,
  reporting: 1,
  on_hold: 2,
  archived: 1,
  cancelled: 1,
  healthy: 18,
  needs_attention: 5,
  at_risk: 3,
  needs_setup: 4,
}

describe('ProjectLifecycleTabs', () => {
  it('renders All Projects with count, stage chips with arrows, and every stage label', () => {
    render(<ProjectLifecycleTabs current="execution" summary={summary} onSelectStatus={() => {}} onSelectHealth={() => {}} />)
    expect(screen.getByRole('tab', { name: /All Projects/i })).toBeTruthy()
    for (const label of ['Created', 'Execution', 'Review', 'Completed', 'Reporting', 'On Hold', 'Archived', 'Cancelled']) {
      expect(screen.getByRole('tab', { name: new RegExp(label) })).toBeTruthy()
    }
    // Arrows between consecutive stage chips
    expect(document.querySelectorAll('svg.lucide-arrow-right').length).toBeGreaterThanOrEqual(7)
    // Every stage has its own accent color entry
    expect(Object.keys(PROJECT_STAGE_COLORS)).toHaveLength(8)
  })

  it('renders lifecycle count badges from the summary', () => {
    render(<ProjectLifecycleTabs current="" summary={summary} onSelectStatus={() => {}} onSelectHealth={() => {}} />)
    const allTab = screen.getByRole('tab', { name: /All Projects/i })
    expect(allTab.textContent).toContain('31')
    const executionTab = screen.getByRole('tab', { name: /Execution/i })
    expect(executionTab.textContent).toContain('12')
  })

  it('renders health + needs_setup quick filters as a separate secondary row', () => {
    render(<ProjectLifecycleTabs current="" activeHealth="at_risk" summary={summary} onSelectStatus={() => {}} onSelectHealth={() => {}} />)
    const healthy = screen.getByRole('button', { name: /Healthy/i })
    const atRisk = screen.getByRole('button', { name: /At Risk/i })
    const needsSetup = screen.getByRole('button', { name: /Needs Setup/i })
    expect(healthy.textContent).toContain('18')
    expect(needsSetup.textContent).toContain('4')
    expect(atRisk.getAttribute('aria-pressed')).toBeNull()
  })

  it('clicking a lifecycle stage calls onSelectStatus with its id', () => {
    const onSelectStatus = vi.fn()
    render(<ProjectLifecycleTabs current="" summary={summary} onSelectStatus={onSelectStatus} onSelectHealth={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: /Review/i }))
    expect(onSelectStatus).toHaveBeenCalledWith('review')
  })

  it('clicking health chips calls onSelectHealth with the filter object', () => {
    const onSelectHealth = vi.fn()
    render(<ProjectLifecycleTabs current="" summary={summary} onSelectStatus={() => {}} onSelectHealth={onSelectHealth} />)
    fireEvent.click(screen.getByRole('button', { name: /Needs Setup/i }))
    expect(onSelectHealth).toHaveBeenCalledWith(expect.objectContaining({ id: 'needs_setup', kind: 'attention' }))
  })
})
