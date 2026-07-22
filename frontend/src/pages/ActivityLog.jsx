import { useState, useEffect, useCallback } from 'react'
import { Clock, CheckSquare, Ticket, MessageSquare, User, Activity, Filter, Calendar, Search, RefreshCw, Zap, TrendingUp, BarChart3 } from 'lucide-react'
import { activityAPI } from '../api/activity'
import { format } from 'date-fns'
import { timeService } from '@/services/timeService'
import { PageHeader, Button, Badge } from '../components/ui'

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

// Activity Item Component
const ActivityItem = ({ activity }) => {
  const getActivityIcon = (type) => {
    if (type?.includes('task')) return CheckSquare
    if (type?.includes('ticket')) return Ticket
    if (type?.includes('comment')) return MessageSquare
    return Clock
  }

  const getActivityColor = (type) => {
    if (type?.includes('task')) {
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    }
    if (type?.includes('ticket')) {
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    }
    if (type?.includes('comment')) {
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    }
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
  }

  const getActivityLabel = (type) => {
    if (type?.includes('task')) return 'Task'
    if (type?.includes('ticket')) return 'Ticket'
    if (type?.includes('comment')) return 'Comment'
    return 'Activity'
  }

  const Icon = getActivityIcon(activity.type)
  const colorClass = getActivityColor(activity.type)
  const label = getActivityLabel(activity.type)

  return (
    <div className="group relative pl-6 py-4 border-b border-gray-100 last:border-0 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
      {/* Timeline line */}
      <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-200 group-last:hidden dark:bg-gray-700"></div>
      
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="relative z-10 flex-shrink-0 mt-1">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${colorClass} shadow-sm ring-4 ring-white dark:ring-gray-800`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 dark:text-white">{activity.title}</p>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                {label}
              </span>
            </div>
            <time className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {format(new Date(activity.timestamp), 'MMM d, h:mm a')}
            </time>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-1">
            <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
              <User className="h-4 w-4 mr-1.5" />
              {activity.user_name || 'System'}
            </div>
            <span className="text-xs text-gray-300 dark:text-gray-600">•</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {format(new Date(activity.timestamp), 'MMM d, yyyy')}
            </span>
          </div>

          {activity.metadata && (
            <div className="mt-2 flex flex-wrap gap-2">
              {activity.metadata.status && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  activity.metadata.status === 'completed' || activity.metadata.status === 'done'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : activity.metadata.status === 'in_progress'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {activity.metadata.status}
                </span>
              )}
              {activity.metadata.priority && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  activity.metadata.priority === 'critical' || activity.metadata.priority === 'urgent'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : activity.metadata.priority === 'high'
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                    : activity.metadata.priority === 'medium'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                }`}>
                  {activity.metadata.priority}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const ActivityLog = () => {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    entity_type: '',
    days: 30,
  })

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true)
      const data = await activityAPI.getTimeline(filters)
      setActivities(data.activities || [])
    } catch (error) {
      console.error('Error loading activities:', error)
      setActivities([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  // Calculate stats
  const totalActivities = activities.length
  const taskActivities = activities.filter(a => a.type?.includes('task')).length
  const ticketActivities = activities.filter(a => a.type?.includes('ticket')).length
  const commentActivities = activities.filter(a => a.type?.includes('comment')).length

  // Get unique users
  const uniqueUsers = new Set(activities.map(a => a.user_name)).size

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-600 via-blue-600 to-cyan-600 p-6 text-white shadow-xl md:p-8">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Activity Log</h1>
              <p className="mt-1 text-indigo-100">Timeline of all activities across your workspace</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={fetchActivities}
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Activities"
          value={totalActivities}
          icon={Activity}
          color="indigo"
          subtitle="All events"
        />
        <StatCard
          label="Tasks"
          value={taskActivities}
          icon={CheckSquare}
          color="blue"
          subtitle="Task events"
        />
        <StatCard
          label="Tickets"
          value={ticketActivities}
          icon={Ticket}
          color="amber"
          subtitle="Ticket events"
        />
        <StatCard
          label="Comments"
          value={commentActivities}
          icon={MessageSquare}
          color="emerald"
          subtitle="Comment events"
        />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
            <span className="font-semibold text-gray-700 dark:text-gray-300">Filters</span>
          </div>
          <div className="flex flex-1 flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <select
                value={filters.entity_type}
                onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="">All Activities</option>
                <option value="task">Tasks Only</option>
                <option value="ticket">Tickets Only</option>
              </select>
            </div>
            <div className="w-full sm:w-48">
              <select
                value={filters.days}
                onChange={(e) => setFilters({ ...filters, days: parseInt(e.target.value) })}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500"></span>
              {taskActivities} tasks
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              {ticketActivities} tickets
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              {commentActivities} comments
            </div>
          </div>
        </div>
      </div>

      {/* Activity List */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <Activity className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Activity Timeline</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {activities.length} activities • {uniqueUsers} users
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-blue-400"></span>
                Tasks
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                Tickets
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                Comments
              </span>
            </div>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-500 dark:text-gray-400">Loading activities...</p>
              </div>
            </div>
          ) : activities.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                <Activity className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">No activities found</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Try adjusting your filters or check back later.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ActivityLog
