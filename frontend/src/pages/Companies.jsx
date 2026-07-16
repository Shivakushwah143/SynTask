import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Building2, Check, CreditCard, Globe2, Mail, Plus, RefreshCw, ShieldCheck, User, X } from 'lucide-react'
import { companiesAPI } from '../api/companies'
import { useConfirmation } from '../hooks/useConfirmation'
import { Button, FormField, Modal, PasswordInput, PhoneInput, inputClassName } from '../components/ui'
import toast from 'react-hot-toast'

const Companies = () => {
  const { confirm } = useConfirmation()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Fetch companies
  const fetchCompanies = async () => {
    try {
      setLoading(true)
      setError(null)
      console.log('📡 Fetching companies...')
      const data = await companiesAPI.listCompanies()
      console.log('✅ Companies received:', data)
      
      if (data && Array.isArray(data.companies)) {
        setCompanies(data.companies)
      } else {
        console.warn('⚠️ Unexpected data format:', data)
        setCompanies([])
      }
    } catch (error) {
      console.error('❌ Error loading companies:', error)
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to load companies'
      setError(errorMsg)
      toast.error(errorMsg)
      setCompanies([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCompanies()
  }, [])

  // Handle approve click
  const handleApproveClick = (company) => {
    console.log('Approving company:', company)
    setSelectedCompany(company)
    setShowApproveModal(true)
  }

  // Handle approve submit
  const handleApproveSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    
    const formData = new FormData(e.target)
    
    try {
      setSubmitting(true)
      console.log('Approving company:', selectedCompany.id)
      
      await companiesAPI.approveCompany(selectedCompany.id, {
        admin_first_name: formData.get('admin_first_name'),
        admin_last_name: formData.get('admin_last_name'),
        admin_email: formData.get('admin_email'),
        admin_password: formData.get('admin_password'),
        subscription_plan: formData.get('subscription_plan') || 'free',
      })
      
      toast.success('✅ Company approved and admin created!')
      setShowApproveModal(false)
      setSelectedCompany(null)
      await fetchCompanies()
    } catch (error) {
      console.error('Error approving company:', error)
      
      // Handle FastAPI validation errors (422)
      let errorMessage = 'Failed to approve company'
      
      if (error.response?.status === 422 && error.response?.data?.detail) {
        const detail = error.response.data.detail
        if (Array.isArray(detail)) {
          errorMessage = detail.map(err => err.msg || err.message || 'Validation error').join(', ')
        } else if (typeof detail === 'string') {
          errorMessage = detail
        }
      } else if (error.response?.data?.detail) {
        errorMessage = String(error.response.data.detail)
      } else if (error.message) {
        errorMessage = error.message
      }
      
      toast.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  // Handle register submit
  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    if (submitting) return
    
    const formData = new FormData(e.target)
    
    try {
      setSubmitting(true)
      console.log('Registering company...')
      
      const companyData = {
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        website: formData.get('website'),
      }
      
      console.log('Company data to send:', companyData)
      await companiesAPI.registerCompany(companyData)
      
      toast.success('✅ Company registered! Awaiting approval.')
      setShowRegisterModal(false)
      await fetchCompanies()
    } catch (error) {
      console.error('❌ Error registering company:', error)
      console.error('Error response:', error.response)
      console.error('Error data:', error.response?.data)
      
      // Handle FastAPI validation errors (422)
      let errorMessage = 'Failed to register company'
      
      if (error.response?.status === 422) {
        const detail = error.response?.data?.detail
        console.log('422 Validation error detail:', detail)
        
        if (Array.isArray(detail)) {
          // FastAPI validation error format: [{type, loc, msg}]
          const messages = detail.map(err => {
            const field = Array.isArray(err.loc) ? err.loc.join('.') : 'field'
            return `${field}: ${err.msg || 'Invalid'}`
          })
          errorMessage = messages.join('; ')
        } else if (typeof detail === 'string') {
          errorMessage = detail
        } else if (detail) {
          errorMessage = JSON.stringify(detail)
        }
      } else if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail
        } else {
          errorMessage = JSON.stringify(error.response.data.detail)
        }
      } else if (error.message) {
        errorMessage = error.message
      }
      
      console.log('Final error message to show:', errorMessage)
      // Ensure errorMessage is always a string
      const safeErrorMessage = typeof errorMessage === 'string' ? errorMessage : String(errorMessage)
      toast.error(safeErrorMessage, { duration: 6000 })
    } finally {
      setSubmitting(false)
    }
  }

  // Handle reject
  const handleReject = async (companyId) => {
    const confirmed = await confirm({
      title: 'Reject Company',
      message: 'Are you sure you want to reject this company?',
      confirmText: 'Reject',
      cancelText: 'Cancel',
      isDangerous: true,
    })
    if (!confirmed) return
    
    try {
      await companiesAPI.updateCompanyStatus(companyId, 'cancelled')
      toast.success('Company rejected')
      await fetchCompanies()
    } catch (error) {
      toast.error('Failed to reject company')
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="text-gray-600 mt-1">Manage registered companies</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading companies...</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="text-gray-600 mt-1">Manage registered companies</p>
        </div>
        <div className="card text-center py-12">
          <div className="text-red-600 mb-4">
            <X className="h-12 w-12 mx-auto" />
          </div>
          <p className="text-gray-900 font-semibold mb-2">Failed to load companies</p>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <button onClick={fetchCompanies} className="btn btn-primary inline-flex items-center">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="text-gray-600 mt-1">
            Manage registered companies (Super Admin only)
          </p>
        </div>
        <button
          onClick={() => setShowRegisterModal(true)}
          className="btn btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Register Company
        </button>
      </div>

      {/* Companies List */}
      <div className="grid grid-cols-1 gap-6">
        {companies.length === 0 ? (
          <div className="card text-center py-12">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No companies registered yet</p>
            <button
              onClick={() => setShowRegisterModal(true)}
              className="btn btn-primary inline-flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Register First Company
            </button>
          </div>
        ) : (
          companies.map((company) => (
            <div key={company.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="h-12 w-12 rounded-lg bg-primary-100 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-primary-600" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {company.name}
                    </h3>
                    <p className="text-sm text-gray-500">{company.email}</p>
                    {company.created_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        Registered: {format(new Date(company.created_at), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span
                    className={`badge ${
                      company.status === 'active'
                        ? 'badge-success'
                        : company.status === 'pending'
                        ? 'badge-warning'
                        : 'badge-secondary'
                    }`}
                  >
                    {company.status}
                  </span>
                  {company.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApproveClick(company)}
                        className="btn btn-primary flex items-center"
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(company.id)}
                        className="btn btn-danger flex items-center"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Register Company Modal */}
      <Modal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        title="Register company"
        description="Create a tenant record. Approval and admin setup can happen after review."
        size="lg"
      >
        <form onSubmit={handleRegisterSubmit} className="space-y-6">
          <div className="rounded-2xl border border-primary-100 bg-primary-50/70 p-4 dark:border-primary-900/50 dark:bg-primary-950/20">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white p-2 text-primary-600 shadow-sm dark:bg-[var(--color-app-surface)]">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-[var(--color-app-text)]">Company profile</p>
                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-[var(--color-app-text-muted)]">
                  Use official business contact details so billing, approvals, and tenant ownership stay clear.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Company name" required className="sm:col-span-2">
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  type="text"
                  name="name"
                  required
                  className={`${inputClassName} pl-11`}
                  placeholder="TechCorp Inc."
                />
              </div>
            </FormField>

            <FormField label="Email" required>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  type="email"
                  name="email"
                  required
                  className={`${inputClassName} pl-11`}
                  placeholder="contact@techcorp.com"
                />
              </div>
            </FormField>

            <FormField label="Phone" required>
              <PhoneInput name="phone" required />
            </FormField>

            <FormField label="Website (optional)" helperText="Include https:// for best results." className="sm:col-span-2">
              <div className="relative">
                <Globe2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  type="url"
                  name="website"
                  className={`${inputClassName} pl-11`}
                  placeholder="https://techcorp.com"
                />
              </div>
            </FormField>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 dark:border-[var(--color-app-border)] sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setShowRegisterModal(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} loadingText="Registering">
              <Plus className="h-4 w-4" />
              Register Company
            </Button>
          </div>
        </form>
      </Modal>

      {/* Approve Company Modal */}
      <Modal
        isOpen={showApproveModal && Boolean(selectedCompany)}
        onClose={() => {
          setShowApproveModal(false)
          setSelectedCompany(null)
        }}
        title="Approve company"
        description={selectedCompany ? `Create company admin for ${selectedCompany.name}.` : ''}
        size="lg"
      >
        {selectedCompany ? (
          <form onSubmit={handleApproveSubmit} className="space-y-6">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-white p-2 text-emerald-600 shadow-sm dark:bg-[var(--color-app-surface)]">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-[var(--color-app-text)]">{selectedCompany.name}</p>
                  <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-[var(--color-app-text-muted)]">
                    Approval activates tenant access and creates first company admin.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Admin first name" required>
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    type="text"
                    name="admin_first_name"
                    required
                    className={`${inputClassName} pl-11`}
                    placeholder="John"
                  />
                </div>
              </FormField>

              <FormField label="Admin last name" required>
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    type="text"
                    name="admin_last_name"
                    required
                    className={`${inputClassName} pl-11`}
                    placeholder="Doe"
                  />
                </div>
              </FormField>

              <FormField label="Admin email" required>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    type="email"
                    name="admin_email"
                    required
                    className={`${inputClassName} pl-11`}
                    placeholder="admin@company.com"
                  />
                </div>
              </FormField>

              <FormField label="Admin password" required>
                <PasswordInput
                  name="admin_password"
                  required
                  minLength={8}
                  className={inputClassName}
                  placeholder="Min 8 characters"
                  toggleLabel="admin password"
                />
              </FormField>

              <FormField label="Subscription plan" className="sm:col-span-2">
                <div className="relative">
                  <CreditCard className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <select name="subscription_plan" className={`${inputClassName} pl-11`}>
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </FormField>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 dark:border-[var(--color-app-border)] sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowApproveModal(false)
                  setSelectedCompany(null)
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" loading={submitting} loadingText="Approving">
                <Check className="h-4 w-4" />
                Approve & Create Admin
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}

export default Companies
