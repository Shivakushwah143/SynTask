import { beforeEach, describe, expect, test, vi } from 'vitest'
import { agentsAPI } from './agents'
import api from './axios'

vi.mock('./axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('agentsAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockResolvedValue({ data: { ok: true } })
    api.post.mockResolvedValue({ data: { ok: true } })
  })

  test('maps every backend Agent Platform route used by frontend', async () => {
    await agentsAPI.listDefinitions({ limit: 10 })
    expect(api.get).toHaveBeenLastCalledWith('/agents/definitions', { params: { limit: 10 } })

    await agentsAPI.listDefinitionVersions('project_agent')
    expect(api.get).toHaveBeenLastCalledWith('/agents/definitions/project_agent/versions')

    await agentsAPI.createRun({ agent_id: 'project_agent' })
    expect(api.post).toHaveBeenLastCalledWith('/agents/runs', { agent_id: 'project_agent' })

    await agentsAPI.createProjectRun({ project_id: 'PROJ-1' })
    expect(api.post).toHaveBeenLastCalledWith('/agents/project/runs', { project_id: 'PROJ-1' })

    await agentsAPI.createEmailDraftRun({ draft_type: 'general' })
    expect(api.post).toHaveBeenLastCalledWith('/agents/email-draft/runs', { draft_type: 'general' })

    await agentsAPI.createTaskPerformanceRun({ insight_type: 'team_summary' })
    expect(api.post).toHaveBeenLastCalledWith('/agents/task-performance/runs', { insight_type: 'team_summary' })

    await agentsAPI.getRun('run-1')
    expect(api.get).toHaveBeenLastCalledWith('/agents/runs/run-1')

    await agentsAPI.cancelRun('run-1')
    expect(api.post).toHaveBeenLastCalledWith('/agents/runs/run-1/cancel')

    await agentsAPI.listRunEvents('run-1')
    expect(api.get).toHaveBeenLastCalledWith('/agents/runs/run-1/events')

    await agentsAPI.listRunProposals('run-1')
    expect(api.get).toHaveBeenLastCalledWith('/agents/runs/run-1/proposals')
  })

  test('returns response data instead of raw Axios response', async () => {
    api.post.mockResolvedValueOnce({ data: { run_id: 'run-1', sanitized_result: { summary: 'ok' } } })

    await expect(agentsAPI.createProjectRun({ project_id: 'PROJ-1' })).resolves.toEqual({
      run_id: 'run-1',
      sanitized_result: { summary: 'ok' },
    })
  })
})
