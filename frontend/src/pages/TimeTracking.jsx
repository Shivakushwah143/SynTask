import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Clock, Plus, Trash2 } from 'lucide-react'
import { useConfirmation } from '../hooks/useConfirmation'
import { timeTrackingApi } from '../api/timeTracking'
import { tasksAPI } from '../api/tasks'
import toast from 'react-hot-toast'
import { timeService } from '@/services/timeService'

const TimeTracking = () => {
  const { confirm } = useConfirmation()
  const [tasks, setTasks] = useState([])
  const [selectedTask, setSelectedTask] = useState(null)
  const [timeLogs, setTimeLogs] = useState([])
  const [timeSummary, setTimeSummary] = useState(null)
  const [showLogModal, setShowLogModal] = useState(false)
  const [formData, setFormData] = useState({
    hours: '',
    minutes: '0',
    description: '',
    is_billable: false,
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingLogId, setDeletingLogId] = useState(null)

  useEffect(() => {
    loadTasks()
  }, [])

  useEffect(() => {
    if (selectedTask) {
      loadTimeData(selectedTask)
    }
  }, [selectedTask])

  const loadTasks = async () => {
    try {
      setLoading(true)
      const response = await tasksAPI.listTasks()
      setTasks(response.tasks || [])
    } catch (error) {
      toast.error('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  const loadTimeData = async (taskId) => {
    try {
      const [logsResponse, summaryResponse] = await Promise.all([
        timeTrackingApi.getTimeLogs(taskId),
        timeTrackingApi.getTimeSummary(taskId),
      ])
      setTimeLogs(logsResponse.data.time_logs || [])
      setTimeSummary(summaryResponse.data)
    } catch (error) {
      toast.error('Failed to load time data')
    }
  }

  const handleLogTime = async (e) => {
    e.preventDefault()
    if (!selectedTask || submitting) return

    try {
      setSubmitting(true)
      await timeTrackingApi.logTime(selectedTask, formData)
      toast.success('Time logged successfully')
      setShowLogModal(false)
      setFormData({ hours: '', minutes: '0', description: '', is_billable: false })
      await loadTimeData(selectedTask)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to log time')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteLog = async (logId) => {
    if (deletingLogId) return
    const confirmed = await confirm({
      title: 'Delete Time Log',
      message: 'Are you sure you want to delete this time log?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDangerous: true,
    })
    if (!confirmed) return

    try {
      setDeletingLogId(logId)
      await timeTrackingApi.deleteTimeLog(logId)
      toast.success('Time log deleted')
      if (selectedTask) {
        await loadTimeData(selectedTask)
      }
    } catch (error) {
      toast.error('Failed to delete time log')
    } finally {
      setDeletingLogId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Time Tracking</h1>
        <p className="text-gray-600 mt-1">Track time spent on tasks</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Task List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold mb-4">Select Task</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedTask === task.id
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">{task.title}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {task.status} • {task.priority}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Time Logs and Summary */}
        <div className="lg:col-span-2">
          {selectedTask ? (
            <>
              {/* Summary Card */}
              {timeSummary && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="font-semibold">Time Summary</h2>
                    <button
                      onClick={() => setShowLogModal(true)}
                      className="flex items-center px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Log Time
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-gray-600">Total Hours</div>
                      <div className="text-2xl font-bold">{timeSummary.total_hours.toFixed(1)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Billable Hours</div>
                      <div className="text-2xl font-bold">{timeSummary.total_billable_hours.toFixed(1)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600">Entries</div>
                      <div className="text-2xl font-bold">{timeSummary.total_entries}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Time Logs */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="font-semibold mb-4">Time Logs</h2>
                {timeLogs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Clock className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                    <p>No time logs yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {timeLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex justify-between items-center p-3 border border-gray-200 rounded-lg"
                      >
                        <div>
                          <div className="font-medium">{log.user_name}</div>
                          <div className="text-sm text-gray-600">
                            {log.hours} hours
                            {log.is_billable && (
                              <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                                Billable
                              </span>
                            )}
                          </div>
                          {log.description && (
                            <div className="text-sm text-gray-500 mt-1">{log.description}</div>
                          )}
                          <div className="text-xs text-gray-400 mt-1">
                            {timeService.formatDateOnly(log.date)}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={Boolean(deletingLogId)}
                          onClick={() => handleDeleteLog(log.id)}
                          aria-busy={deletingLogId === log.id || undefined}
                          aria-label={deletingLogId === log.id ? 'Deleting time log' : 'Delete time log'}
                          className="p-2 text-red-600 hover:bg-red-50 rounded disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Select a task to view time logs</p>
            </div>
          )}
        </div>
      </div>

      {/* Log Time Modal */}
      {showLogModal && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Log Time</h2>
            <form onSubmit={handleLogTime}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Hours
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      required
                      value={formData.hours}
                      onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Minutes
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={formData.minutes}
                      onChange={(e) => setFormData({ ...formData, minutes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="billable"
                    checked={formData.is_billable}
                    onChange={(e) => setFormData({ ...formData, is_billable: e.target.checked })}
                    className="mr-2"
                  />
                  <label htmlFor="billable" className="text-sm text-gray-700">
                    Mark as billable
                  </label>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  disabled={submitting}
                  aria-busy={submitting || undefined}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Logging...' : 'Log Time'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TimeTracking
