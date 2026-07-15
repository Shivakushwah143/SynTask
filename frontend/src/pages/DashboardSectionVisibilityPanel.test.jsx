import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardSectionVisibilityPanel } from './DashboardSectionVisibilityPanelView.jsx'

const sections = [
  { id: 'one', name: 'One' },
  { id: 'two', name: 'Two' },
]

function renderPanel(props = {}) {
  const onToggleCollapsed = vi.fn()
  const onCollapse = vi.fn()
  render(
    <div>
      <button type="button">Outside</button>
      <DashboardSectionVisibilityPanel
        sections={sections}
        visibility={{}}
        visibleCount={2}
        collapsed={false}
        search=""
        onSearchChange={vi.fn()}
        onToggleCollapsed={onToggleCollapsed}
        onCollapse={onCollapse}
        onToggleSection={vi.fn()}
        onSelectAll={vi.fn()}
        onClearAll={vi.fn()}
        {...props}
      />
    </div>,
  )
  return { onToggleCollapsed, onCollapse }
}

describe('DashboardSectionVisibilityPanel', () => {
  it('collapses when clicking outside the open panel', () => {
    const { onCollapse } = renderPanel()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))

    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('does not collapse when clicking inside the open panel', () => {
    const { onCollapse } = renderPanel()

    fireEvent.pointerDown(screen.getByRole('button', { name: /Dashboard Sections/i }))

    expect(onCollapse).not.toHaveBeenCalled()
  })

  it('collapses when the dashboard scrolls down', () => {
    const { onCollapse } = renderPanel()

    fireEvent.scroll(window, { target: { scrollY: 80 } })

    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('keeps the collapsed reopen button accessible', () => {
    const { onToggleCollapsed } = renderPanel({ collapsed: true })

    const button = screen.getByRole('button', { name: 'Show dashboard sections' })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(button)

    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
  })
})
