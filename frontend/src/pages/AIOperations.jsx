import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Bot,
  CheckCircle2,
  Cpu,
  Gauge,
  Loader2,
  RadioTower,
  RefreshCw,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react'
import { AI_OPS_RANGE_PRESETS, aiOperationsAPI } from '../api/aiOperations'

// ---------------------------------------------------------------------------
// Small presentational helpers (same visual language as AI Evaluations)
// ---------------------------------------------------------------------------

const fmt = (value, digits = 0) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })
}

const fmtPct = (value) => (value === null || value === undefined ? '-' : `${value}%`)
const fmtMs = (value) => (value === null || value === undefined ? '-' : `${Number(value).toFixed(0)}ms`)
const fmtTime = (value) => (value ? new Date(value).toLocaleString() : '-')
const fmtShortTime = (value) => (value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-')

const traceStatusStyles = {
  SUCCESS: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  FAILED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  BLOCKED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  ABORTED: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}
const spanTypeStyles = {
  REQUEST: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  ROUTING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  QUERY_GATE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  CAPABILITY_SELECTION: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  AGENT: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
  LLM: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  TOOL: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  CACHE: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  SERVICE: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  RESPONSE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}
const spanStatusDot = (status) =>
  status === 'SUCCESS'
    ? 'bg-emerald-500'
    : status === 'FAILED' || status === 'ABORTED'
      ? 'bg-rose-500'
      : 'bg-amber-400'

const Badge = ({ label, styles }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles || traceStatusStyles[label] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
    {label}
  </span>
)

const StatCard = ({ label, value, sub, icon: Icon, accent = 'text-gray-900 dark:text-white' }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {label}
    </div>
    <div className={`mt-1.5 truncate text-xl font-bold ${accent}`}>{value}</div>
    {sub ? <div className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{sub}</div> : null}
  </div>
)

const Card = ({ title, description, icon: Icon, action, children }) => (
  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
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

const Empty = ({ message }) => <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{message}</p>

const miniTableClass = 'w-full text-left text-sm'
const thClass = 'border-b border-gray-200 py-2 pr-3 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400'
const tdClass = 'border-b border-gray-100 py-2 pr-3 text-gray-700 last:border-0 dark:border-gray-800 dark:text-gray-300'

// ---------------------------------------------------------------------------
// Span tree (trace detail)
// ---------------------------------------------------------------------------

const attrSummary = (span) => {
  const attrs = span.attributes || {}
  if (span.type === 'LLM') {
    return `${attrs.model || '-'} · ${fmt(attrs.prompt_tokens)} prompt · ${fmt(attrs.completion_tokens)} completion`
  }
  if (span.type === 'TOOL') return attrs.cache_hit ? 'cache hit' : 'live query'
  if (span.type === 'QUERY_GATE') {
    const path = attrs.path || ''
    return path ? `${path}${attrs.fast_fact_handler ? ` (${attrs.fast_fact_handler})` : ''}` : ''
  }
  if (span.type === 'AGENT') {
    return `steps ${attrs.steps_used ?? '-'}/${attrs.max_steps ?? '-'} · ${fmt(attrs.tool_calls ?? 0)} tool(s)`
  }
  if (span.type === 'CAPABILITY_SELECTION') {
    return `${attrs.selected_tool_count ?? 0} tool(s)${attrs.packs_used?.length ? ` · packs: ${attrs.packs_used.join(', ')}` : ''}`
  }
  return ''
}

const SpanRow = ({ span, depth = 0 }) => {
  const statusStyle = traceStatusStyles[span.status] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
  const label = span.type === 'TOOL' || span.type === 'AGENT' || span.type === 'SERVICE' ? span.name : span.type === 'LLM' ? span.name : span.name
  const isFailed = span.status === 'FAILED' || span.status === 'ABORTED'
  return (
    <div style={{ paddingLeft: `${depth * 20}px` }} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs ${isFailed ? 'bg-rose-50/60 dark:bg-rose-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${spanStatusDot(span.status)}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge label={label} styles={spanTypeStyles[span.type] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'} />
          <span className={`font-medium ${statusStyle.split(' ').slice(-2).join(' ')}`}>{span.status}</span>
          {span.error_type ? <span className="font-semibold text-rose-600 dark:text-rose-400">{span.error_type}</span> : null}
          <span className="ml-auto shrink-0 font-mono text-[11px] text-gray-500 dark:text-gray-400">{fmtMs(span.latency_ms)}</span>
        </div>
        <div className="mt-0.5 text-gray-500 dark:text-gray-400">{attrSummary(span)}</div>
        {span.error_message_safe ? <div className="mt-0.5 break-words text-rose-600 dark:text-rose-400">{span.error_message_safe}</div> : null}
      </div>
    </div>
  )
}

const SpanTree = ({ spans }) => {
  const byId = new Map((spans || []).map((span) => [span.span_id, span]))
  const children = new Map()
  const roots = []
  for (const span of spans || []) {
    const parentId = span.parent_span_id && byId.has(span.parent_span_id) ? span.parent_span_id : null
    if (parentId) {
      if (!children.has(parentId)) children.set(parentId, [])
      children.get(parentId).push(span)
    } else {
      roots.push(span)
    }
  }
  const ordered = [...roots]
  const stack = [...roots].reverse()
  const depthMap = new Map()
  roots.forEach((span) => depthMap.set(span.span_id, 0))
  while (stack.length) {
    const span = stack.pop()
    const kids = children.get(span.span_id) || []
    for (const kid of kids) {
      depthMap.set(kid.span_id, (depthMap.get(span.span_id) || 0) + 1)
      stack.push(kid)
    }
  }
  const flatten = []
  const walk = (node) => {
    flatten.push(node)
    for (const kid of children.get(node.span_id) || []) walk(kid)
  }
  for (const root of roots) walk(root)
  if (!flatten.length) return <Empty message="No spans recorded for this trace." />
  return (
    <div className="space-y-0.5">
      {flatten.map((span) => (
        <SpanRow key={span.span_id} span={span} depth={depthMap.get(span.span_id) || 0} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AIOperations() {
  const [rangeDays, setRangeDays] = useState(1)
  const [overview, setOverview] = useState(null)
  const [traces, setTraces] = useState([])
  const [selectedTraceId, setSelectedTraceId] = useState('')
  const [traceDetail, setTraceDetail] = useState(null)
  const [agents, setAgents] = useState([])
  const [tools, setTools] = useState([])
  const [provider, setProvider] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const pollTimer = useRef(null)

  const loadAll = useCallback(async (days) => {
    setLoading(true)
    const params = { days }
    try {
      const [overviewData, traceData, agentData, toolData, providerData] = await Promise.all([
        aiOperationsAPI.overview(params),
        aiOperationsAPI.listTraces({ days, limit: 100 }),
        aiOperationsAPI.agents(params),
        aiOperationsAPI.tools(params),
        aiOperationsAPI.provider(params),
      ])
      setOverview(overviewData)
      setTraces(traceData.traces || [])
      setSelectedTraceId((current) => current || traceData.traces?.[0]?.trace_id || '')
      setAgents(agentData)
      setTools(toolData)
      setProvider(providerData)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load AI operations')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTraceDetail = useCallback(async (traceId) => {
    if (!traceId) {
      setTraceDetail(null)
      return
    }
    setLoadingDetail(true)
    try {
      const detail = await aiOperationsAPI.getTrace(traceId)
      setTraceDetail(detail)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to load trace detail')
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    loadAll(rangeDays)
  }, [loadAll, rangeDays])

  useEffect(() => {
    loadTraceDetail(selectedTraceId)
  }, [selectedTraceId, loadTraceDetail])

  // Poll only while any request is still RUNNING.
  const anyRunning = useMemo(() => {
    if (overview?.counts?.running) return true
    return (traces || []).some((trace) => trace.status === 'RUNNING')
  }, [overview, traces])

  useEffect(() => {
    if (!anyRunning) return undefined
    pollTimer.current = setInterval(() => {
      loadAll(rangeDays)
      if (selectedTraceId) loadTraceDetail(selectedTraceId)
    }, 8000)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [anyRunning, rangeDays, loadAll, loadTraceDetail, selectedTraceId])

  const health = overview?.health || null
  const latency = overview?.latency_ms || {}
  const groqStats = overview?.groq || {}
  const toolStats = overview?.tools || {}
  const selectedTrace = useMemo(() => traces.find((trace) => trace.trace_id === selectedTraceId) || traceDetail?.trace || null, [traces, selectedTraceId, traceDetail])

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-600 via-sky-600 to-indigo-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <RadioTower className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">AI Operations</h1>
              <p className="mt-1 text-cyan-100">End-to-end observability for the SynTask agent runtime — one trace per request.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={rangeDays}
              onChange={(event) => setRangeDays(Number(event.target.value))}
              className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm [&>option]:bg-white [&>option]:text-gray-900"
            >
              {AI_OPS_RANGE_PRESETS.map((preset) => (
                <option key={preset.days} value={preset.days}>
                  {preset.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => loadAll(rangeDays)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-sky-700 shadow transition hover:bg-sky-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {loading && !overview ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading AI operations…
        </div>
      ) : (
        <>
          {/* Health flags */}
          {health?.flags?.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                <AlertCircle className="h-4 w-4" /> Health: {health.status === 'ok' ? 'OK' : health.status}
              </div>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
                {health.flags.map((flag) => (
                  <li key={flag.id}>{flag.message}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Overview */}
          <Card title="Overview" icon={Gauge} description={`Runtime metrics · ${AI_OPS_RANGE_PRESETS.find((p) => p.days === rangeDays)?.label.toLowerCase()}`}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Requests" value={fmt(overview?.requests)} icon={Activity} sub={overview?.fast_path_requests ? `${overview.fast_path_requests} fast-path (0 Groq)` : undefined} />
              <StatCard
                label="Success rate"
                value={fmtPct(overview?.success_rate)}
                icon={CheckCircle2}
                accent="text-emerald-600 dark:text-emerald-400"
                sub={overview ? `${overview.counts.failed} failed · ${overview.counts.blocked} blocked · ${overview.counts.aborted} aborted` : undefined}
              />
              <StatCard label="P95 latency" value={fmtMs(latency.p95_ms)} icon={Zap} sub={latency.p50_ms ? `P50 ${fmtMs(latency.p50_ms)}` : undefined} />
              <StatCard label="Groq calls / request" value={fmt(overview?.avg_groq_calls_per_request, 2)} icon={Cpu} />
              <StatCard label="Total tokens" value={fmt(overview?.total_tokens)} icon={BarChart3} />
              <StatCard label="429 rate" value={fmtPct(groqStats['429_rate'])} icon={Activity} accent="text-rose-600 dark:text-rose-400" sub={`${fmt(groqStats['429_count'])} hits`} />
              <StatCard label="Tool failure rate" value={fmtPct(toolStats.failure_rate)} icon={Wrench} accent="text-amber-600 dark:text-amber-400" sub={`${fmt(toolStats.failed)} of ${fmt(toolStats.calls)} calls`} />
              <StatCard label="Max-step failures" value={fmt(overview?.max_step_failures)} icon={AlertCircle} />
            </div>
          </Card>

          {/* Traces */}
          <Card
            title="Traces"
            icon={RadioTower}
            description={overview ? `${fmt(overview.requests)} request(s) in range` : undefined}
            action={selectedTrace ? <Badge label={selectedTrace.status} /> : null}
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="overflow-x-auto">
                {traces.length === 0 ? (
                  <Empty message="No AI traces in this range. Send a chat to the Executive or HR agent to generate telemetry." />
                ) : (
                  <table className={miniTableClass}>
                    <thead>
                      <tr>
                        <th className={thClass}>Time</th>
                        <th className={thClass}>Agent</th>
                        <th className={thClass}>Route</th>
                        <th className={thClass}>Status</th>
                        <th className={thClass}>Latency</th>
                        <th className={thClass}>Groq</th>
                        <th className={thClass}>Tools</th>
                        <th className={thClass}>Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traces.map((trace) => (
                        <tr
                          key={trace.trace_id}
                          onClick={() => setSelectedTraceId(trace.trace_id)}
                          className={`cursor-pointer transition ${selectedTraceId === trace.trace_id ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}
                        >
                          <td className={tdClass}><span className="whitespace-nowrap">{fmtShortTime(trace.started_at)}</span></td>
                          <td className={tdClass}>{trace.agent ? <span className="font-medium">{trace.agent}</span> : <span className="text-gray-400">—</span>}</td>
                          <td className={`${tdClass} max-w-[140px] truncate`}>{trace.route || trace.path || '—'}</td>
                          <td className={tdClass}><Badge label={trace.status} /></td>
                          <td className={`${tdClass} font-mono`}>{fmtMs(trace.total_latency_ms)}</td>
                          <td className={tdClass}>{trace.groq_calls}</td>
                          <td className={tdClass}>{trace.tool_calls}</td>
                          <td className={tdClass}>{fmt(trace.total_tokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Trace detail */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">Trace detail</div>
                    <div className="truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">{selectedTraceId || 'Select a trace'}</div>
                  </div>
                  {traceDetail ? (
                    <button type="button" onClick={() => setTraceDetail(null)} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                      <ArrowLeft className="h-3 w-3" /> Close
                    </button>
                  ) : null}
                </div>
                {selectedTrace ? (
                  <>
                    <div className="mb-2 flex flex-wrap gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                      <span>agent: <b>{selectedTrace.agent || '—'}</b></span>
                      <span>· path: <b>{selectedTrace.path || '—'}</b></span>
                      <span>· steps: <b>{selectedTrace.steps}</b></span>
                      <span>· Groq: <b>{selectedTrace.groq_calls}</b></span>
                      <span>· tools: <b>{selectedTrace.tool_calls}</b></span>
                      <span>· model: <b>{selectedTrace.model || '—'}</b></span>
                    </div>
                    {selectedTrace.error_type ? (
                      <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                        <b>{selectedTrace.error_type}</b>{selectedTrace.error_message_safe ? ` — ${selectedTrace.error_message_safe}` : ''}
                      </div>
                    ) : null}
                    {selectedTrace.query_excerpt ? (
                      <div className="mb-2 truncate rounded-lg bg-gray-100 px-2 py-1.5 text-[11px] italic text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        “{selectedTrace.query_excerpt}”
                      </div>
                    ) : null}
                  </>
                ) : null}
                {loadingDetail ? (
                  <div className="flex items-center gap-2 py-6 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading spans…</div>
                ) : traceDetail ? (
                  <SpanTree spans={traceDetail.spans || []} />
                ) : (
                  <p className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">Select a trace row to inspect its end-to-end spans.</p>
                )}
              </div>
            </div>
          </Card>

          {/* Agents + Provider */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Agents" icon={Bot} description="Executive / HR request volume and step usage">
              {agents.length === 0 ? (
                <Empty message="No agent activity in this range." />
              ) : (
                <div className="overflow-x-auto">
                  <table className={miniTableClass}>
                    <thead>
                      <tr>
                        <th className={thClass}>Agent</th>
                        <th className={thClass}>Requests</th>
                        <th className={thClass}>Success</th>
                        <th className={thClass}>P95</th>
                        <th className={thClass}>Steps</th>
                        <th className={thClass}>Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((agent) => (
                        <tr key={agent.agent} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                          <td className={`${tdClass} font-medium`}>{agent.agent}</td>
                          <td className={tdClass}>{fmt(agent.requests)}</td>
                          <td className={tdClass}>{fmtPct(agent.success_rate)}</td>
                          <td className={`${tdClass} font-mono`}>{fmtMs(agent.latency_ms?.p95_ms)}</td>
                          <td className={tdClass}>{fmt(agent.avg_steps, 2)}</td>
                          <td className={tdClass}>
                            {agent.max_step_failures ? <Badge label={`${agent.max_step_failures} max-step`} /> : null}
                            {Object.keys(agent.errors || {}).length ? (
                              <span className="text-rose-500 dark:text-rose-400" title={JSON.stringify(agent.errors)}>{Object.keys(agent.errors).length} type(s)</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Provider (Groq)" icon={Cpu} description="LLM calls, tokens and error rates">
              {!provider || provider.calls === 0 ? (
                <Empty message="No Groq calls in this range." />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatCard label="Calls" value={fmt(provider.calls)} icon={Cpu} />
                  <StatCard label="Total tokens" value={fmt(provider.total_tokens)} icon={BarChart3} />
                  <StatCard label="P95 latency" value={fmtMs(provider.latency_ms?.p95_ms)} icon={Zap} />
                  <StatCard label="Failed" value={fmt(provider.failed)} icon={XCircle} accent="text-rose-600 dark:text-rose-400" />
                  <StatCard label="429" value={fmt(provider['429_count'])} icon={AlertCircle} accent="text-amber-600 dark:text-amber-400" />
                  <StatCard label="400" value={fmt(provider['400_count'])} icon={XCircle} accent="text-rose-600 dark:text-rose-400" />
                  <StatCard label="Timeouts" value={fmt(provider.timeout_count)} icon={Activity} />
                  <StatCard label="Retries" value={fmt(provider.retry_count)} icon={RefreshCw} />
                  <div className="col-span-2 sm:col-span-4">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Models</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {Object.entries(provider.models || {}).map(([model, count]) => (
                        <span key={model} className="rounded-lg bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                          {model} × {count}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Tools */}
          <Card title="Tools" icon={Wrench} description="Per-tool calls, failure rate and P95 latency">
            {tools.length === 0 ? (
              <Empty message="No tool calls in this range." />
            ) : (
              <div className="overflow-x-auto">
                <table className={miniTableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Tool</th>
                      <th className={thClass}>Calls</th>
                      <th className={thClass}>Failure %</th>
                      <th className={thClass}>Failed</th>
                      <th className={thClass}>P95 latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((tool) => (
                      <tr key={tool.tool} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                        <td className={`${tdClass} font-medium`}>{tool.tool}</td>
                        <td className={tdClass}>{fmt(tool.calls)}</td>
                        <td className={`${tdClass} ${(tool.failure_rate || 0) > 10 ? 'text-rose-600 dark:text-rose-400' : ''}`}>{fmtPct(tool.failure_rate)}</td>
                        <td className={tdClass}>{tool.failed}</td>
                        <td className={`${tdClass} font-mono`}>{fmtMs(tool.latency_ms?.p95_ms)}</td>
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
            Observability records are tenant-scoped, admin-only, and privacy-safe: no prompts, no HR/payroll/tool payloads and no secrets are stored. Telemetry is
            retained for <b>30</b> days by default (AI_TELEMETRY_RETENTION_DAYS, configurable) and never affects normal AI execution.
          </div>
        </>
      )}
    </div>
  )
}
