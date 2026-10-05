import { useNavigate } from 'react-router-dom'
import { useTasks } from '@/hooks/useTasks'
import CarryForwardDueDate from './CarryForwardDueDate'

const statuses = [
  { id: 'todo', label: 'To Do' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'revision_required', label: 'Revision' },
  { id: 'approved', label: 'Approved' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
]

export default function BoardView() {
  const navigate = useNavigate()
  const { data, isLoading } = useTasks()
  const tasks = data?.tasks || []

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statuses.map((status) => (
          <div key={status.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-3 h-4 w-20 animate-pulse rounded bg-gray-200" />
            <div className="space-y-2">
              <div className="h-16 animate-pulse rounded bg-gray-200" />
              <div className="h-16 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {statuses.map((status) => {
        const statusTasks = tasks.filter((task) => task.status === status.id)

        return (
          <div key={status.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">{status.label}</h3>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500">
                {statusTasks.length}
              </span>
            </div>
            <div className="space-y-2">
              {statusTasks.length === 0 ? (
                <div className="rounded border border-dashed border-gray-300 bg-white p-3 text-center text-xs text-gray-500">
                  No tasks
                </div>
              ) : (
                statusTasks.map((task) => (
                  <div
                    key={task.id || task._id}
                    onClick={() => navigate(`/tasks/${task.id || task._id}`)}
                    className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-md"
                  >
                    <p className="text-sm font-medium text-gray-800">{task.title}</p>
                    {task.priority && (
                      <p className="mt-1 text-xs text-gray-500">Priority: {task.priority}</p>
                    )}
                    {(task.due_date || task.carry_forward_due_date) && (
                      <p className="mt-1 text-xs text-gray-500">
                        Due: <CarryForwardDueDate task={task} />
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
