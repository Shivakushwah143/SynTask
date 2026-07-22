import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GlobalSearch } from './GlobalSearch'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../api/axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

describe('GlobalSearch', () => {
  it('renders initial results without entering an update loop', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<GlobalSearch isOpen onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Global search' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tasks/i })).toBeInTheDocument()
    expect(
      consoleError.mock.calls.flat().some((message) => String(message).includes('Maximum update depth exceeded')),
    ).toBe(false)

    consoleError.mockRestore()
  })
})
