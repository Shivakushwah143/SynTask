import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '../store/authStore'
import { dashboardAPI } from '../api/dashboard'
import { reportsAPI } from '../api/reports'
import { tasksAPI } from '../api/tasks'
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  TrendingUp,
  Clock,
  AlertCircle,
  Download,
  Sparkles,
  BarChart3,
  CalendarClock,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import toast from 'react-hot-toast'

const Dashboard = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recentTasks, setRecentTasks] = useState([])
  const [chartData, setChartData] = useState(null)
  const [exporting, setExporting] = useState(false)

  // Build chart-friendly data either from API analytics or from recent tasks fallback
  const taskStatusData = useMemo(() => {
    const statusSource =
      chartData?.tasks?.by_status ||
      recentTasks.reduce((acc, task) => {
        const key = task.status || 'unknown'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

    return Object.entries(statusSource || {}).map(([status, value]) => ({
      name: status.replace('_', ' '),
      value,
    }))
  }, [chartData, recentTasks])

  const taskPriorityData = useMemo(() => {
    const prioritySource =
      chartData?.tasks?.by_priority ||
      recentTasks.reduce((acc, task) => {
        const key = task.priority || 'medium'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

    return Object.entries(prioritySource || {}).map(([priority, count]) => ({
      priority: priority.replace('_', ' '),
      count,
    }))
  }, [chartData, recentTasks])

  const COLORS = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (!stats) {
    return <div>Error loading dashboard</div>
  }

  // Role-specific stats cards
  const getStatsCards = () => {
    if (stats.role === 'super_admin') {
      return [
        {
          name: 'Total Companies',
          value: stats.total_companies || 0,
          change: '+12%',
          icon: Users,
          color: 'bg-blue-500',
        },
        {
          name: 'Active Companies',
          value: stats.active_companies || 0,
          change: '+5%',
          icon: TrendingUp,
          color: 'bg-green-500',
        },
        {
          name: 'Pending Approvals',
          value: stats.pending_companies || 0,
          change: '',
          icon: AlertCircle,
          color: 'bg-yellow-500',
        },
        {
          name: 'Total Subscriptions',
          value: stats.total_subscriptions || 0,
          change: '+8%',
          icon: LayoutDashboard,
          color: 'bg-purple-500',
        },
      ]
    } else if (stats.role === 'company_admin') {
      return [
        {
          name: 'Total Tasks',
          value: stats.total_tasks || 0,
          change: '+12%',
          icon: CheckSquare,
          color: 'bg-blue-500',
        },
        {
          name: 'Active Tasks',
          value: stats.active_tasks || 0,
          change: '-4%',
          icon: Clock,
          color: 'bg-yellow-500',
        },
        {
          name: 'Completed Tasks',
          value: stats.completed_tasks || 0,
          change: '+15%',
          icon: CheckSquare,
          color: 'bg-green-500',
        },
        {
          name: 'Team Members',
          value: stats.total_users || 0,
          change: '',
          icon: Users,
          color: 'bg-purple-500',
        },
      ]
    } else if (stats.role === 'lead') {
      return [
        {
          name: 'My Tasks',
          value: stats.my_tasks || 0,
          change: '',
          icon: CheckSquare,
          color: 'bg-blue-500',
        },
        {
          name: 'Team Tasks',
          value: stats.team_tasks || 0,
          change: '',
          icon: Users,
          color: 'bg-green-500',
        },
        {
          name: 'Active Today',
          value: stats.active_tasks || 0,
          change: '',
          icon: Clock,
          color: 'bg-yellow-500',
        },
      ]
    } else {
      // Employee
      return [
        {
          name: 'My Tasks',
          value: stats.my_tasks || 0,
          change: '',
          icon: CheckSquare,
          color: 'bg-blue-500',
        },
        {
          name: 'Active Tasks',
          value: stats.active_tasks || 0,
          change: '',
          icon: Clock,
          color: 'bg-yellow-500',
        },
        {
          name: 'Completed',
          value: stats.completed_tasks || 0,
          change: '',
          icon: CheckSquare,
          color: 'bg-green-500',
        },
      ]
    }
  }

  const statsCards = getStatsCards()

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Hero / Greeting */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 p-4 sm:p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="flex items-center text-xs sm:text-sm uppercase tracking-[0.18em] text-white/70">
              <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              Alphanexis Control Center
            </p>
            <h1 className="mt-2 text-xl sm:text-2xl lg:text-3xl font-semibold">Welcome back, {user?.first_name}.</h1>
            <p className="mt-2 text-sm sm:text-base text-white/80">
              Monitor tasks, team velocity, and delivery health at a glance.
            </p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="rounded-lg sm:rounded-xl bg-white/10 px-3 sm:px-4 py-2 sm:py-3 backdrop-blur">
              <p className="text-xs uppercase tracking-wide text-white/70">Active Tasks</p>
              <p className="text-xl sm:text-2xl font-semibold">{stats.active_tasks ?? stats.total_tasks ?? 0}</p>
            </div>
            <div className="rounded-lg sm:rounded-xl bg-white/10 px-3 sm:px-4 py-2 sm:py-3 backdrop-blur">
              <p className="text-xs uppercase tracking-wide text-white/70">Completed</p>
              <p className="text-xl sm:text-2xl font-semibold">{stats.completed_tasks ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute right-4 sm:right-12 top-1/2 h-24 w-24 sm:h-32 sm:w-32 -translate-y-1/2 rounded-full bg-white/10 blur-3xl" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {statsCards.map((stat) => (
          <div
            key={stat.name}
            className="card border border-gray-100 shadow-sm hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stat.value}
                </p>
                {stat.change && (
                  <p className="text-sm text-gray-500 mt-1">{stat.change}</p>
                )}
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Status Mix</h3>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              <BarChart3 className="h-4 w-4 mr-1" /> Tasks
            </span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={taskStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={90}
                dataKey="value"
              >
                {taskStatusData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Priority Breakdown</h3>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <CalendarClock className="h-4 w-4" /> Current Snapshot
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={taskPriorityData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="priority" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Export Reports Section */}
      {(stats.role === 'company_admin' || stats.role === 'super_admin') && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Reports</h3>
          <p className="text-sm text-gray-600 mb-3">
            Download the latest delivery snapshot for leadership and finance.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExportTasks}
              disabled={exporting}
              className="btn btn-primary flex items-center"
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Exporting...' : 'Export Tasks (CSV)'}
            </button>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Recent Tasks</h3>
            <p className="text-sm text-gray-500">Latest work moving across your board</p>
          </div>
          <button
            onClick={() => navigate('/tasks')}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            View All
          </button>
        </div>
        <div className="space-y-3">
          {recentTasks.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No recent tasks</p>
          ) : (
            recentTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => navigate('/tasks')}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900 text-sm">{task.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {task.due_date
                      ? `Due: ${new Date(task.due_date).toLocaleDateString()}`
                      : 'No due date'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-primary text-xs capitalize">
                    {task.status?.replace('_', ' ')}
                  </span>
                  {task.priority && (
                    <span className="badge badge-secondary text-xs capitalize">
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
