import api from './axios'

export const aiEvalsAPI = {
  // GET /ai-evals/datasets
  listDatasets: async () => {
    const response = await api.get('/ai-evals/datasets')
    return response.data?.datasets || []
  },

  // POST /ai-evals/runs { dataset_id }
  createRun: async (dataset_id) => {
    const response = await api.post('/ai-evals/runs', { dataset_id })
    return response.data
  },

  // GET /ai-evals/runs?dataset_id=&limit=&offset=
  listRuns: async (params = {}) => {
    const response = await api.get('/ai-evals/runs', { params })
    return response.data
  },

  // GET /ai-evals/runs/{run_id}
  getRun: async (run_id) => {
    const response = await api.get(`/ai-evals/runs/${run_id}`)
    return response.data
  },

  // POST /ai-evals/runs/{run_id}/baseline
  setBaseline: async (run_id) => {
    const response = await api.post(`/ai-evals/runs/${run_id}/baseline`)
    return response.data
  },
}

export const AIEvalCategoryOrder = ['routing', 'tool_selection', 'correctness', 'grounding', 'safety', 'efficiency']
