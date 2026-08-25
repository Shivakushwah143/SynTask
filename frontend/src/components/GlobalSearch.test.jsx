import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GlobalSearch } from './GlobalSearch'

// vi.mock factories are hoisted above imports, so mocks they reference must be
// created with vi.hoisted() to avoid "Cannot access before initialization".
const { navigateMock, apiGetMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  apiGetMock: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../api/axios', () => ({
  default: {
    get: (...args) => apiGetMock(...args),
  },
}))

const grouped = (groups, total) => ({ query: 'x', total, groups })

describe('GlobalSearch', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    apiGetMock.mockReset()
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('renders initial quick-access results without entering an update loop', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<GlobalSearch isOpen onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Global search' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tasks/i })).toBeInTheDocument()
    expect(
      consoleError.mock.calls.flat().some((message) => String(message).includes('Maximum update depth exceeded')),
    ).toBe(false)

    consoleError.mockRestore()
  })

  it('queries the backend and shows grouped server results', async () => {
    apiGetMock.mockResolvedValue({
      data: grouped(
        [
          {
            module: 'Work',
            moduleKey: 'work',
            items: [
              { id: 't1', type: 'task', title: 'Fix login bug', subtitle: 'todo · high', parent: 'Work → Tasks', href: '/tasks/t1', score: 900 },
            ],
          },
        ],
        1,
      ),
    })

    render(<GlobalSearch isOpen onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search query'), { target: { value: 'login' } })

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith('/search', { params: { q: 'login', limit: 60 } })
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Fix login bug/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/Work/i)).toBeInTheDocument()
  })

  it('shows a real no-results state when the server returns an empty group list', async () => {
    apiGetMock.mockResolvedValue({ data: grouped([], 0) })

    render(<GlobalSearch isOpen onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search query'), { target: { value: 'zzz' } })

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument()
    })
    // Must not fall back to unrelated local page shortcuts.
    expect(screen.queryByRole('button', { name: /Tasks/i })).not.toBeInTheDocument()
  })

  it('navigates to the tickets page via the sessionStorage deep-link for ticket results', async () => {
    apiGetMock.mockResolvedValue({
      data: grouped(
        [
          {
            module: 'Work',
            moduleKey: 'work',
            items: [{ id: 'tkt-1', type: 'ticket', title: 'Broken invoice', subtitle: 'TKT-1', parent: 'Work → Requests', href: '/tickets', score: 800 }],
          },
        ],
        1,
      ),
    })

    render(<GlobalSearch isOpen onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search query'), { target: { value: 'invoice' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Broken invoice/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Broken invoice/i }))

    expect(window.sessionStorage.getItem('open_ticket_id')).toBe('tkt-1')
    expect(navigateMock).toHaveBeenCalledWith('/tickets')
  })

  it('navigates using the backend-provided href for task results', async () => {
    apiGetMock.mockResolvedValue({
      data: grouped(
        [
          {
            module: 'Work',
            moduleKey: 'work',
            items: [{ id: 'task-9', type: 'task', title: 'API work', subtitle: 'todo', parent: 'Work → Tasks', href: '/tasks/task-9', score: 900 }],
          },
        ],
        1,
      ),
    })

    render(<GlobalSearch isOpen onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search query'), { target: { value: 'api' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /API work/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /API work/i }))

    expect(navigateMock).toHaveBeenCalledWith('/tasks/task-9')
  })

  it('saves a recent search when a result is selected', async () => {
    apiGetMock.mockResolvedValue({
      data: grouped(
        [
          {
            module: 'Work',
            moduleKey: 'work',
            items: [{ id: 'task-9', type: 'task', title: 'API work', subtitle: 'todo', parent: 'Work → Tasks', href: '/tasks/task-9', score: 900 }],
          },
        ],
        1,
      ),
    })

    render(<GlobalSearch isOpen onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Search query'), { target: { value: 'api' } })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /API work/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /API work/i }))
    expect(window.localStorage.getItem('syntask_recent_searches')).toContain('api')
  })
})
