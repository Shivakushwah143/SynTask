import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ChartCard } from './ChartCard'

describe('ChartCard', () => {
  test('renders static period text without a fake dropdown button', () => {
    render(
      <ChartCard title="Report Metrics" period="Current View">
        <div>chart</div>
      </ChartCard>
    )

    expect(screen.getByText('Current View')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Current View/i })).not.toBeInTheDocument()
  })

  test('renders clickable period control when a handler exists', () => {
    const onPeriodClick = vi.fn()

    render(
      <ChartCard title="Report Metrics" period="Current View" onPeriodClick={onPeriodClick}>
        <div>chart</div>
      </ChartCard>
    )

    fireEvent.click(screen.getByRole('button', { name: /Current View/i }))

    expect(onPeriodClick).toHaveBeenCalledTimes(1)
  })
})
