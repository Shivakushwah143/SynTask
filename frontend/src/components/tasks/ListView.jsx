import { useNavigate } from 'react-router-dom'
import { useTasks } from '@/hooks/useTasks'
import { timeService } from '@/services/timeService'

export default function ListView() {
  const navigate = useNavigate()
  const { data, isLoading } = useTasks()
  const tasks = data?.tasks || []

  if (isLoading) {
    return <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading tasks...</div>
  }

  return (
    <div className="viewport-scroll-x rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Title</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Priority</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Due Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {tasks.length === 0 ? (
            <tr>
              <td colSpan="4" className="px-4 py-6 text-center text-sm text-gray-500">
                No tasks yet.
              </td>
            </tr>
          ) : (
            tasks.map((task) => (
              <tr
                key={task.id || task._id}
                onClick={() => navigate(`/tasks/${task.id || task._id}`)}
                className="cursor-pointer hover:bg-gray-50"
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{task.title}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{task.status}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{task.priority || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {task.due_date ? timeService.format(task.due_date, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
