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
import { Button, inputClassName } from '../../components/ui'

const paymentOptions = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other / Discuss with sales' },
]

const industries = ['Technology', 'Consulting', 'Finance', 'Healthcare', 'Manufacturing', 'Education', 'Retail', 'Other']
const companySizes = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']

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

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script)
    }
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = { ...formData }
      const secondaryEmail = payload.secondary_email
      delete payload.secondary_email

      if (payload.seats_requested === '') delete payload.seats_requested
      else payload.seats_requested = Number(payload.seats_requested)

      if (secondaryEmail) {
        payload.notes = payload.notes ? `${payload.notes}\nSecondary contact: ${secondaryEmail}` : `Secondary contact: ${secondaryEmail}`
      }

      const response = await companiesAPI.registerCompany(payload)
      const newCompanyId = response.data?.company_id || response.company_id
      setCompanyId(newCompanyId)

      if (formData.subscription_plan !== 'free' && formData.payment_method === 'razorpay') {
        setShowPayment(true)
        try {
          const paymentData = await subscriptionsAPI.createPaymentIntent(formData.subscription_plan, formData.billing_cycle, newCompanyId)
          setPaymentOrder(paymentData)
        } catch (error) {
          console.error('Error creating payment order:', error)
          toast.error('Failed to initialize payment. Please contact support.')
        }
      } else {
        toast.success('Request submitted! Our team will review and confirm access.')
        navigate('/login')
      }
    } catch (error) {
      const message = error.response?.data?.detail || error.message || 'Could not submit your request. Please try again.'
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
        formData.billing_cycle,
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
      amount: paymentOrder.amount * 100,
      currency: paymentOrder.currency,
      name: 'SynTask',
      description: `Subscription: ${formData.subscription_plan} (${formData.billing_cycle})`,
      order_id: paymentOrder.order_id,
      handler: (response) => handlePaymentSuccess(response),
      prefill: {
        name: `${formData.admin_first_name} ${formData.admin_last_name}`,
        email: formData.admin_email,
        contact: formData.phone,
      },
      theme: { color: '#4f46e5' },
      modal: {
        ondismiss: () => {
          setShowPayment(false)
          toast.info('Payment cancelled')
        },
      },
    }

    const razorpay = new window.Razorpay(options)
    razorpay.open()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Admin access</p>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Request an admin account</h2>
          <p className="max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
            Share company, billing, and onboarding details so our team can review access.
          </p>
        </div>
        <Link to="/login" className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>
      </div>

      <div className="flex gap-3 rounded-2xl border border-primary-100 bg-primary-50/70 p-4 dark:border-primary-900/40 dark:bg-primary-950/30">
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-600 dark:text-primary-300" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">What happens next?</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            We verify details, activate the right plan, and send admin credentials to your email.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-2xl border border-surface-border bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Company profile</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <input className={inputClassName} name="name" placeholder="Company name *" value={formData.name} onChange={handleChange} required />
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-gray-400" />
              <input className={`${inputClassName} pl-10`} name="email" placeholder="Work email *" value={formData.email} onChange={handleChange} required />
            </div>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-gray-400" />
              <input className={`${inputClassName} pl-10`} name="phone" placeholder="Phone *" value={formData.phone} onChange={handleChange} required />
            </div>
            <div className="relative">
              <Globe className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-gray-400" />
              <input className={`${inputClassName} pl-10`} name="website" placeholder="Website" value={formData.website} onChange={handleChange} />
            </div>
            <input className={inputClassName} name="registration_number" placeholder="Registration number" value={formData.registration_number} onChange={handleChange} />
            <input className={inputClassName} name="tax_id" placeholder="Tax ID" value={formData.tax_id} onChange={handleChange} />
            <select className={inputClassName} name="industry" value={formData.industry} onChange={handleChange}>
              <option value="">Select industry</option>
              {industries.map((industry) => <option key={industry} value={industry.toLowerCase()}>{industry}</option>)}
            </select>
            <select className={inputClassName} name="company_size" value={formData.company_size} onChange={handleChange}>
              <option value="">Select company size</option>
              {companySizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <input className={inputClassName} name="seats_requested" type="number" min="1" placeholder="Seats requested" value={formData.seats_requested} onChange={handleChange} />
            <input className={inputClassName} name="contact_role" placeholder="Role / title" value={formData.contact_role} onChange={handleChange} />
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Headquarters</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <input className={inputClassName} name="address" placeholder="Address" value={formData.address} onChange={handleChange} />
            <input className={inputClassName} name="city" placeholder="City" value={formData.city} onChange={handleChange} />
            <input className={inputClassName} name="state" placeholder="State / region" value={formData.state} onChange={handleChange} />
            <input className={inputClassName} name="country" placeholder="Country" value={formData.country} onChange={handleChange} />
            <input className={inputClassName} name="zip_code" placeholder="Postal code" value={formData.zip_code} onChange={handleChange} />
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Primary admin contact</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <input className={inputClassName} name="admin_first_name" placeholder="First name *" value={formData.admin_first_name} onChange={handleChange} required />
            <input className={inputClassName} name="admin_last_name" placeholder="Last name *" value={formData.admin_last_name} onChange={handleChange} required />
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-gray-400" />
              <input className={`${inputClassName} pl-10`} name="admin_email" placeholder="Admin email *" value={formData.admin_email} onChange={handleChange} required />
            </div>
            <input className={inputClassName} name="secondary_email" placeholder="Secondary contact" value={formData.secondary_email} onChange={handleChange} />
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Subscription and billing</h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-4">
            {loadingPlans ? (
              <div className="flex items-center justify-center py-8 lg:col-span-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
              </div>
            ) : (
              plans.map((plan) => {
                const price = formData.billing_cycle === 'annual' ? plan.annual_price : plan.monthly_price
                const isSelected = formData.subscription_plan === plan.id
                return (
                  <label
                    key={plan.id}
                    className={`cursor-pointer rounded-2xl border p-4 transition-colors ${
                      isSelected ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30' : 'border-surface-border bg-white hover:border-primary-200 dark:bg-gray-950'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{plan.name}</p>
                        <p className="text-2xl font-bold text-primary-600">${price}<span className="text-sm font-medium text-gray-500">/{formData.billing_cycle === 'annual' ? 'year' : 'month'}</span></p>
                      </div>
                      <input type="radio" name="subscription_plan" value={plan.id} checked={isSelected} onChange={handleChange} />
                    </div>
                    <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-600" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </label>
                )
              })
            )}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <select className={inputClassName} name="billing_cycle" value={formData.billing_cycle} onChange={handleChange}>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
            <select className={inputClassName} name="payment_method" value={formData.payment_method} onChange={handleChange}>
              {paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <input className={inputClassName} name="payment_reference" placeholder="Payment reference" value={formData.payment_reference} onChange={handleChange} />
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Notes for our team</h3>
          </div>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            className={`${inputClassName} min-h-28`}
            placeholder="Security review, launch timing, procurement notes..."
          />
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            By submitting, you agree to receive onboarding emails. Billing and admin details are encrypted.
          </p>
          <div className="flex gap-3">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-xl border border-surface-border bg-white px-4 py-2.5 font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
            >
              Cancel
            </Link>
            <Button type="submit" loading={loading || loadingPlans}>
              <ShieldCheck className="h-4 w-4" />
              {formData.subscription_plan === 'free' ? 'Submit request' : 'Continue to payment'}
            </Button>
          </div>
        </div>
      </form>

      {showPayment && paymentOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-950">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Complete payment</h3>
            <div className="mt-4 rounded-xl bg-primary-50 p-4 dark:bg-primary-950/30">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Payment details</p>
              <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                <p>Plan: <span className="font-semibold capitalize">{formData.subscription_plan}</span></p>
                <p>Billing: <span className="font-semibold capitalize">{formData.billing_cycle}</span></p>
                <p>Amount: <span className="font-semibold">₹{paymentOrder.amount}</span></p>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Click the button below to proceed with the Razorpay payment gateway.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setShowPayment(false)
                  toast.info('You can complete payment later. Request submitted.')
                  navigate('/login')
                }}
              >
                Skip for now
              </Button>
              <Button className="flex-1" onClick={initializeRazorpay} disabled={processingPayment || !window.Razorpay}>
                {processingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Pay with Razorpay
              </Button>
            </div>
            {!window.Razorpay ? <p className="mt-2 text-xs text-red-600">Razorpay script is loading. Please wait...</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default AdminRequest
