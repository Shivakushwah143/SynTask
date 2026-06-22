import { useState, useEffect } from 'react'
import { Clock, CheckSquare, Ticket, MessageSquare, User } from 'lucide-react'
import { activityAPI } from '../api/activity'
import { format } from 'date-fns'

const ActivityLog = () => {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    entity_type: 'all',
    days: 30,
  })




  
  useEffect(() => {
    fetchActivities()
  }, [filters])

  const fetchActivities = async () => {
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
  }

  const getActivityIcon = (type) => {
    if (type.includes('task')) {
      return CheckSquare
    } else if (type.includes('ticket')) {
      return Ticket
    } else if (type.includes('comment')) {
      return MessageSquare
    }
    return Clock
  }

  const getActivityColor = (type) => {
    if (type.includes('task')) {
      return 'text-blue-600 bg-blue-100'
    } else if (type.includes('ticket')) {
      return 'text-yellow-600 bg-yellow-100'
    } else if (type.includes('comment')) {
      return 'text-green-600 bg-green-100'
    }
    return 'text-gray-600 bg-gray-100'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Activity Log</h1>
          <p className="text-gray-600 text-xs mt-0.5">Timeline of all activities</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:space-x-4">
          <select
            value={filters.entity_type}
            onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })}
            className="input"
          >
            <option value="all">All Activities</option>
            <option value="task">Tasks Only</option>
            <option value="ticket">Tickets Only</option>
          </select>
          <select
            value={filters.days}
            onChange={(e) => setFilters({ ...filters, days: parseInt(e.target.value) })}
            className="input"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="space-y-4">
          {activities.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No activities found
            </div>
          ) : (
            activities.map((activity) => {
              const Icon = getActivityIcon(activity.type)
              const colorClass = getActivityColor(activity.type)
              
              return (
                <div key={activity.id} className="flex items-start space-x-4 pb-4 border-b border-gray-200 last:border-0">
                  <div className={`p-2 rounded-lg ${colorClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900">{activity.title}</p>
                      <span className="text-xs text-gray-500">
                        {format(new Date(activity.timestamp), 'MMM d, h:mm a')}
                      </span>
                    </div>
                    <div className="flex items-center mt-1 text-sm text-gray-600">
                      <User className="h-4 w-4 mr-1" />
                      {activity.user_name || 'System'}
                    </div>
                    {activity.metadata && (
                      <div className="mt-2 flex space-x-2">
                        {activity.metadata.status && (
                          <span className="badge badge-secondary text-xs">
                            {activity.metadata.status}
                          </span>
                        )}
                        {activity.metadata.priority && (
                          <span className="badge badge-primary text-xs">
                            {activity.metadata.priority}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default ActivityLog

