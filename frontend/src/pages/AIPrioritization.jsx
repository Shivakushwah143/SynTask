import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bot, Clock3, RefreshCw, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { aiAPI } from '../api/ai'
import { Badge, Button, EmptyState, PageHeader } from '../components/ui'

const AIPrioritization = () => {
  const [result, setResult] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [error, setError] = useState('')

  const loadLogs = useCallback(async () => {
    try {
      setLoadingLogs(true)
      const data = await aiAPI.listLogs(10)
      setLogs(Array.isArray(data) ? data : [])
    } catch (loadError) {
      console.error('Failed to load AI logs', loadError)
      setLogs([])
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const handleGenerate = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await aiAPI.generateTaskPrioritization({
        limit: 10,
        include_completed: false,
      })
      setResult(data)
      await loadLogs()
    } catch (generateError) {
      console.error('Failed to generate AI priorities', generateError)
      setError(generateError.response?.data?.detail || generateError.message || 'Failed to generate task priorities')
    } finally {
      setLoading(false)
    }
  }

  const priorities = useMemo(() => result?.top_priorities || [], [result])
  const breakdown = useMemo(() => result?.daily_breakdown || [], [result])

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="AI Prioritization"
        description="Generate a daily task plan for the current employee using the Groq-backed SynTask AI pipeline."
        actions={
          <Button onClick={handleGenerate} loading={loading}>
            <Sparkles className="h-4 w-4" />
            Generate priorities
          </Button>
        }
      />

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Source</div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">{result.source}</div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{result.provider} / {result.model}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Tasks reviewed</div>
            <div className="mt-2 text-3xl font-black text-gray-900 dark:text-gray-100">{result.context?.task_count || 0}</div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">Company scoped, employee specific.</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Generated for</div>
            <div className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">
              {result.context?.generated_for?.full_name || 'Current user'}
            </div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {result.context?.generated_for?.role || 'employee'}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Generated at</div>
            <div className="mt-2 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100">
              <Clock3 className="h-5 w-5 text-primary-600" />
              {format(new Date(result.generated_at), 'MMM d, HH:mm')}
            </div>
            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {result.source === 'fallback' ? 'Heuristic fallback was used.' : 'LLM output was validated successfully.'}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Top priorities</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Sorted by urgency, due dates, and status.</p>
              </div>
              {result ? <Badge label={result.source} colorKey={result.source === 'fallback' ? 'pending' : 'active'} /> : null}
            </div>

            {priorities.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="No AI result yet"
                description="Generate a prioritization plan to see the ranked task list."
                action={<Button onClick={handleGenerate} loading={loading}>Generate priorities</Button>}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-950/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Task</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Score</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Reason</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {priorities.map((item) => (
                      <tr key={item.task_id} className="align-top">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{item.title}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <Badge label={item.priority} colorKey={item.priority} />
                            <span>{item.status.replaceAll('_', ' ')}</span>
                            {item.department ? <span>{item.department}</span> : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm font-bold text-gray-900 dark:text-gray-100">{item.score}</td>
                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{item.reason}</td>
                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{item.recommended_action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Daily breakdown</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">A lightweight schedule for the current workday.</p>
            </div>
            {breakdown.length === 0 ? (
              <EmptyState
                icon={AlertTriangle}
                title="No breakdown available"
                description="Run prioritization to get a time-block plan."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {breakdown.map((block) => (
                  <div key={`${block.time_block}-${block.task_id || block.focus}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-600">{block.time_block}</div>
                    <div className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">{block.focus}</div>
                    <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{block.rationale}</div>
                    {block.task_title ? (
                      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        Task: {block.task_title}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Recent AI logs</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Audit trail for the pipeline during this session.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={loadLogs} loading={loadingLogs}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {logs.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No logs yet"
              description="Generate a plan to create the first AI log entry."
            />
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{log.feature}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                      </div>
                    </div>
                    <Badge label={log.status} colorKey={log.status === 'success' ? 'active' : 'pending'} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <div>Provider: {log.provider}</div>
                    <div>Latency: {log.latency_ms ? `${log.latency_ms} ms` : '-'}</div>
                    <div>Fallback: {log.fallback_used ? 'Yes' : 'No'}</div>
                    <div>Model: {log.model || '-'}</div>
                  </div>
                  {log.error_message ? (
                    <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/20 dark:text-red-200">
                      {log.error_message}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AIPrioritization
