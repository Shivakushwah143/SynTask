import api from './axios'

export const invoicesAPI = {
  // Create invoice
  createInvoice: async (invoiceData) => {
    const formData = new URLSearchParams()
    Object.keys(invoiceData).forEach(key => {
      if (invoiceData[key] !== null && invoiceData[key] !== undefined) {
        if (key === 'items') {
          formData.append(key, JSON.stringify(invoiceData[key]))
        } else {
          formData.append(key, invoiceData[key])
        }
      }
    })
    const response = await api.post('/invoices/', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    return response.data
  },

  // List invoices
  listInvoices: async (skip = 0, limit = 20, invoice_type = '', status = '', client_id = '') => {
    const params = new URLSearchParams()
    params.append('skip', skip)
    params.append('limit', limit)
    if (invoice_type) params.append('invoice_type', invoice_type)
    if (status) params.append('status', status)
    if (client_id) params.append('client_id', client_id)
    const response = await api.get(`/invoices/?${params.toString()}`)
    return response.data
  },

  // Get invoice details
  getInvoice: async (invoiceId) => {
    const response = await api.get(`/invoices/${invoiceId}`)
    return response.data
  },

  // Update invoice
  updateInvoice: async (invoiceId, invoiceData) => {
    const formData = new URLSearchParams()
    Object.keys(invoiceData).forEach(key => {
      if (invoiceData[key] !== null && invoiceData[key] !== undefined) {
        if (key === 'items') {
          formData.append(key, JSON.stringify(invoiceData[key]))
        } else {
          formData.append(key, invoiceData[key])
        }
      }
    })
    const response = await api.put(`/invoices/${invoiceId}`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    return response.data
  },

  // Delete invoice
  deleteInvoice: async (invoiceId) => {
    const response = await api.delete(`/invoices/${invoiceId}`)
    return response.data
  },

  // Send invoice via email
  sendInvoiceEmail: async (invoiceId) => {
    const response = await api.post(`/invoices/${invoiceId}/send-email`)
    return response.data
  },
}


