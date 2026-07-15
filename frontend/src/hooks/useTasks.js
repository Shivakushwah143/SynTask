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
        await queryClient.cancelQueries(['task', id])

        const previousTasks = queryClient.getQueriesData(['tasks'])
        const previousTask = queryClient.getQueryData(['task', id])

        queryClient.setQueriesData(['tasks'], (old) => {
          if (!old?.tasks) return old
          return {
            ...old,
            tasks: old.tasks.map((task) => {
              const taskId = task.id || task._id
              return taskId === id ? { ...task, status } : task
            }),
          }
        })

        queryClient.setQueryData(['task', id], (old) => (old ? { ...old, status } : old))

        return { previousTasks, previousTask }
      },
      onError: (_err, _vars, context) => {
        if (context?.previousTasks) {
          context.previousTasks.forEach(([key, value]) => queryClient.setQueryData(key, value))
        }
        if (context?.previousTask) {
          queryClient.setQueryData(['task', context.previousTask.id || context.previousTask._id], context.previousTask)
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries(['tasks'])
        queryClient.invalidateQueries(['task'])
      },
    }
  )
}
