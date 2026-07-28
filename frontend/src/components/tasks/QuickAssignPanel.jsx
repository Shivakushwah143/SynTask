import { useState } from 'react'
import { Plus, User, Send, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { tasksAPI } from '../../api/tasks'
import { Button, inputClassName } from '../ui'

export default function QuickAssignPanel({ users, onTaskCreated }) {
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleQuickAssign = async (e) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      toast.error('Task title is required')
      return
    }
    if (!assigneeId) {
      toast.error('Select a team member to assign to')
      return
    }

    try {
      setSubmitting(true)
      const payload = {
        title: trimmed,
        assigned_to: assigneeId,
        priority: 'medium',
      }
      await tasksAPI.createTask(payload)
      toast.success(`Task assigned successfully`)
      // Reset form state and release loading BEFORE calling the parent refresh callback
      // to avoid the button getting stuck in a loading state if the parent re-renders.
      setSubmitting(false)
      setTitle('')
      setAssigneeId('')
      onTaskCreated?.()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create task')
      setSubmitting(false)
    }
  }

  const selectedUser = users.find((u) => u.id === assigneeId)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
      <div className="border-b border-gray-200 bg-gradient-to-r from-emerald-50/50 to-white px-4 py-3 dark:border-gray-700 dark:from-emerald-950/20 dark:to-gray-800">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-emerald-100 p-1.5 dark:bg-emerald-900/30">
            <Plus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quick Assign</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Create and assign a task in one step</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleQuickAssign} className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className={`${inputClassName} text-sm`}
              disabled={submitting}
              maxLength={200}
            />
          </div>
          <div className="w-full sm:w-56">
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className={inputClassName}
              disabled={submitting}
            >
              <option value="">Assign to...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.first_name} {u.last_name} ({u.role || 'user'})
                </option>
              ))}
            </select>
          </div>
          <Button
            type="submit"
            loading={submitting}
            className="w-full sm:w-auto shrink-0"
            disabled={!title.trim() || !assigneeId}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Assign
          </Button>
        </div>

        {selectedUser && title.trim() && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>
              Task <strong>&ldquo;{title.trim()}&rdquo;</strong> will be assigned to{' '}
              <strong>{selectedUser.first_name} {selectedUser.last_name}</strong>
            </span>
          </div>
        )}
      </form>
    </div>
  )
}
