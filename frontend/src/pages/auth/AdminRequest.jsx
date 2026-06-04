import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CreditCard,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { companiesAPI } from '../../api/companies'
import { subscriptionsAPI } from '../../api/subscriptions'

const paymentOptions = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other / Discuss with sales' },
]

const industries = [
  'Technology',
  'Consulting',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Education',
  'Retail',
  'Other',
]

const companySizes = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1000+',
]

const initialFormState = {
  name: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  city: '',
  state: '',
  country: '',
  zip_code: '',
  industry: '',
  company_size: '',
  registration_number: '',
  tax_id: '',
  seats_requested: '',
  admin_first_name: '',
  admin_last_name: '',
  admin_email: '',
  contact_role: '',
  secondary_email: '',
  subscription_plan: 'professional',
  billing_cycle: 'annual',
  payment_method: 'razorpay',
  payment_reference: '',
  notes: '',
}

const AdminRequest = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState(initialFormState)
  const [loading, setLoading] = useState(false)
  const [plans, setPlans] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [showPayment, setShowPayment] = useState(false)
  const [processingPayment, setProcessingPayment] = useState(false)
  const [companyId, setCompanyId] = useState(null)
  const [paymentOrder, setPaymentOrder] = useState(null)

  // Load plans with pricing
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const data = await subscriptionsAPI.getPlans()
        setPlans(data.plans || [])
      } catch (error) {
        console.error('Error loading plans:', error)
        toast.error('Failed to load subscription plans')
      } finally {
        setLoadingPlans(false)
      }
    }
    loadPlans()
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = { ...formData }
      const secondaryEmail = payload.secondary_email
      delete payload.secondary_email

      if (payload.seats_requested === '') {
        delete payload.seats_requested
      } else {
        payload.seats_requested = Number(payload.seats_requested)
      }

      if (secondaryEmail) {
        payload.notes = payload.notes
          ? `${payload.notes}\nSecondary contact: ${secondaryEmail}`
          : `Secondary contact: ${secondaryEmail}`
      }

      // Register company first
      const response = await companiesAPI.registerCompany(payload)
      const newCompanyId = response.data?.company_id || response.company_id
      setCompanyId(newCompanyId)

      // If plan is not free, proceed to payment
      if (formData.subscription_plan !== 'free' && formData.payment_method === 'razorpay') {
        setShowPayment(true)
        // Create payment order
        try {
          const paymentData = await subscriptionsAPI.createPaymentIntent(
            formData.subscription_plan,
            formData.billing_cycle,
            newCompanyId
          )
          setPaymentOrder(paymentData)
        } catch (error) {
          console.error('Error creating payment order:', error)
          toast.error('Failed to initialize payment. Please contact support.')
        }
      } else {
        // Free plan or other payment method - just submit
        toast.success('Request submitted! Our team will review and confirm access.')
        navigate('/login')
      }
    } catch (error) {
      const message =
        error.response?.data?.detail ||
        error.message ||
        'Could not submit your request. Please try again.'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentSuccess = async (razorpayResponse) => {
    setProcessingPayment(true)
    try {
      await subscriptionsAPI.confirmPayment(
        razorpayResponse.razorpay_order_id,
        razorpayResponse.razorpay_payment_id,
        razorpayResponse.razorpay_signature,
        companyId,
        formData.subscription_plan,
        formData.billing_cycle
      )
      toast.success('Payment successful! Your request has been submitted.')
      navigate('/login')
    } catch (error) {
      toast.error('Payment confirmed but failed to activate subscription. Please contact support.')
      console.error('Error confirming payment:', error)
    } finally {
      setProcessingPayment(false)
    }
  }

  const initializeRazorpay = () => {
    if (!paymentOrder) return

    const options = {
      key: paymentOrder.key_id,
      amount: paymentOrder.amount * 100, // Convert to paise
      currency: paymentOrder.currency,
      name: 'Alphanexis Task Management',
      description: `Subscription: ${formData.subscription_plan} (${formData.billing_cycle})`,
      order_id: paymentOrder.order_id,
      handler: function (response) {
        handlePaymentSuccess(response)
      },
      prefill: {
        name: `${formData.admin_first_name} ${formData.admin_last_name}`,
        email: formData.admin_email,
        contact: formData.phone,
      },
      theme: {
        color: '#4F46E5'
      },
      modal: {
        ondismiss: function() {
          setShowPayment(false)
          toast.info('Payment cancelled')
        }
      }
    }

    const razorpay = new window.Razorpay(options)
    razorpay.open()
  }

  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)

    return () => {
      // Cleanup
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary-600 font-semibold">
            <ShieldCheck className="h-4 w-4" />
            Admin Access Request
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mt-1">Request an Admin Account</h2>
          <p className="text-gray-600 mt-1">
            Share your company details, choose a subscription, and add payment preferences to start onboarding.
          </p>
        </div>
        <Link
          to="/login"
          className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to sign in
        </Link>
      </div>

      <div className="p-4 rounded-xl bg-primary-50 border border-primary-100">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm text-primary-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary-700">What happens next?</p>
              <p className="text-sm text-primary-700/80">
                We verify your details, activate the right plan, and send admin credentials to your email.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-primary-700">
            <span className="px-3 py-1 rounded-full bg-white border border-primary-100">Verification under 1 business day</span>
            <span className="px-3 py-1 rounded-full bg-white border border-primary-100">Secure billing</span>
            <span className="px-3 py-1 rounded-full bg-white border border-primary-100">Guided onboarding</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-4 border border-gray-100 rounded-xl bg-gray-50">
            <div className="flex items-center gap-2 mb-4">
              <span className="p-2 rounded-lg bg-white shadow-sm text-primary-600">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Company profile</p>
                <p className="text-xs text-gray-500">Basic info to verify and set up your workspace.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="input"
                  placeholder="Alphanexis Technologies"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Work Email *</label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" />
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="input pl-10"
                      placeholder="ops@company.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <div className="relative">
                    <Phone className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" />
                    <input
                      type="tel"
                      name="phone"
                      required
                      value={formData.phone}
                      onChange={handleChange}
                      className="input pl-10"
                      placeholder="+1 555 123 4567"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <div className="relative">
                    <Globe className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" />
                    <input
                      type="url"
                      name="website"
                      value={formData.website}
                      onChange={handleChange}
                      className="input pl-10"
                      placeholder="https://company.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                  <input
                    type="text"
                    name="registration_number"
                    value={formData.registration_number}
                    onChange={handleChange}
                    className="input"
                    placeholder="Business / GST / VAT ID"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <select
                    name="industry"
                    value={formData.industry}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Select industry</option>
                    {industries.map((industry) => (
                      <option key={industry} value={industry.toLowerCase()}>
                        {industry}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Size</label>
                  <select
                    name="company_size"
                    value={formData.company_size}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Select size</option>
                    {companySizes.map((size) => (
                      <option key={size} value={size}>
                        {size} people
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID (optional)</label>
                  <input
                    type="text"
                    name="tax_id"
                    value={formData.tax_id}
                    onChange={handleChange}
                    className="input"
                    placeholder="Tax / VAT number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Seats Needed</label>
                  <input
                    type="number"
                    name="seats_requested"
                    value={formData.seats_requested}
                    onChange={handleChange}
                    className="input"
                    placeholder="e.g. 50"
                    min="1"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border border-gray-100 rounded-xl bg-gray-50">
            <div className="flex items-center gap-2 mb-4">
              <span className="p-2 rounded-lg bg-white shadow-sm text-primary-600">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Headquarters</p>
                <p className="text-xs text-gray-500">Where will most admins work from?</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="input"
                  placeholder="123 Innovation Drive"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className="input"
                    placeholder="San Francisco"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State / Region</label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className="input"
                    placeholder="CA"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                    className="input"
                    placeholder="United States"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    name="zip_code"
                    value={formData.zip_code}
                    onChange={handleChange}
                    className="input"
                    placeholder="94107"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border border-gray-100 rounded-xl bg-gray-50">
          <div className="flex items-center gap-2 mb-4">
            <span className="p-2 rounded-lg bg-white shadow-sm text-primary-600">
              <User className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Primary admin contact</p>
              <p className="text-xs text-gray-500">We will share credentials and onboarding steps here.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input
                type="text"
                name="admin_first_name"
                required
                value={formData.admin_first_name}
                onChange={handleChange}
                className="input"
                placeholder="Avery"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input
                type="text"
                name="admin_last_name"
                required
                value={formData.admin_last_name}
                onChange={handleChange}
                className="input"
                placeholder="Morgan"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role / Title</label>
              <input
                type="text"
                name="contact_role"
                value={formData.contact_role}
                onChange={handleChange}
                className="input"
                placeholder="Head of Operations"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
              <div className="relative">
                <Mail className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" />
                <input
                  type="email"
                  name="admin_email"
                  required
                  value={formData.admin_email}
                  onChange={handleChange}
                  className="input pl-10"
                  placeholder="admin@company.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Contact (optional)</label>
              <input
                type="email"
                name="secondary_email"
                value={formData.secondary_email || ''}
                onChange={handleChange}
                className="input"
                placeholder="security@company.com"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border border-gray-100 rounded-xl bg-gray-50">
          <div className="flex items-center gap-2 mb-4">
            <span className="p-2 rounded-lg bg-white shadow-sm text-primary-600">
              <CreditCard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Subscription & billing</p>
              <p className="text-xs text-gray-500">Pick a plan and your preferred payment channel.</p>
            </div>
          </div>
          {loadingPlans ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              {plans.map((plan) => {
                const price = formData.billing_cycle === 'annual' 
                  ? plan.annual_price 
                  : plan.monthly_price
                const isSelected = formData.subscription_plan === plan.id
                
                return (
                  <label
                    key={plan.id}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50 shadow-md'
                        : 'border-gray-200 bg-white hover:border-primary-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="font-bold text-lg text-gray-900">{plan.name}</p>
                        <div className="mt-2">
                          <span className="text-2xl font-bold text-primary-600">${price}</span>
                          <span className="text-sm text-gray-600">
                            /{formData.billing_cycle === 'annual' ? 'year' : 'month'}
                          </span>
                        </div>
                        {formData.billing_cycle === 'annual' && plan.annual_price > 0 && (
                          <p className="text-xs text-green-600 mt-1">
                            Save ${(plan.monthly_price * 12) - plan.annual_price}/year
                          </p>
                        )}
                      </div>
                      <input
                        type="radio"
                        name="subscription_plan"
                        value={plan.id}
                        checked={isSelected}
                        onChange={handleChange}
                        className="mt-1"
                      />
                    </div>
                    <ul className="space-y-2 text-sm text-gray-600">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start">
                          <CheckCircle2 className="h-4 w-4 text-primary-600 mr-2 mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </label>
                )
              })}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Billing Cycle</label>
              <select
                name="billing_cycle"
                value={formData.billing_cycle}
                onChange={handleChange}
                className="input"
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                name="payment_method"
                value={formData.payment_method}
                onChange={handleChange}
                className="input"
              >
                {paymentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Reference</label>
              <input
                type="text"
                name="payment_reference"
                value={formData.payment_reference}
                onChange={handleChange}
                className="input"
                placeholder="Transaction / PO / quote ID"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border border-gray-100 rounded-xl bg-gray-50">
          <div className="flex items-center gap-2 mb-4">
            <span className="p-2 rounded-lg bg-white shadow-sm text-primary-600">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Notes for our team</p>
              <p className="text-xs text-gray-500">Share any timeline, security, or procurement details.</p>
            </div>
          </div>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            className="input h-28"
            placeholder="Example: We need SSO enabled; include our security review steps; go-live target is next month."
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-gray-500">
            By submitting, you agree to receive onboarding emails. We keep billing and admin details encrypted.
          </div>
          <div className="flex gap-3">
            <Link
              to="/login"
              className="btn btn-secondary"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || loadingPlans}
              className="btn btn-primary flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  {formData.subscription_plan === 'free' ? 'Submit request' : 'Continue to payment'}
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Payment Modal */}
      {showPayment && paymentOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Complete Payment</h3>
            <div className="mb-4 p-4 bg-primary-50 rounded-lg">
              <p className="text-sm font-semibold text-gray-900 mb-2">Payment Details:</p>
              <div className="space-y-1 text-sm text-gray-600">
                <p>Plan: <span className="font-semibold capitalize">{formData.subscription_plan}</span></p>
                <p>Billing: <span className="font-semibold capitalize">{formData.billing_cycle}</span></p>
                <p>Amount: <span className="font-semibold">₹{paymentOrder.amount}</span></p>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600">
                Click the button below to proceed with Razorpay payment gateway.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPayment(false)
                  toast.info('You can complete payment later. Request submitted.')
                  navigate('/login')
                }}
                className="btn btn-secondary flex-1"
              >
                Skip for now
              </button>
              <button
                onClick={initializeRazorpay}
                disabled={processingPayment || !window.Razorpay}
                className="btn btn-primary flex-1"
              >
                {processingPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay with Razorpay
                  </>
                )}
              </button>
            </div>

            {!window.Razorpay && (
              <p className="text-xs text-red-600 mt-2">
                Razorpay script is loading. Please wait...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminRequest
