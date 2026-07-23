import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import AIHub from './AIHub'

vi.mock('../api/ai', () => ({
  aiAPI: {
    listLogs: vi.fn(),
  },
}))

vi.mock('../api/agents', () => ({
  agentsAPI: {
    createProjectRun: vi.fn(),
    createEmailDraftRun: vi.fn(),
    createTaskPerformanceRun: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

import { aiAPI } from '../api/ai'
import { agentsAPI } from '../api/agents'

const renderHub = () => render(
  <MemoryRouter>
    <AIHub />
  </MemoryRouter>
)

describe('AIHub agent integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiAPI.listLogs.mockResolvedValue([])
    vi.stubGlobal('crypto', { randomUUID: () => 'fixed-idempotency-key' })
  })

  test('renders only public agent workspaces without send or direct specialist controls', async () => {
    renderHub()

    await waitFor(() => expect(screen.getAllByText('Project Agent').length).toBeGreaterThan(0))
    expect(screen.getAllByText('Email Draft Agent').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Task Performance Insights').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/specialist/i)).not.toBeInTheDocument()
  })

  test('submits Project Agent through real contract without frontend authority fields', async () => {
    agentsAPI.createProjectRun.mockResolvedValue({
      run_id: 'project-run-1',
      agent_id: 'project_agent',
      state: 'COMPLETED',
      sanitized_result: {
        summary: 'Project is on track.',
        read_only: true,
        approval_required: false,
        overall_confidence: 0.91,
        department_specialist: {
          pack_id: 'software_technology',
          specialist_id: 'software_implementation_specialist',
          specialist_version: '1.0.0',
          selection_reason: 'Task category matched software implementation.',
        },
        recommendations: [{ title: 'Clarify API dependency', rationale: 'Dependency risk exists.' }],
        risks: [],
        missing_data: [],
      },
    })

    renderHub()
    fireEvent.change(screen.getByPlaceholderText('Authorized project ID'), { target: { value: 'PROJ-1' } })
    fireEvent.change(screen.getByLabelText(/^Request/i), { target: { value: 'Summarize risk.' } })
    fireEvent.click(screen.getByRole('button', { name: /Run Project Agent/i }))

    await waitFor(() => expect(agentsAPI.createProjectRun).toHaveBeenCalledTimes(1))
    const payload = agentsAPI.createProjectRun.mock.calls[0][0]
    expect(payload.project_id).toBe('PROJ-1')
    expect(payload.agent_id).toBeUndefined()
    expect(payload.tenant_id).toBeUndefined()
    expect(payload.user_id).toBeUndefined()
    expect(payload.specialist_id).toBeUndefined()
    expect(await screen.findByText('Server-selected specialist')).toBeInTheDocument()
  })

  test('renders Email Draft as draft-only with no send behavior', async () => {
    agentsAPI.createEmailDraftRun.mockResolvedValue({
      run_id: 'email-run-1',
      agent_id: 'general_email_draft_agent',
      state: 'COMPLETED',
      sanitized_result: {
        draft_status: 'DRAFT',
        subject: 'Status update',
        body: 'Hello team, here is the update.',
        warnings: { missing_recipient: true },
      },
    })

    renderHub()
    fireEvent.change(screen.getByLabelText(/^Purpose/i), { target: { value: 'Send a status update' } })
    fireEvent.click(screen.getByRole('button', { name: /Generate Draft/i }))

    expect(await screen.findByDisplayValue('Status update')).toBeInTheDocument()
    expect(screen.getByText('DRAFT')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument()
  })

  test('renders Task Performance metrics as immutable verified metrics', async () => {
    agentsAPI.createTaskPerformanceRun.mockResolvedValue({
      run_id: 'task-performance-run-1',
      agent_id: 'task_performance_insights_agent',
      state: 'COMPLETED',
      sanitized_result: {
        summary: 'Completion improved.',
        metrics: [{
          key: 'task_completion_rate',
          version: '1.0.0',
          status: 'available',
          value: 0.75,
          unit: 'ratio',
          formula: 'completed tasks / eligible tasks',
          numerator: 3,
          denominator: 4,
          sample_size: 4,
          confidence: 0.8,
          timezone: 'UTC',
          missing_fields: [],
        }],
        employee_reported_context: ['EOD notes are employee-reported.'],
        data_quality: { missing_data: ['No estimates on 1 task'], conflicts: [] },
        insights: [{ title: 'Estimate gap', description: 'One task lacks estimate.', fact_or_hypothesis: 'hypothesis' }],
        recommendations: [{ title: 'Review estimates', description: 'Proposal only.', mutation_status: 'proposal_only' }],
      },
    })

    renderHub()
    fireEvent.click(screen.getByRole('button', { name: /Run Insights/i }))

    expect(await screen.findByText('Immutable verified metrics')).toBeInTheDocument()
    expect(screen.getByText('task_completion_rate @1.0.0')).toBeInTheDocument()
    expect(screen.getByText(/Value: 0.75 ratio/i)).toBeInTheDocument()
    expect(screen.getByText('Employee-reported EOD context')).toBeInTheDocument()
    expect(screen.getByText('Hypotheses')).toBeInTheDocument()
    expect(screen.getByText('proposal_only')).toBeInTheDocument()
  })
})
