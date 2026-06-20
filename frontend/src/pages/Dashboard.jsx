import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { dashboardAPI } from '../api/dashboard'
import { reportsAPI } from '../api/reports'
import { tasksAPI } from '../api/tasks'
import {
  CheckSquare,
  CheckCircle2,
  Clock,
  Users,
  TrendingUp,
  AlertCircle,
  LayoutDashboard,
  Download,
  ArrowDown,
  ArrowUp,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import toast from 'react-hot-toast'
import { SkeletonCard, SkeletonTable } from '../components/ui'

// ---- design tokens -------------------------------------------------------
// Accent colors stay constant across themes (they're tinted badges, not
// full-bleed surfaces, so they read fine on both white and near-black cards).
// Everything else (surfaces, text, borders) is theme-aware via Tailwind's
// `dark:` variant, which assumes this project toggles a `dark` class on
// <html> (the standard Tailwind class-strategy approach) — the same switch
// already driving your topbar/sidebar theme toggle.

const ACCENT = {
  blue: '#3b82f6',
  orange: '#f59e0b',
  green: '#22c55e',
  purple: '#8b5cf6',
  red: '#ef4444',
}

const STATUS_META = {
  'to do': { label: 'To do', color: ACCENT.blue },
  todo: { label: 'To do', color: ACCENT.blue },
  pending: { label: 'To do', color: ACCENT.blue },
  'in progress': { label: 'In progress', color: ACCENT.purple },
  in_progress: { label: 'In progress', color: ACCENT.purple },
  'in review': { label: 'In review', color: ACCENT.orange },
  review: { label: 'In review', color: ACCENT.orange },
  completed: { label: 'Completed', color: ACCENT.green },
  done: { label: 'Completed', color: ACCENT.green },
}
const STATUS_ORDER = ['to do', 'todo', 'pending', 'in progress', 'in_progress', 'in review', 'review', 'completed', 'done']

const PRIORITY_META = {
  urgent: { label: 'Urgent', color: ACCENT.red },
  high: { label: 'High', color: ACCENT.blue },
  medium: { label: 'Medium', color: ACCENT.purple },
  low: { label: 'Low', color: ACCENT.green },
}
const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low']

const FALLBACK_COLORS = [ACCENT.blue, ACCENT.purple, ACCENT.orange, ACCENT.green, ACCENT.red, '#06b6d4']

// Card surface: white + soft shadow in light mode, near-black + hairline border in dark mode.
const card =
  'relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ' +
  'dark:border-white/[0.06] dark:bg-[#12141b] dark:shadow-none'

const pill =
  'rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 ' +
  'dark:bg-white/5 dark:text-gray-400'

const Dashboard = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recentTasks, setRecentTasks] = useState([])
  const [chartData, setChartData] = useState(null)
  const [exporting, setExporting] = useState(false)

  const todayLabel = useMemo(
    () =>
      new Date()
        .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        .toUpperCase(),
    []
  )

  // Build chart-friendly data either from API analytics or from recent tasks fallback
  const taskStatusData = useMemo(() => {
    const statusSource =
      chartData?.tasks?.by_status ||
      recentTasks.reduce((acc, task) => {
        const key = (task.status || 'unknown').toLowerCase()
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

    const entries = Object.entries(statusSource || {})
    entries.sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a[0].toLowerCase())
      const bi = STATUS_ORDER.indexOf(b[0].toLowerCase())
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

    return entries.map(([status, value], index) => {
      const meta = STATUS_META[status.toLowerCase()]
      return {
        key: status,
        name: meta?.label || status.replace(/_/g, ' '),
        value,
        color: meta?.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
      }
    })
  }, [chartData, recentTasks])

  const taskPriorityData = useMemo(() => {
    const prioritySource =
      chartData?.tasks?.by_priority ||
      recentTasks.reduce((acc, task) => {
        const key = (task.priority || 'medium').toLowerCase()
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

    const entries = Object.entries(prioritySource || {})
    entries.sort((a, b) => {
      const ai = PRIORITY_ORDER.indexOf(a[0].toLowerCase())
      const bi = PRIORITY_ORDER.indexOf(b[0].toLowerCase())
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

    return entries.map(([priority, count], index) => {
      const meta = PRIORITY_META[priority.toLowerCase()]
      return {
        key: priority,
        name: meta?.label || priority.replace(/_/g, ' '),
        count,
        color: meta?.color || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
      }
    })
  }, [chartData, recentTasks])

  const totalStatusTasks = taskStatusData.reduce((sum, d) => sum + d.value, 0)
  const maxPriorityCount = Math.max(1, ...taskPriorityData.map((d) => d.count))

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)

      // Fetch dashboard stats
      const statsData = await dashboardAPI.getStats()
      setStats(statsData)

      // Fetch recent tasks
      const tasksData = await tasksAPI.listTasks({ limit: 8 })
      setRecentTasks(tasksData.tasks || [])

      // Fetch chart data (Company Admin and above)
      if (statsData.role === 'company_admin' || statsData.role === 'super_admin') {
        try {
          const charts = await reportsAPI.getAnalyticsCharts('month')
          setChartData(charts)
        } catch (error) {
          console.error('Error loading charts:', error)
        }
      }
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExportTasks = async () => {
    try {
      setExporting(true)
      await reportsAPI.exportTasks('csv')
      toast.success('Tasks report exported successfully')
    } catch (error) {
      toast.error('Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-4 sm:p-6 lg:p-8" role="status" aria-label="Loading dashboard">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <SkeletonCard key={item} lines={2} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
        <SkeletonTable rows={5} cols={4} />
      </div>
    )
  }

  if (!stats) {
    return <div className="p-6 text-slate-500 dark:text-gray-400">Error loading dashboard</div>
  }

  // Role-specific stats cards (label, value, subtitle, icon, accent color)
  const getStatsCards = () => {
    if (stats.role === 'super_admin') {
      return [
        {
          name: 'Total Companies',
          value: stats.total_companies || 0,
          subtitle: { type: 'trend', dir: 'up', text: '12% this month' },
          icon: Users,
          accent: 'blue',
        },
        {
          name: 'Active Companies',
          value: stats.active_companies || 0,
          subtitle: { type: 'trend', dir: 'up', text: '5% this month' },
          icon: TrendingUp,
          accent: 'green',
        },
        {
          name: 'Pending Approvals',
          value: stats.pending_companies || 0,
          subtitle: { type: 'plain', text: 'Awaiting review' },
          icon: AlertCircle,
          accent: 'orange',
        },
        {
          name: 'Total Subscriptions',
          value: stats.total_subscriptions || 0,
          subtitle: { type: 'trend', dir: 'up', text: '8% this month' },
          icon: LayoutDashboard,
          accent: 'purple',
        },
      ]
    } else if (stats.role === 'company_admin') {
      return [
        {
          name: 'Total Tasks',
          value: stats.total_tasks || 0,
          subtitle: { type: 'trend', dir: 'up', text: '12% this month' },
          icon: CheckSquare,
          accent: 'blue',
        },
        {
          name: 'Active Tasks',
          value: stats.active_tasks || 0,
          subtitle: { type: 'trend', dir: 'down', text: '4% this month' },
          icon: Clock,
          accent: 'orange',
        },
        {
          name: 'Completed Tasks',
          value: stats.completed_tasks || 0,
          subtitle: { type: 'trend', dir: 'up', text: '15% this month' },
          icon: CheckCircle2,
          accent: 'green',
        },
        {
          name: 'Team Members',
          value: stats.total_users || 0,
          subtitle: { type: 'plain', text: 'Across your company' },
          icon: Users,
          accent: 'purple',
        },
      ]
    } else if (stats.role === 'lead') {
      return [
        {
          name: 'My Tasks',
          value: stats.my_tasks || 0,
          subtitle: { type: 'plain', text: stats.my_tasks ? 'Assigned to you' : 'No tasks assigned' },
          icon: CheckSquare,
          accent: 'blue',
        },
        {
          name: 'Team Tasks',
          value: stats.team_tasks || 0,
          subtitle: { type: 'plain', text: 'Across your team' },
          icon: Users,
          accent: 'purple',
        },
        {
          name: 'Active Today',
          value: stats.active_tasks || 0,
          subtitle: { type: 'plain', text: 'In progress now' },
          icon: Clock,
          accent: 'orange',
        },
      ]
    } else {
      // Employee
      return [
        {
          name: 'My Tasks',
          value: stats.my_tasks || 0,
          subtitle: { type: 'plain', text: stats.my_tasks ? 'Assigned to you' : 'No tasks assigned' },
          icon: CheckCircle2,
          accent: 'blue',
        },
        {
          name: 'Active Tasks',
          value: stats.active_tasks || 0,
          subtitle: { type: 'trend', dir: 'up', text: '1 since yesterday' },
          icon: Clock,
          accent: 'orange',
        },
        {
          name: 'Completed',
          value: stats.completed_tasks || 0,
          subtitle: { type: 'plain', text: 'This week' },
          icon: CheckCircle2,
          accent: 'green',
        },
      ]
    }
  }

  const statsCards = getStatsCards()

  return (
    <div className="space-y-6 sm:space-y-8 p-4 sm:p-6 lg:p-8 text-slate-900 dark:text-white">
      {/* Greeting */}
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-500">
          {todayLabel}
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
          Welcome back, {user?.first_name || 'there'}.
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-gray-400">
          Here&apos;s what&apos;s happening across your workspace today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className={`grid grid-cols-1 gap-4 sm:gap-5 sm:grid-cols-2 ${statsCards.length > 3 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {statsCards.map((stat) => (
          <div key={stat.name} className={`${card} p-5`}>
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: ACCENT[stat.accent] }} />
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">
                {stat.name}
              </p>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: `${ACCENT[stat.accent]}1A`, color: ACCENT[stat.accent] }}
              >
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
            <div className="mt-1.5 text-sm text-slate-500 dark:text-gray-500">
              {stat.subtitle.type === 'trend' ? (
                <span className="inline-flex items-center gap-1">
                  {stat.subtitle.dir === 'up' ? (
                    <ArrowUp className="h-3.5 w-3.5 text-green-600 dark:text-green-500" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5 text-red-600 dark:text-red-500" />
                  )}
                  <span className={stat.subtitle.dir === 'up' ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}>
                    {stat.subtitle.text.split(' ')[0]}
                  </span>
                  <span className="text-slate-500 dark:text-gray-500">{stat.subtitle.text.split(' ').slice(1).join(' ')}</span>
                </span>
              ) : (
                stat.subtitle.text
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Status mix */}
        <div className={`${card} p-5 sm:p-6`}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Status mix</h3>
            <span className={pill}>{totalStatusTasks} tasks total</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative h-[150px] w-[150px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={taskStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {taskStatusData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1a1c24', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                    itemStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{totalStatusTasks}</span>
                <span className="text-xs text-slate-500 dark:text-gray-500">tasks</span>
              </div>
              <button
                onClick={handleExportTasks}
                disabled={exporting}
                title="Export tasks"
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 shadow-md hover:bg-slate-200 transition-colors disabled:opacity-50 dark:bg-[#1f212b] dark:text-gray-300 dark:hover:bg-[#2a2c38]"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3">
              {taskStatusData.map((entry) => (
                <div key={entry.key} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-700 dark:text-gray-300">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.name}
                  </span>
                  <span className="font-medium text-slate-500 dark:text-gray-400">
                    {totalStatusTasks ? Math.round((entry.value / totalStatusTasks) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Priority breakdown */}
        <div className={`${card} p-5 sm:p-6`}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Priority breakdown</h3>
            <span className={pill}>Current snapshot</span>
          </div>

          <div className="flex h-[170px] items-end justify-around gap-4 px-2">
            {taskPriorityData.map((entry) => (
              <div key={entry.key} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-sm font-semibold text-slate-700 dark:text-gray-300">{entry.count}</span>
                <div
                  className="w-full max-w-[56px] rounded-t-lg transition-all"
                  style={{
                    height: `${Math.max(24, (entry.count / maxPriorityCount) * 110)}px`,
                    backgroundColor: entry.color,
                  }}
                />
                <span className="text-xs text-slate-500 dark:text-gray-500">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Export Reports Section */}
      {(stats.role === 'company_admin' || stats.role === 'super_admin') && (
        <div className={`${card} p-5 sm:p-6`}>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Export reports</h3>
          <p className="text-sm text-slate-500 dark:text-gray-400 mb-4">
            Download the latest delivery snapshot for leadership and finance.
          </p>
          <button
            onClick={handleExportTasks}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export Tasks (CSV)'}
          </button>
        </div>
      )}

      {/* Recent Activity */}
      <div className={`${card} p-5 sm:p-6`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Recent Tasks</h3>
            <p className="text-sm text-slate-500 dark:text-gray-500">Latest work moving across your board</p>
          </div>
          <button
            onClick={() => navigate('/tasks')}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-400"
          >
            View All
          </button>
        </div>
        <div className="space-y-2.5">
          {recentTasks.length === 0 ? (
            <p className="text-slate-500 dark:text-gray-500 text-sm text-center py-6">No recent tasks</p>
          ) : (
            recentTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => navigate('/tasks')}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3.5 cursor-pointer hover:bg-slate-100 transition-colors dark:border-white/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{task.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-500">
                    {task.due_date ? `Due: ${new Date(task.due_date).toLocaleDateString()}` : 'No due date'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-medium capitalize"
                    style={{
                      backgroundColor: `${STATUS_META[task.status?.toLowerCase()]?.color || ACCENT.blue}1A`,
                      color: STATUS_META[task.status?.toLowerCase()]?.color || ACCENT.blue,
                    }}
                  >
                    {task.status?.replace('_', ' ')}
                  </span>
                  {task.priority && (
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-medium capitalize"
                      style={{
                        backgroundColor: `${PRIORITY_META[task.priority?.toLowerCase()]?.color || ACCENT.purple}1A`,
                        color: PRIORITY_META[task.priority?.toLowerCase()]?.color || ACCENT.purple,
                      }}
                    >
                      {task.priority}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard