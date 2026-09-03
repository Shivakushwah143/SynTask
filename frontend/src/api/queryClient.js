import { QueryClient } from 'react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // No refetch storm when the window regains focus: individual queries
      // that need near-real-time updates set their own refetchInterval or
      // per-query refetchOnWindowFocus (attendance, notifications).
      refetchOnWindowFocus: false,
      // No global polling interval.
      // 30s freshness window: remounting a page within 30s reuses the cached
      // query instead of re-fetching (fast navigation); mutations invalidate
      // the affected keys explicitly.
      staleTime: 30_000,
      retry: 1,
    },
  },
})
