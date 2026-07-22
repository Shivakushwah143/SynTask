import api from './axios'
import { getAccessToken } from '../utils/storage'

const withAuthHeaders = (headers = {}) => {
  const token = getAccessToken()
  if (!token) return headers

  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  }
}

export const ledgerAPI = {
  // Get ledger data
  getLedger: async (params = {}) => {
    const response = await api.get('/ledger', {
      params,
      headers: withAuthHeaders(),
    })
    return response.data
  },

  // Add payment to invoice
  addPayment: async (invoiceId, paymentData) => {
    const formData = new FormData()
    formData.append('amount', paymentData.amount)
    if (paymentData.payment_date) formData.append('payment_date', paymentData.payment_date)
    if (paymentData.payment_method) formData.append('payment_method', paymentData.payment_method)
    if (paymentData.reference_number) formData.append('reference_number', paymentData.reference_number)
    if (paymentData.notes) formData.append('notes', paymentData.notes)
    
    const response = await api.post(`/ledger/${invoiceId}/payment`, formData, {
      headers: withAuthHeaders({
        'Content-Type': 'multipart/form-data'
      }),
    })
    return response.data
  },

  // Update TDS for invoice
  updateTDS: async (invoiceId, tdsAmount) => {
    const formData = new FormData()
    formData.append('tds_amount', tdsAmount)
    
    const response = await api.put(`/ledger/${invoiceId}/tds`, formData, {
      headers: withAuthHeaders({
        'Content-Type': 'multipart/form-data'
      }),
    })
    return response.data
  },
}

