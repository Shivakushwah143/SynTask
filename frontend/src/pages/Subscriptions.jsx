import { useState, useEffect, useCallback } from 'react'
import { CheckCircle } from 'lucide-react'
import { companiesAPI } from '../api/companies'
import { useAuthStore } from '../store/authStore'

const Subscriptions = () => {
  const { user } = useAuthStore()
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchSubscription = useCallback(async () => {
    try {
      setLoading(true)
      await companiesAPI.getCompany(user.company_id)
      setSubscription({
        plan: 'Professional',
        status: 'active',
        billing_cycle: 'monthly',
        amount: 99.00,
        next_billing_date: '2025-12-20',
        auto_renew: true,
      })
    } catch (error) {
      console.error('Error loading subscription:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.company_id])

  useEffect(() => {
    if (user?.company_id) {
      fetchSubscription()
    }
  }, [user?.company_id, fetchSubscription])

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  const plans = [
    {
      name: 'Free',
      price: 0,
      features: ['Up to 10 users', '5 projects', '5GB storage', 'Basic support'],
    },
    {
      name: 'Basic',
      price: 29,
      features: ['Up to 25 users', 'Unlimited projects', '25GB storage', 'Email support'],
    },
    {
      name: 'Professional',
      price: 99,
      features: ['Up to 100 users', 'Unlimited projects', '100GB storage', 'Priority support', 'Advanced analytics'],
    },
    {
      name: 'Enterprise',
      price: 299,
      features: ['Unlimited users', 'Unlimited projects', 'Unlimited storage', '24/7 support', 'Custom integrations'],
    },
  ]

  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">Subscription & Billing</h1>
        <p className="text-gray-600 text-xs mt-0.5">Manage your subscription plan and billing</p>
      </div>

      {/* Current Subscription */}
      {subscription && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Plan</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Plan</label>
              <p className="text-2xl font-bold text-gray-900 mt-1">{subscription.plan}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Status</label>
              <p className="mt-1">
                <span className="badge badge-success">{subscription.status}</span>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Next Billing</label>
              <p className="text-gray-900 mt-1">{subscription.next_billing_date}</p>
            </div>
          </div>
        </div>
      )}

      {/* Available Plans */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`card ${
                subscription?.plan === plan.name ? 'border-2 border-primary-600' : ''
              }`}
            >
              <div className="text-center mb-4">
                <h4 className="text-xl font-bold text-gray-900">{plan.name}</h4>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                  <span className="text-gray-600">/month</span>
                </div>
              </div>
              <ul className="space-y-2 mb-4">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-center text-sm text-gray-600">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={`btn w-full ${
                  subscription?.plan === plan.name
                    ? 'btn-secondary'
                    : 'btn-primary'
                }`}
                disabled={subscription?.plan === plan.name}
              >
                {subscription?.plan === plan.name ? 'Current Plan' : 'Upgrade'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Methods */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
        <p className="text-gray-600">Payment gateway integration ready (Stripe/Razorpay)</p>
        <button className="btn btn-primary mt-4">Add Payment Method</button>
      </div>
    </div>
  )
}

export default Subscriptions

