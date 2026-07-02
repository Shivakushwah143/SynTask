import { useQuery, useMutation, useQueryClient } from 'react-query'
import { tasksAPI } from '@/api/tasks'

export function useTasks(filters = {}) {
  return useQuery(['tasks', filters], () => tasksAPI.listTasks(filters), {
    staleTime: 5000,
    keepPreviousData: true,
  })
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()

  return useMutation(
    ({ id, status }) => tasksAPI.updateTaskStatus(id, status),
    {
      onMutate: async ({ id, status }) => {
        await queryClient.cancelQueries(['tasks'])

        const previousTasks = queryClient.getQueryData(['tasks'])
        queryClient.setQueryData(['tasks'], (old) => {
          if (!old?.tasks) return old
          return {
            ...old,
            tasks: old.tasks.map((task) => {
              const taskId = task.id || task._id
              return taskId === id ? { ...task, status } : task
            }),
          }
        })

        return { previousTasks }
      },
      onError: (_err, _vars, context) => {
        if (context?.previousTasks) {
          queryClient.setQueryData(['tasks'], context.previousTasks)
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries(['tasks'])
      },
    }
  )
}
