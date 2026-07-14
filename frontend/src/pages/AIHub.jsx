import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Clock3,
  LibraryBig,
  Lightbulb,
  MessageSquareText,
  Sparkles,
  Wand2,
  Activity,
  Zap,
  Users,
  TrendingUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { aiAPI } from '../api/ai'
import { Button, PageHeader, Badge } from '../components/ui'

const QUICK_ACTIONS = [
  { label: 'Open AI Chat', path: '/ai-assistant', icon: MessageSquareText, color: 'blue' },
  { label: 'Creative Director', path: '/creative-director', icon: Wand2, color: 'purple' },
  { label: 'Marketing Strategist', path: '/ai-prioritization', icon: Sparkles, color: 'green' },
  { label: 'Review reports', path: '/reports', icon: LibraryBig, color: 'orange' },
]

const EMPLOYEES = [
  {
    id: 'creative-director',
    title: 'Creative Director',
    description: 'Reviews assets, compares versions, and surfaces approval risks.',
    status: 'active',
    path: '/creative-director',
    icon: Wand2,
  },
  {
    id: 'marketing-strategist',
    title: 'Marketing Strategist',
    description: 'Prioritizes campaign actions and flags delivery pressure.',
    status: 'active',
    path: '/ai-prioritization',
    icon: Sparkles,
  },
  {
    id: 'workspace-assistant',
    title: 'Workspace Assistant',
    description: 'Answers questions using verified project, task, and conversation context.',
    status: 'listening',
    path: '/ai-assistant',
    icon: MessageSquareText,
  },
]

export default function AIHub() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const response = await aiAPI.listLogs(12)
      setLogs(Array.isArray(response) ? response : [])
    } catch (error) {
      toast.error('Failed to load AI activity')
      setLogs([])
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
    return [
      { 
        label: 'Active AI Employees', 
        value: EMPLOYEES.length,
        icon: Users,
        description: 'Working alongside your team'
      },
      { 
        label: 'Recent Actions', 
        value: logs.length,
        icon: Activity,
        description: 'Last 24 hours'
      },
      { 
        label: 'Success Rate', 
        value: logs.length > 0 ? `${Math.round((successful / logs.length) * 100)}%` : '—',
        icon: TrendingUp,
        description: 'AI task completion'
      },
      { 
        label: 'Pending Tasks', 
        value: pending,
        icon: Clock3,
        description: 'In progress'
      },
    ]
  }, [logs])

  return (
    <div className="space-y-8 p-4">
      <PageHeader
        title="AI Hub"
        description="Your command center for AI employees, approvals, and verified recommendations."
        actions={(
          <div className="flex flex-wrap items-center gap-3">
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

      {/* Metrics Grid - More visual cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="card p-5 bg-surface dark:bg-black/80 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                  {metric.label}
                </p>
                <p className="mt-2 text-3xl font-semibold text-text-primary dark:text-text-primary">
                  {metric.value}
                </p>
                <p className="mt-1 text-xs text-text-muted dark:text-text-secondary">
                  {metric.description}
                </p>
              </div>
              <div className="rounded-xl bg-primary-50 p-2 dark:bg-primary-950/40">
                <metric.icon className="h-5 w-5 text-primary-600 dark:text-primary-300" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* AI Employees - Full width on mobile, 2 cols on large */}
        <div className="lg:col-span-2">
          <div className="card p-6 bg-surface dark:bg-black/85">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary dark:text-text-primary">
                  AI Employees
                </h2>
                <p className="text-sm text-text-muted dark:text-text-secondary">
                  Specialized AI teammates at your service
                </p>
              </div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
              {EMPLOYEES.map((employee) => {
                const Icon = employee.icon
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => navigate(employee.path)}
                    className="group relative rounded-2xl border border-border bg-surface p-5 text-left transition-all hover:-translate-y-1 hover:border-primary-300 hover:bg-surface-muted hover:shadow-lg dark:border-border dark:bg-black/40 dark:hover:bg-white/5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-text-primary dark:text-text-primary truncate">
                            {employee.title}
                          </h3>
                          <Badge 
                            label={employee.status} 
                            colorKey={employee.status === 'active' ? 'active' : 'scheduled'} 
                          />
                        </div>
                        <p className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary line-clamp-2">
                          {employee.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary-600 dark:text-primary-300 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Open workspace</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Quick Actions - 1 col on large */}
        <div className="lg:col-span-1">
          <div className="card p-6 bg-surface dark:bg-black/85 h-full">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary dark:text-text-primary">
                  Quick Actions
                </h2>
                <p className="text-sm text-text-muted dark:text-text-secondary">
                  High-value workflows
                </p>
              </div>
            </div>
            
            <div className="space-y-3">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => navigate(action.path)}
                    className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:bg-surface-muted hover:shadow-lg dark:border-border dark:bg-black/40 dark:hover:bg-white/5"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text-primary dark:text-text-primary">
                        {action.label}
                      </div>
                      <div className="text-xs text-text-muted dark:text-text-secondary truncate">
                        Click to open
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-1" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Recommendations Section - Full width */}
      <div className="card p-6 bg-surface dark:bg-black/85">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
            <Lightbulb className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary dark:text-text-primary">
              AI Recommendations
            </h2>
            <p className="text-sm text-text-muted dark:text-text-secondary">
              Smart suggestions based on your recent activity
            </p>
          </div>
        </div>
        
        <div className="grid gap-3 md:grid-cols-4">
          {['Review pending approvals', 'Analyze campaign performance', 'Optimize content strategy', 'Generate weekly report'].map((suggestion) => (
            <div
              key={suggestion}
              className="rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary-300 hover:bg-surface-muted dark:border-border dark:bg-black/40 dark:hover:bg-white/5 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                  <Sparkles className="h-4 w-4" />
                </div>
                <span className="text-sm text-text-primary dark:text-text-primary">{suggestion}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
