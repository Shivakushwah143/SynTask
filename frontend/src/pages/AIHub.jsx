import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  LibraryBig,
  Lightbulb,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { aiAPI } from '../api/ai'
import { Button, EmptyState, PageHeader, Badge } from '../components/ui'

const QUICK_ACTIONS = [
  { label: 'Open AI Chat', path: '/ai-assistant', icon: MessageSquareText },
  { label: 'Open Creative Director', path: '/creative-director', icon: Wand2 },
  { label: 'Open Strategist', path: '/ai-prioritization', icon: Sparkles },
  { label: 'Review reports', path: '/reports', icon: LibraryBig },
]

const EMPLOYEES = [
  {
    id: 'creative-director',
    title: 'Creative Director',
    description: 'Reviews assets, compares versions, and surfaces approval risks.',
    status: 'active',
    path: '/creative-director',
  },
  {
    id: 'marketing-strategist',
    title: 'Marketing Strategist',
    description: 'Prioritizes campaign actions and flags delivery pressure.',
    status: 'active',
    path: '/ai-prioritization',
  },
  {
    id: 'workspace-assistant',
    title: 'Workspace Assistant',
    description: 'Answers questions using verified project, task, and conversation context.',
    status: 'listening',
    path: '/ai-assistant',
  },
]

export default function AIHub() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await aiAPI.listLogs(12)
      setLogs(Array.isArray(response) ? response : [])
    } catch (error) {
      toast.error('Failed to load AI activity')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await loadData()
    } finally {
      setRefreshing(false)
    }
  }

  const metrics = useMemo(() => {
    const successful = logs.filter((item) => item.status === 'success').length
    const pending = logs.filter((item) => item.status !== 'success').length
    const fallback = logs.filter((item) => item.fallback_used).length
    return [
      { label: 'Active employees', value: EMPLOYEES.length },
      { label: 'Recent actions', value: logs.length },
      { label: 'Successful runs', value: successful },
      { label: 'Fallbacks', value: fallback || pending },
    ]
  }, [logs])

  const activityItems = useMemo(() => logs.map((entry) => ({
    ...entry,
    timestamp: entry.created_at ? format(new Date(entry.created_at), 'MMM d, HH:mm') : 'Just now',
  })), [logs])

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Hub"
        description="Command center for AI employees, approvals, knowledge updates, and verified recommendations."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge label="AI-first" colorKey="active" />
            <Button variant="secondary" size="sm" onClick={handleRefresh} loading={refreshing}>
              <Clock3 className="h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => navigate('/ai-assistant')}>
              <MessageSquareText className="h-4 w-4" />
              Open AI Chat
            </Button>
          </div>
        )}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <Panel title="AI Employees" icon={Bot} description="Specialized AI surfaces that operate as teammates, not generic prompts.">
            <div className="grid gap-3 md:grid-cols-3">
              {EMPLOYEES.map((employee) => (
                <button
                  key={employee.id}
                  type="button"
                  onClick={() => navigate(employee.path)}
                  className="rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{employee.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{employee.description}</p>
                    </div>
                    <Badge label={employee.status} colorKey={employee.status === 'active' ? 'active' : 'scheduled'} />
                  </div>
                  <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-primary-600 dark:text-primary-300">
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Pending approvals" icon={ShieldCheck} description="Work that needs a human decision before AI can continue.">
            {loading ? (
              <EmptyState title="Loading approvals" description="Fetching the latest AI activity." />
            ) : logs.filter((item) => item.status !== 'success').length ? (
              <div className="space-y-3">
                {logs.filter((item) => item.status !== 'success').slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.feature || 'AI action'}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {item.provider || 'System'} • {item.timestamp}
                        </div>
                      </div>
                      <Badge label={item.status || 'pending'} colorKey={item.status === 'success' ? 'active' : 'pending'} />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                      {item.error_message || 'Requires review before the workflow can move forward.'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} title="No pending approvals" description="AI outputs are clear to proceed." />
            )}
          </Panel>

          <Panel title="Recommendations" icon={Lightbulb} description="High-value follow-up actions based on recent AI usage.">
            <div className="grid gap-3 md:grid-cols-2">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => navigate(action.path)}
                    className="rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg dark:border-gray-800 dark:bg-gray-900"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{action.label}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Open verified workflow</div>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </button>
                )
              })}
            </div>
          </Panel>
        </section>

        <aside className="space-y-6">
          <Panel title="Recent AI activity" icon={Clock3} description="Operational history from the last AI runs.">
            {activityItems.length ? (
              <div className="space-y-3">
                {activityItems.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.feature || 'AI feature'}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.timestamp}</div>
                      </div>
                      <Badge label={item.status || 'pending'} colorKey={item.status === 'success' ? 'active' : 'pending'} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Badge label={item.provider || 'provider'} colorKey="info" />
                      {item.model ? <Badge label={item.model} colorKey="scheduled" /> : null}
                      {item.fallback_used ? <Badge label="Fallback" colorKey="warning" /> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Clock3} title="No activity yet" description="AI activity will appear after the first workflow runs." />
            )}
          </Panel>

          <Panel title="Knowledge updates" icon={LibraryBig} description="Signals that keep AI grounded in live workspace context.">
            {activityItems.length ? (
              <div className="space-y-3">
                {activityItems.slice(0, 3).map((item) => (
                  <div key={`${item.id}-knowledge`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.feature || 'Knowledge signal'}</div>
                    <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                      AI context updated from the latest verified run. Use this signal to keep responses aligned with current work.
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={LibraryBig} title="No knowledge updates" description="Create or review work to populate AI memory signals." />
            )}
          </Panel>
        </aside>
      </div>
    </div>
  )
}

function MetricCard({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
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
