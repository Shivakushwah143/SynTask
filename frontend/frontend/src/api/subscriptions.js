import api from './axios'

export const subscriptionsAPI = {
  // Get subscription plans
  getPlans: async () => {
    const response = await api.get('/subscriptions/plans')
    return response.data
  },

  // Create payment order (Razorpay)
  createPaymentIntent: async (plan, billingCycle, companyId = null) => {
    const formData = new URLSearchParams()
    formData.append('plan', plan)
    formData.append('billing_cycle', billingCycle)
    if (companyId) formData.append('company_id', companyId)
    
    const response = await api.post('/subscriptions/payment-intent', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },

  // Confirm payment (Razorpay)
  confirmPayment: async (orderId, paymentId, signature, companyId, plan, billingCycle) => {
    const formData = new URLSearchParams()
    formData.append('order_id', orderId)
    formData.append('payment_id', paymentId)
    formData.append('signature', signature)
    formData.append('company_id', companyId)
    formData.append('plan', plan)
    formData.append('billing_cycle', billingCycle)
    
    const response = await api.post('/subscriptions/confirm-payment', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return response.data
  },
}

