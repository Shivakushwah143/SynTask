import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, Bot, Clock3, RefreshCw, Sparkles, Target, TrendingUp, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiAPI } from '../api/ai'
import { Badge, Button, EmptyState, PageHeader } from '../components/ui'

export default function AIPrioritization() {
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
      setError(generateError.response?.data?.detail || generateError.message || 'Failed to generate strategy recommendations')
      toast.error('Failed to generate strategy recommendations')
    } finally {
      setLoading(false)
    }
  }

  const priorities = useMemo(() => result?.top_priorities || [], [result])
  const breakdown = useMemo(() => result?.daily_breakdown || [], [result])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing Strategist AI"
        description="Campaign planning, risk detection, and performance-driven recommendations for the current day."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge label="Strategic planning" colorKey="active" />
            <Button onClick={handleGenerate} loading={loading}>
              <Sparkles className="h-4 w-4" />
              Generate strategy
            </Button>
          </div>
        )}
      />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {result ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Source" value={result.source} detail={`${result.provider || '-'} / ${result.model || '-'}`} />
          <StatCard label="Tasks reviewed" value={result.context?.task_count || 0} detail="Campaign signals and delivery pressure." />
          <StatCard label="Generated for" value={result.context?.generated_for?.full_name || 'Current user'} detail={result.context?.generated_for?.role || 'Strategist'} />
          <StatCard label="Generated at" value={result.generated_at ? format(new Date(result.generated_at), 'MMM d, HH:mm') : '-'} detail={result.source === 'fallback' ? 'Heuristic fallback' : 'Validated output'} />
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <Panel title="Campaign planning" icon={Target} description="Ranked actions that can shape the day’s marketing execution.">
            {priorities.length === 0 ? (
              <EmptyState icon={Bot} title="No strategy yet" description="Generate a strategy view to see ranked recommendations." action={<Button onClick={handleGenerate} loading={loading}>Generate strategy</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="bg-gray-50 dark:bg-gray-950/40">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Opportunity</th>
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
                            <span>{String(item.status || '').replaceAll('_', ' ')}</span>
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
          </Panel>

          <Panel title="Performance insights" icon={TrendingUp} description="A time-block view of the current marketing day.">
            {breakdown.length === 0 ? (
              <EmptyState icon={AlertTriangle} title="No performance plan" description="Generate strategy to populate the daily breakdown." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {breakdown.map((block) => (
                  <div key={`${block.time_block}-${block.task_id || block.focus}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-600">{block.time_block}</div>
                    <div className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">{block.focus}</div>
                    <div className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{block.rationale}</div>
                    {block.task_title ? <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">Task: {block.task_title}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <aside className="space-y-6">
          <Panel title="Risk alerts" icon={ShieldAlert} description="Operational risks surfaced by the strategy pass.">
            {result?.risks?.length ? (
              <div className="space-y-3">
                {result.risks.map((risk, index) => (
                  <div key={`${risk.title || 'risk'}-${index}`} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{risk.title || 'Risk'}</div>
                        <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{risk.description || risk.reason}</p>
                      </div>
                      <Badge label={risk.severity || 'medium'} colorKey={risk.severity === 'high' ? 'warning' : 'scheduled'} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={ShieldAlert} title="No risk alerts" description="Risks will appear when the strategy engine detects pressure." />
            )}
          </Panel>

          <Panel title="Recent AI logs" icon={Clock3} description="Audit trail for strategy generation.">
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={loadLogs} loading={loadingLogs}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {logs.length === 0 ? (
              <EmptyState icon={Bot} title="No logs yet" description="Generate a strategy to create the first log entry." />
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{log.feature}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{log.created_at ? format(new Date(log.created_at), 'MMM d, HH:mm:ss') : '-'}</div>
                      </div>
                      <Badge label={log.status} colorKey={log.status === 'success' ? 'active' : 'pending'} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <div>Provider: {log.provider || '-'}</div>
                      <div>Latency: {log.latency_ms ? `${log.latency_ms} ms` : '-'}</div>
                      <div>Fallback: {log.fallback_used ? 'Yes' : 'No'}</div>
                      <div>Model: {log.model || '-'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, description, children }) {
  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function StatCard({ label, value, detail }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  )
}
