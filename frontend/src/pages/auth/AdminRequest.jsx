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
  Sparkles,
  ShieldCheck,
  User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { companiesAPI } from '../../api/companies'
import { subscriptionsAPI } from '../../api/subscriptions'
import { Button, FormField, inputClassName } from '../../components/ui'
import GoogleLoginButton from '../../components/auth/GoogleLoginButton'

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

const sectionClassName = 'rounded-lg border border-surface-border bg-white/90 p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950'

const SectionHeader = ({ icon: Icon, title, description }) => (
  <div className="mb-5 flex items-start gap-3">
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
    <div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">{description}</p>
    </div>
  </div>
)

const TextInput = ({ label, name, required = false, helperText, icon: Icon, className = '', ...props }) => (
  <FormField label={label} htmlFor={name} required={required} helperText={helperText} className={className}>
    <div className={Icon ? 'relative' : ''}>
      {Icon ? <Icon className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-gray-400" aria-hidden="true" /> : null}
      <input id={name} name={name} className={`${inputClassName} ${Icon ? 'pl-10' : ''}`} required={required} {...props} />
    </div>
  </FormField>
)

const SelectField = ({ label, name, required = false, children, ...props }) => (
  <FormField label={label} htmlFor={name} required={required}>
    <select id={name} name={name} className={inputClassName} required={required} {...props}>
      {children}
    </select>
  </FormField>
)

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
    <div className="space-y-6 font-['Plus_Jakarta_Sans',theme(fontFamily.sans)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">Admin access</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-950 dark:text-gray-50 sm:text-3xl">Request an admin account</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-400">
            Tell us who should own the workspace. We will verify the company, activate the plan, and send access details.
          </p>
        </div>
        <Link to="/login" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-primary-700 transition hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/50">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </div>

      <div className="rounded-lg border border-surface-border bg-white/90 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-400">
            Already have approved access? Continue with your Google workspace account.
          </p>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">or</span>
          <GoogleLoginButton onSuccess={() => navigate('/dashboard')} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-lg border border-surface-border bg-surface-muted/80 p-4 dark:border-gray-800 dark:bg-gray-950">
          {[
            ['Company', 'Basic profile and size'],
            ['Admin', 'Primary account owner'],
            ['Billing', 'Plan and payment method'],
          ].map(([title, description], index) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
                <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
              </div>
            </div>
          ))}
          <div className="mt-4 rounded-lg border border-primary-100 bg-primary-50 p-3 dark:border-primary-900/40 dark:bg-primary-950/30">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 text-primary-700 dark:text-primary-300" aria-hidden="true" />
              <p className="text-xs leading-5 text-gray-700 dark:text-gray-300">Review usually completes after company and billing details are confirmed.</p>
            </div>
          </div>
        </aside>

        <form onSubmit={handleSubmit} className="space-y-5">
          <section className={sectionClassName}>
          <SectionHeader
            icon={Building2}
            title="Company profile"
            description="Start with the organization details we need for review and workspace setup."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Company name" name="name" value={formData.name} onChange={handleChange} required />
            <TextInput label="Work email" name="email" type="email" value={formData.email} onChange={handleChange} icon={Mail} required />
            <TextInput label="Phone" name="phone" type="tel" value={formData.phone} onChange={handleChange} icon={Phone} required />
            <TextInput label="Website" name="website" type="url" value={formData.website} onChange={handleChange} icon={Globe} />
            <TextInput label="Registration number" name="registration_number" value={formData.registration_number} onChange={handleChange} />
            <TextInput label="Tax ID" name="tax_id" value={formData.tax_id} onChange={handleChange} />
            <SelectField label="Industry" name="industry" value={formData.industry} onChange={handleChange}>
              <option value="">Select industry</option>
              {industries.map((industry) => <option key={industry} value={industry.toLowerCase()}>{industry}</option>)}
            </SelectField>
            <SelectField label="Company size" name="company_size" value={formData.company_size} onChange={handleChange}>
              <option value="">Select company size</option>
              {companySizes.map((size) => <option key={size} value={size}>{size}</option>)}
            </SelectField>
            <TextInput label="Seats requested" name="seats_requested" type="number" min="1" value={formData.seats_requested} onChange={handleChange} />
            <TextInput label="Your role / title" name="contact_role" value={formData.contact_role} onChange={handleChange} />
          </div>
        </section>

        <section className={sectionClassName}>
          <SectionHeader
            icon={MapPin}
            title="Headquarters"
            description="Optional location details help us prepare invoices and regional onboarding."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="Address" name="address" value={formData.address} onChange={handleChange} className="md:col-span-2" />
            <TextInput label="City" name="city" value={formData.city} onChange={handleChange} />
            <TextInput label="State / region" name="state" value={formData.state} onChange={handleChange} />
            <TextInput label="Country" name="country" value={formData.country} onChange={handleChange} />
            <TextInput label="Postal code" name="zip_code" value={formData.zip_code} onChange={handleChange} />
          </div>
        </section>

        <section className={sectionClassName}>
          <SectionHeader
            icon={User}
            title="Primary admin contact"
            description="This person receives the first admin credentials and onboarding emails."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <TextInput label="First name" name="admin_first_name" value={formData.admin_first_name} onChange={handleChange} required />
            <TextInput label="Last name" name="admin_last_name" value={formData.admin_last_name} onChange={handleChange} required />
            <TextInput label="Admin email" name="admin_email" type="email" value={formData.admin_email} onChange={handleChange} icon={Mail} required />
            <TextInput label="Secondary contact email" name="secondary_email" type="email" value={formData.secondary_email} onChange={handleChange} />
          </div>
        </section>

        <section className={sectionClassName}>
          <SectionHeader
            icon={CreditCard}
            title="Subscription and billing"
            description="Choose a plan now, or submit with offline payment details for review."
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {loadingPlans ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-surface-border py-8 lg:col-span-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
              </div>
            ) : (
              plans.map((plan) => {
                const price = formData.billing_cycle === 'annual' ? plan.annual_price : plan.monthly_price
                const isSelected = formData.subscription_plan === plan.id
                return (
                  <label
                    key={plan.id}
                    className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                      isSelected ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/10 dark:bg-primary-950/30' : 'border-surface-border bg-white hover:border-primary-200 dark:bg-gray-950'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{plan.name}</p>
                        <p className="text-2xl font-bold text-primary-700 dark:text-primary-300">${price}<span className="text-sm font-medium text-gray-500">/{formData.billing_cycle === 'annual' ? 'year' : 'month'}</span></p>
                      </div>
                      <input className="mt-1 h-4 w-4 accent-primary-600" type="radio" name="subscription_plan" value={plan.id} checked={isSelected} onChange={handleChange} />
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
            <SelectField label="Billing cycle" name="billing_cycle" value={formData.billing_cycle} onChange={handleChange}>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </SelectField>
            <SelectField label="Payment method" name="payment_method" value={formData.payment_method} onChange={handleChange}>
              {paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </SelectField>
            <TextInput label="Payment reference" name="payment_reference" value={formData.payment_reference} onChange={handleChange} />
          </div>
        </section>

        <section className={sectionClassName}>
          <SectionHeader
            icon={ShieldCheck}
            title="Notes for our team"
            description="Add procurement, security, launch timing, or onboarding context."
          />
          <FormField label="Additional notes" htmlFor="notes">
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className={`${inputClassName} min-h-28 resize-y`}
              placeholder="Example: We need SSO review before launch."
            />
          </FormField>
        </section>

        <div className="sticky bottom-0 -mx-1 flex flex-col gap-3 border-t border-surface-border bg-white/95 px-1 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            By submitting, you agree to receive onboarding emails. Billing and admin details are encrypted.
          </p>
          <div className="flex gap-3">
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-surface-border bg-white px-4 py-2.5 font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
            >
              Cancel
            </Link>
            <Button type="submit" loading={loading || loadingPlans} size="lg" className="min-h-11">
              <ShieldCheck className="h-4 w-4" />
              {formData.subscription_plan === 'free' ? 'Submit request' : 'Continue to payment'}
            </Button>
          </div>
        </div>
      </form>
      </div>

      {showPayment && paymentOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-950">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Complete payment</h3>
            <div className="mt-4 rounded-lg bg-primary-50 p-4 dark:bg-primary-950/30">
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
