import { render, screen } from '@testing-library/react'
import { CalendarClock } from 'lucide-react'
import { describe, expect, test } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  test('renders when icon is passed as a component type', () => {
    render(<EmptyState icon={CalendarClock} title="No scheduled jobs yet" description="Queue future work." />)

    expect(screen.getByText('No scheduled jobs yet')).toBeInTheDocument()
  })
})
