import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CRMPipelinePage from './page'

// The pipeline page pulls in react-query, react-router and dnd-kit hooks. Feed it
// a fixed board payload (no leads) and no-op navigation so we can exercise the
// render + the hero "Add Lead" action without a backend or a router.
vi.mock('react-query', () => {
  const pipelineData = {
    meta: { currency: 'INR' },
    stages: [
      { key: 'acquire', name: 'Acquire', order: 1, leads: [] },
      { key: 'qualify', name: 'Qualify', order: 2, leads: [] },
    ],
  }
  // The real src/api/queryClient.js builds a singleton `new QueryClient(...)` at
  // import time (pulled in through the auth store), so the class must exist.
  class MockQueryClient {
    clear() {}
    getQueryData() { return undefined }
    setQueryData() {}
    invalidateQueries() { return Promise.resolve() }
    cancelQueries() { return Promise.resolve() }
    removeQueries() {}
    getQueryCache() { return { findAll: () => [] } }
  }
  return {
    QueryClient: MockQueryClient,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      cancelQueries: vi.fn(),
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
    }),
    // Only the pipeline board query gets board data; the master-list queries
    // (categories/stages/users/products) resolve to empty payloads.
    useQuery: (key) => {
      const queryKey = Array.isArray(key) ? key[0] : key
      const isPipeline = queryKey === 'crm-pipeline-board'
      return {
        data: isPipeline ? pipelineData : {},
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      }
    },
    useMutation: () => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({}),
      isLoading: false,
      isError: false,
      variables: null,
    }),
  }
})

vi.mock('react-router-dom', () => {
  // Stable identities across renders, mirroring the real hook's behavior.
  const searchParams = new URLSearchParams()
  const setSearchParams = () => {}
  return {
    useNavigate: () => vi.fn(),
    useOutletContext: () => ({}),
    useParams: () => ({ stageKey: '' }),
    useSearchParams: () => [searchParams, setSearchParams],
  }
})

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => children,
  DragOverlay: ({ children }) => children,
  closestCorners: () => null,
  useSensor: () => ({}),
  useSensors: () => [],
  PointerSensor: class PointerSensor {},
  KeyboardSensor: class KeyboardSensor {},
}))

vi.mock('@dnd-kit/sortable', () => ({
  sortableKeyboardCoordinates: () => 0,
}))

vi.mock('react-hot-toast', () => ({
  success: vi.fn(),
  error: vi.fn(),
  default: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('../../../hooks/useDebounce', () => ({
  useDebounce: (value) => value,
}))

vi.mock('../../../api/crm', () => ({
  crmApi: {
    getPipeline: vi.fn(),
    updatePipelineStage: vi.fn(),
    updateStageStatus: vi.fn(),
    createActivity: vi.fn(),
  },
}))

vi.mock('../../../api/sales', () => ({
  salesApi: {
    getCategories: vi.fn(),
    getStages: vi.fn(),
    getProducts: vi.fn(),
    createLead: vi.fn(),
    updateLeadForm: vi.fn(),
  },
}))

vi.mock('../../../api/users', () => ({
  usersAPI: {
    getAssignableUsers: vi.fn(),
  },
}))

describe('crm pipeline page', () => {
  it('renders an Add Lead button that opens the existing create-lead modal', () => {
    render(<CRMPipelinePage />)

    // The hero action was previously unreachable: no button ever set createOpen.
    const addLeadButton = screen.getByRole('button', { name: /add lead/i })
    expect(addLeadButton).toBeTruthy()

    fireEvent.click(addLeadButton)

    // The create form modal opens and exposes the real fields + submit button.
    expect(screen.getByRole('heading', { name: /add new lead/i })).toBeTruthy()
    expect(screen.getByPlaceholderText('John')).toBeTruthy()
    expect(screen.getByRole('button', { name: /create lead/i })).toBeTruthy()

    // Closing via Cancel hides the modal again.
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByRole('heading', { name: /add new lead/i })).toBeNull()
  })
})
