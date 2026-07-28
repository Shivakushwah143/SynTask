import { QueryClient } from 'react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchInterval: 10000, // Live auto-sync all queries every 10s
      staleTime: 5000,
      retry: 1,
    },
  },
})
