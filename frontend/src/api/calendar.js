import api from './axios'

export const calendarApi = {
  getEvents: (params) => api.get('/calendar/events', { params }),
}

// Shared query key used by the Workspace Calendar (and the legacy Calendar
// timeline). After any scheduled-work mutation (follow-up created/rescheduled/
// cancelled, scheduled job edited/retried/cancelled/deleted, task or project
// scheduled) call invalidateWorkspaceCalendar(queryClient) so the Calendar
// refreshes immediately without a full browser reload.
export const WORKSPACE_CALENDAR_QUERY_KEY = 'workspace-calendar-events'

export const invalidateWorkspaceCalendar = (queryClient) => {
  if (!queryClient) return
  queryClient.invalidateQueries(WORKSPACE_CALENDAR_QUERY_KEY)
}
