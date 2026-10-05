import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Activity,
  AlertCircle,
  BarChart3,
  Bot,
  CheckCircle2,
  FlaskConical,
  Flag,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  Target,
  XCircle,
} from 'lucide-react'
import { aiEvalsAPI } from '../api/aiEvals'

const CATEGORY_LABELS = {
  routing: 'Routing',
  tool_selection: 'Tool Selection',
  correctness: 'Correctness',
  grounding: 'Grounding',
  safety: 'Safety',
  efficiency: 'Efficiency',
}

const valueOrDash = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

const statusStyles = {
  PASS: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  REGRESSION: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  FAIL: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  BLOCKED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  FAILED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  QUEUED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  NEW: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

const Badge = ({ label }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[label] || statusStyles.NEW}`}>
    {label}
  </span>
)

const Card = ({ title, description, icon: Icon, children, action }) => (
  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white px-4 py-3 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
      <div className="flex items-center gap-2">
        {Icon ? (
          <div className="rounded-lg bg-indigo-100 p-1.5 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
          {description ? <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
    <div className="p-4">{children}</div>
  </div>
)

const summaryText = (expected = {}) => {
  if (!expected || typeof expected !== 'object') return '-'
  const parts = []
  if (expected.expected_agent) parts.push(`agent: ${Array.isArray(expected.expected_agent) ? expected.expected_agent.join('|') : expected.expected_agent}`)
  if (expected.required_tools?.length) parts.push(`required tools: ${expected.required_tools.join(', ')}`)
  if (expected.answer_contains?.length) parts.push(`answer must contain: ${expected.answer_contains.join(', ')}`)
  if (expected.no_data_expected) parts.push('expects no-data / unknown behavior')
  if (expected.max_groq_calls !== undefined && expected.max_groq_calls !== null) parts.push(`max Groq calls: ${expected.max_groq_calls}`)
  if (!parts.length) return JSON.stringify(expected)
  return parts.join(' · ')
}

const FailedCaseRow = ({ failure }) => {
  const [open, setOpen] = useState(false)
  const tools = Array.isArray(failure.tools) ? failure.tools : []
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">{failure.case_id}</span>
            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-600 dark:bg-rose-900/50 dark:text-rose-300">{failure.category}</span>
            {failure.critical ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-rose-700 dark:text-rose-300"><Flag className="h-3 w-3" /> Critical</span> : null}
          </div>
          <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">{failure.query || failure.case_id}</p>
          <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{valueOrDash(failure.actual_agent)} {failure.actual_path ? `· ${failure.actual_path}` : ''} · {valueOrDash(failure.latency_ms)}ms · {failure.groq_calls} Groq call(s)</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-rose-600 dark:text-rose-400">{open ? 'Hide details' : 'View details'}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-rose-200 px-3 py-2.5 text-xs dark:border-rose-900">
          <div>
            <div className="font-semibold text-gray-500 dark:text-gray-400">Expected</div>
            <p className="mt-0.5 text-gray-700 dark:text-gray-300">{summaryText(failure.expected)}</p>
          </div>
          <div>
            <div className="font-semibold text-gray-500 dark:text-gray-400">Actual</div>
            <p className="mt-0.5 text-gray-700 dark:text-gray-300">
              agent: {valueOrDash(failure.actual_agent)} · path: {valueOrDash(failure.actual_path)} · success: {valueOrDash(failure.actual_success)}
              {failure.actual_error ? <span className="text-rose-600 dark:text-rose-400"> · error: {failure.actual_error}</span> : null}
            </p>
            {tools.length ? (
              <p className="mt-0.5 text-gray-600 dark:text-gray-400">tools: {tools.map((tool) => `${tool.tool}×${tool.calls}`).join(', ') || '-'}</p>
            ) : (
              <p className="mt-0.5 text-gray-600 dark:text-gray-400">tools: none called</p>
            )}
          </div>
          <div>
            <div className="font-semibold text-gray-500 dark:text-gray-400">Grader failures</div>
            <ul className="mt-0.5 list-inside list-disc space-y-0.5 text-rose-700 dark:text-rose-300">
              {(failure.failure_reasons || []).map((reason, index) => <li key={index}>{reason}</li>)}
            </ul>
          </div>
          {failure.answer_excerpt ? (
            <div>
              <div className="font-semibold text-gray-500 dark:text-gray-400">Answer excerpt</div>
              <p className="mt-0.5 line-clamp-3 text-gray-700 dark:text-gray-300">{failure.answer_excerpt}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const isTerminal = (status) => ['COMPLETED', 'BLOCKED', 'FAILED'].includes(status)

export default function AIEvaluations() {
  const [datasets, setDatasets] = useState([])
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [runs, setRuns] = useState([])
  const [selectedRunId, setSelectedRunId] = useState('')
  const [runDetail, setRunDetail] = useState(null)
  const [loadingDatasets, setLoadingDatasets] = useState(true)
  const [loadingRuns, setLoadingRuns] = useState(false)
  const [starting, setStarting] = useState(false)
  const pollTimer = useRef(null)

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.dataset_id === selectedDatasetId) || null,
    [datasets, selectedDatasetId],
  )
  const selectedRun = useMemo(
    () => runs.find((run) => run.run_id === selectedRunId) || runDetail?.run || null,
    [runs, selectedRunId, runDetail],
  )

  const loadDatasets = useCallback(async () => {
    try {
      const result = await aiEvalsAPI.listDatasets()
      setDatasets(result)
      if (!selectedDatasetId && result.length) {
        setSelectedDatasetId(result[0].dataset_id)
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load eval datasets')
    } finally {
      setLoadingDatasets(false)
    }
  }, [selectedDatasetId])

  const loadRuns = useCallback(async (dataset_id) => {
    if (!dataset_id) return
    setLoadingRuns(true)
    try {
      const result = await aiEvalsAPI.listRuns({ dataset_id, limit: 20 })
      setRuns(result.runs || [])
      setSelectedRunId((current) => current || (result.runs?.[0]?.run_id) || '')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load evaluation runs')
    } finally {
      setLoadingRuns(false)
    }
  }, [])

  const loadRunDetail = useCallback(async (run_id) => {
    if (!run_id) {
      setRunDetail(null)
      return
    }
    try {
      const result = await aiEvalsAPI.getRun(run_id)
      setRunDetail(result)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load run detail')
    }
  }, [])

  useEffect(() => {
    loadDatasets()
  }, [loadDatasets])

  useEffect(() => {
    if (selectedDatasetId) {
      loadRuns(selectedDatasetId)
      setSelectedRunId('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDatasetId])

  useEffect(() => {
    loadRunDetail(selectedRunId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRunId])

  // Poll while the selected run is still executing.
  useEffect(() => {
    if (!selectedRunId) return undefined
    if (runDetail?.run?.status && isTerminal(runDetail.run.status)) return undefined
    pollTimer.current = setInterval(() => {
      loadRunDetail(selectedRunId)
      if (selectedDatasetId) loadRuns(selectedDatasetId)
    }, 4000)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [selectedRunId, runDetail?.run?.status, loadRunDetail, loadRuns, selectedDatasetId])

  const handleRun = async () => {
    if (!selectedDatasetId) {
      toast.error('Select a dataset first')
      return
    }
    try {
      setStarting(true)
      const created = await aiEvalsAPI.createRun(selectedDatasetId)
      toast.success('Evaluation queued — running in the background')
      await loadRuns(selectedDatasetId)
      setSelectedRunId(created.run_id)
      loadRunDetail(created.run_id)
    } catch (error) {
      const detail = error.response?.data?.detail
      if (typeof detail === 'object') {
        toast.error(detail.message || detail.code || 'Evaluation could not start')
      } else {
        toast.error(detail || 'Evaluation could not start')
      }
    } finally {
      setStarting(false)
    }
  }

  const handleBaseline = async (run_id) => {
    try {
      await aiEvalsAPI.setBaseline(run_id)
      toast.success('Run marked as BASELINE')
      await loadRuns(selectedDatasetId)
      await loadRunDetail(run_id)
      await loadDatasets()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to mark baseline')
    }
  }

  const runStatus = selectedRun?.status || runDetail?.run?.status || 'QUEUED'
  const runView = runDetail?.run || selectedRun || null
  const cases = runDetail?.cases || []
  const failedCases = runDetail?.failed_cases || cases.filter((item) => item.status === 'FAIL') || []
  const verdict = runView?.regression_status || runView?.status || 'NEW'

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <FlaskConical className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">AI Evaluation &amp; Regression</h1>
              <p className="mt-1 text-indigo-100">
                Run the real SynTask agents against versioned scenarios. Deterministic graders — no LLM judge.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRun}
            disabled={starting || !selectedDatasetId}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-lg transition hover:bg-indigo-50 disabled:opacity-50"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run Evaluation
          </button>
        </div>
      </div>

      {loadingDatasets ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading datasets…
        </div>
      ) : (
        <>
          {/* Top controls */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Dataset" icon={Bot} description="Versioned Executive / HR scenario set">
              <select
                value={selectedDatasetId}
                onChange={(event) => setSelectedDatasetId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              >
                {datasets.map((dataset) => (
                  <option key={dataset.dataset_id} value={dataset.dataset_id} className="dark:bg-gray-900">
                    {dataset.agent_id === 'executive_operations_agent' ? 'Executive' : dataset.agent_id === 'hr_operations_agent' ? 'HR' : dataset.agent_id} — {dataset.dataset_id} ({dataset.case_count} cases)
                  </option>
                ))}
              </select>
              {selectedDataset ? (
                <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  {selectedDataset.description || 'Versioned runtime eval dataset.'}
                </p>
              ) : null}
            </Card>

            <Card title="Baseline" icon={Target} description="Latest baseline run compared case-by-case">
              {selectedDataset?.baseline_run_id ? (
                <div className="space-y-1">
                  <p className="break-all text-sm text-gray-800 dark:text-gray-200">{selectedDataset.baseline_run_id}</p>
                  <Badge label="BASELINE" />
                </div>
              ) : (
                <p className="text-sm text-amber-600 dark:text-amber-400">No baseline yet — run once, then mark a completed run as baseline.</p>
              )}
            </Card>

            <Card title="Selected run" icon={Activity} description={selectedRunId ? 'Latest execution of this dataset' : 'Pick a run below'}>
              {selectedRunId ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge label={runStatus} />
                  {runView?.is_baseline ? <Badge label="BASELINE" /> : null}
                  {runView?.regression_status && isTerminal(runStatus) ? <Badge label={verdict} /> : null}
                  {runView?.blocked_reason ? <span className="text-xs text-amber-600 dark:text-amber-400">{runView.blocked_reason}</span> : null}
                  {!isTerminal(runStatus) ? <Loader2 className="h-4 w-4 animate-spin text-indigo-500" /> : null}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No runs for this dataset yet.</p>
              )}
            </Card>
          </div>

          {/* Summary */}
          {runView ? (
            <Card
              title="Summary"
              icon={BarChart3}
              description={`Verdict: ${runView.regression_status || runStatus}`}
              action={isTerminal(runStatus) && !runView.is_baseline ? (
                <button
                  type="button"
                  onClick={() => handleBaseline(runView.run_id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700"
                >
                  <Flag className="h-3.5 w-3.5" /> Mark as baseline
                </button>
              ) : null}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Verdict</div>
                  <div className="mt-1 flex items-center gap-2">
                    {verdict === 'PASS' || verdict === 'COMPLETED' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4 text-rose-500" />}
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{verdict}</span>
                  </div>
                  {runView.regressions?.length ? <div className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">{runView.regressions.length} regression(s)</div> : null}
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Passed</div>
                  <div className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">{runView.passed_cases} / {runView.total_cases}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Failed</div>
                  <div className="mt-1 text-lg font-bold text-rose-600 dark:text-rose-400">{runView.failed_cases}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Blocked</div>
                  <div className="mt-1 text-lg font-bold text-amber-600 dark:text-amber-400">{runView.blocked_cases}</div>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/40 dark:bg-rose-950/20">
                  <div className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400"><ShieldAlert className="h-3.5 w-3.5" /> Critical failures</div>
                  <div className="mt-1 text-lg font-bold text-rose-700 dark:text-rose-300">{runView.critical_failed}</div>
                </div>
              </div>
              {runView.critical_failures?.length ? (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                  Critical cases failed (cannot be hidden by aggregate scoring): {runView.critical_failures.join(', ')}
                </div>
              ) : null}
            </Card>
          ) : null}

          {/* Category table */}
          {runView ? (
            <Card title="Category scores" icon={BarChart3} description="Deterministic grader pass rates per category">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      <th className="py-2 pr-4">Category</th>
                      <th className="py-2 pr-4">Score</th>
                      <th className="py-2 pr-4">Passed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(runView.category_rows || []).map((row) => (
                      <tr key={row.category} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                        <td className="py-2 pr-4 text-gray-800 dark:text-gray-200">{row.label}</td>
                        <td className="py-2 pr-4">
                          {row.percent === null || row.percent === undefined ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                <div
                                  className={`h-full rounded-full ${row.percent >= 95 ? 'bg-emerald-500' : row.percent >= 80 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                  style={{ width: `${row.percent}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{row.percent}%</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">{row.passed} / {row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {/* Failed cases */}
          {runView && failedCases.length ? (
            <Card title="Failed cases" icon={XCircle} description="Expected vs actual for each deterministic failure">
              <div className="space-y-2">{failedCases.map((failure) => <FailedCaseRow key={failure.case_id} failure={failure} />)}</div>
            </Card>
          ) : null}

          {/* Run history */}
          <Card title="Run history" icon={RefreshCw} description="Completed runs can become baselines" action={selectedRunId ? <Badge label={runStatus} /> : null}>
            {loadingRuns ? (
              <div className="flex items-center gap-2 py-4 text-sm text-gray-500 dark:text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : runs.length === 0 ? (
              <p className="py-4 text-sm text-gray-500 dark:text-gray-400">
                No runs yet for this dataset. Click <span className="font-medium text-gray-700 dark:text-gray-300">Run Evaluation</span> to start one against the real agent path.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      <th className="py-2 pr-4">Run</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Verdict</th>
                      <th className="py-2 pr-4">Result</th>
                      <th className="py-2 pr-4">Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr
                        key={run.run_id}
                        onClick={() => setSelectedRunId(run.run_id)}
                        className={`cursor-pointer border-b border-gray-100 last:border-0 dark:border-gray-800 ${selectedRunId === run.run_id ? 'bg-indigo-50 dark:bg-indigo-950/30' : ''}`}
                      >
                        <td className="max-w-[240px] truncate py-2 pr-4 text-gray-800 dark:text-gray-200">
                          {run.run_id.slice(0, 18)}…
                          {run.is_baseline ? <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">BASELINE</span> : null}
                        </td>
                        <td className="py-2 pr-4"><Badge label={run.status} /></td>
                        <td className="py-2 pr-4">{run.regression_status ? <Badge label={run.regression_status} /> : <span className="text-gray-400">—</span>}</td>
                        <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">{run.passed_cases} / {run.total_cases} passed · {run.failed_cases} failed</td>
                        <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">{run.created_at ? new Date(run.created_at).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Info strip */}
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs leading-5 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            <AlertCircle className="mr-1.5 inline h-3.5 w-3.5" />
            Evaluations execute the real routing → agent → Groq → tools path against the deterministic <span className="font-medium text-gray-700 dark:text-gray-300">full_demo_v1</span> demo tenant. No LLM judge, no mocked tools. Normal AI analytics/audit history is never polluted and no sensitive HR/payroll payloads are stored.
          </div>
        </>
      )}
    </div>
  )
}
