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
  // Download invoice PDF
  downloadInvoicePdf: async (invoiceId) => {
    return api.get(`/invoices/${invoiceId}/pdf`, {
      responseType: 'blob',
      // The Invoices page decodes and shows the error itself, so the global
      // interceptor must not add a second toast.
      suppressGlobalToast: true,
    })
  },

  // Seed realistic local demo invoices
  seedDemoInvoices: async () => {
    const response = await api.post('/invoices/seed-demo')
    return response.data
  },

  // Record a manual/local payment against an invoice
  recordPayment: async (invoiceId, paymentData) => {
    const formData = new URLSearchParams()
    formData.append('amount', paymentData.amount)
    if (paymentData.payment_date) formData.append('payment_date', paymentData.payment_date)
    if (paymentData.payment_method) formData.append('payment_method', paymentData.payment_method)
    if (paymentData.reference_number) formData.append('reference_number', paymentData.reference_number)
    if (paymentData.notes) formData.append('notes', paymentData.notes)
    const response = await api.post(`/invoices/${invoiceId}/record-payment`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    return response.data
  },

  // Create Razorpay order when backend .env flag enables invoice payments
  createRazorpayOrder: async (invoiceId) => {
    const response = await api.post(`/invoices/${invoiceId}/razorpay/order`)
    return response.data
  },

  // Confirm Razorpay invoice payment
  confirmRazorpayPayment: async (invoiceId, payment) => {
    const formData = new URLSearchParams()
    formData.append('order_id', payment.order_id)
    formData.append('payment_id', payment.payment_id)
    formData.append('signature', payment.signature)
    const response = await api.post(`/invoices/${invoiceId}/razorpay/confirm`, formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    return response.data
  },
}
