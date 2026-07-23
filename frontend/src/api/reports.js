import api from './axios'
import { timeService } from '@/services/timeService'

export const reportsAPI = {
  // Export tasks report
  exportTasks: async (format = 'csv', filters = {}) => {
    const params = new URLSearchParams()
    params.append('format', format)
    if (filters.start_date) params.append('start_date', filters.start_date)
    if (filters.end_date) params.append('end_date', filters.end_date)
    if (filters.status) params.append('status', filters.status)
    
    const response = await api.get(`/reports/tasks/export?${params.toString()}`, {
      responseType: 'blob'
    })
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `tasks_report_${timeService.toUtcISOString(timeService.now()).split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    
    return response.data
  },

  // Export tickets report
  exportTickets: async (format = 'csv', filters = {}) => {
    const params = new URLSearchParams()
    params.append('format', format)
    if (filters.start_date) params.append('start_date', filters.start_date)
    if (filters.end_date) params.append('end_date', filters.end_date)
    if (filters.status) params.append('status', filters.status)
    
    const response = await api.get(`/reports/tickets/export?${params.toString()}`, {
      responseType: 'blob'
    })
    
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `tickets_report_${timeService.toUtcISOString(timeService.now()).split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
    
    return response.data
  },

  // Get analytics charts data
  getAnalyticsCharts: async (period = 'month') => {
    const response = await api.get(`/reports/analytics/charts?period=${period}`)
    return response.data
  },
}

