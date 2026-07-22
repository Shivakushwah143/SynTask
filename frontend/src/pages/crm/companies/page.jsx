import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Building2, CircleDot, Clock3, Plus, Search, Users, Briefcase, Mail, Phone, Globe, FileText, TrendingUp, Activity, Building, Award } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { Button, ConfirmDialog, EmptyState, FormField, inputClassName, Modal, PhoneInput, SkeletonTable, Table, phoneValidationMessage } from '../../../components/ui'
import { CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { timeService } from '@/services/timeService'

const COMPANY_TEMPLATE = {
  name: '',
  email: '',
  phone: '',
  website: '',
  industry: '',
  company_size: '',
  notes: '',
}

const normalizeCompanyPayload = (payload) =>
  Object.fromEntries(
    Object.entries(payload || {})
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => value !== '' && value !== undefined && value !== null)
  )

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

function CompanyModal({ isOpen, onClose, onSave, company = null }) {
  const [form, setForm] = useState(COMPANY_TEMPLATE)

  useEffect(() => {
    if (!isOpen) return
    setForm({
      ...COMPANY_TEMPLATE,
      ...(company || {}),
    })
  }, [company, isOpen])

  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))
  const submit = (event) => {
    event.preventDefault()
    onSave(form)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={company ? 'Edit Company' : 'New Company'} size="xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
          <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {company ? 'Edit Company Details' : 'Add a New Company'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {company ? 'Update company information' : 'Enter company details to add to CRM'}
          </p>
        </div>
      </div>
      <form onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Company Name" required>
          <input className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`} value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Acme Corp" />
        </FormField>
        <FormField label="Email">
          <input className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`} value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="contact@company.com" />
        </FormField>
        <FormField label="Phone">
          <PhoneInput className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`} value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="+1 234 567 890" />
        </FormField>
        <FormField label="Website">
          <input className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`} value={form.website} onChange={(event) => update('website', event.target.value)} placeholder="https://example.com" />
        </FormField>
        <FormField label="Industry">
          <input className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`} value={form.industry} onChange={(event) => update('industry', event.target.value)} placeholder="Technology" />
        </FormField>
        <FormField label="Company Size">
          <input className={`${inputClassName} bg-gray-50 dark:bg-gray-900/50`} value={form.company_size} onChange={(event) => update('company_size', event.target.value)} placeholder="50-100 employees" />
        </FormField>
        <FormField label="Notes" className="md:col-span-2">
          <textarea className={`${inputClassName} min-h-28 resize-y bg-gray-50 dark:bg-gray-900/50`} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Additional details about this company..." />
        </FormField>
      </div>
      <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!form.name || Boolean(phoneValidationMessage(form.phone))}>
          {company ? 'Save Changes' : 'Create Company'}
        </Button>
      </div>
      </form>
    </Modal>
  )
}

export default function CRMCompaniesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [companyModalOpen, setCompanyModalOpen] = useState(false)
  const [editingCompany, setEditingCompany] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const companiesQuery = useQuery(['crm-companies', search], () => crmApi.getCompanies({ search, limit: 100 }))
  const companiesData = companiesQuery.data?.companies
  const companies = useMemo(() => companiesData || [], [companiesData])

  const createMutation = useMutation((payload) => crmApi.createCompany(payload), {
    onSuccess: (response) => {
      const createdCompany = response?.company || response?.data?.company || null
      if (createdCompany) {
        queryClient.setQueryData(['crm-companies', search], (current) => {
          const currentCompanies = Array.isArray(current?.companies) ? current.companies : []
          const withoutDuplicate = currentCompanies.filter((company) => company.id !== createdCompany.id)
          return {
            ...(current || {}),
            companies: [createdCompany, ...withoutDuplicate],
            total: typeof current?.total === 'number' ? current.total + 1 : withoutDuplicate.length + 1,
          }
        })
      }
      toast.success('Company created successfully')
      setCompanyModalOpen(false)
      setEditingCompany(null)
    },
    onError: (error) => {
      const message = error?.response?.data?.detail || error?.message || 'Failed to create company'
      toast.error(message)
    },
  })

  const updateMutation = useMutation(({ companyId, payload }) => crmApi.updateCompany(companyId, payload), {
    onSuccess: () => {
      toast.success('Company updated successfully')
      setCompanyModalOpen(false)
      setEditingCompany(null)
      queryClient.invalidateQueries(['crm-companies'])
    },
    onError: (error) => {
      const message = error?.response?.data?.detail || error?.message || 'Failed to update company'
      toast.error(message)
    },
  })

  const deleteMutation = useMutation((companyId) => crmApi.deleteCompany(companyId), {
    onSuccess: () => {
      toast.success('Company deleted successfully')
      setDeleteId(null)
      queryClient.invalidateQueries(['crm-companies'])
    },
  })

  const columns = [
    {
      key: 'name',
      header: 'Company',
      render: (row) => (
        <button
          type="button"
          className="text-left font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
          onClick={() => navigate(`/crm/companies/${row.id}`)}
        >
          {row.name}
        </button>
      ),
    },
    { key: 'industry', header: 'Industry', render: (row) => row.industry || <span className="text-gray-400 dark:text-gray-600">—</span> },
    { key: 'contacts', header: 'Contacts', render: (row) => String(row.contact_count || 0) },
    { key: 'leads', header: 'Leads', render: (row) => String(row.lead_count || 0) },
    { key: 'primary', header: 'Primary Contact', render: (row) => row.primary_contact_name || <span className="text-gray-400 dark:text-gray-600">—</span> },
    { key: 'updated', header: 'Updated', render: (row) => (row.updated_at ? format(new Date(row.updated_at), 'MMM d, yyyy') : '-') },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => { setEditingCompany(row); setCompanyModalOpen(true) }} className="gap-1">
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteId(row.id)} className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300">
            Delete
          </Button>
        </div>
      ),
    },
  ]

  const stats = useMemo(() => ({
    total: companies.length,
    contacts: companies.reduce((sum, company) => sum + Number(company.contact_count || 0), 0),
    leads: companies.reduce((sum, company) => sum + Number(company.lead_count || 0), 0),
    primary: companies.filter((company) => company.primary_contact_id).length,
  }), [companies])

  const onSave = (payload) => {
    const normalizedPayload = normalizeCompanyPayload(payload)
    if (editingCompany) {
      updateMutation.mutate({ companyId: editingCompany.id, payload: normalizedPayload })
      return
    }
    createMutation.mutate(normalizedPayload)
  }

  return (
    <CRMPage>
      <section className="mb-6 overflow-hidden rounded-[28px] border border-primary-200/70 bg-gradient-to-br from-slate-700 via-violet-600 to-purple-500 p-6 text-white shadow-[0_18px_60px_rgba(15,23,42,0.06)] md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/20 p-2.5 backdrop-blur-sm">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-indigo-100">CRM</p>
              <h1 className="text-2xl font-semibold md:text-3xl">Companies</h1>
              <p className="mt-1 text-sm leading-6 text-indigo-100">Accounts and their related contacts, leads, and activity.</p>
            </div>
          </div>
          <Button 
            onClick={() => { setEditingCompany(null); setCompanyModalOpen(true) }} 
            className="border-0 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
          >
            <Plus className="h-4 w-4" />
            New Company
          </Button>
        </div>
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CRMStatCard icon={Building2} label="Companies" value={String(stats.total)} helper="Total accounts" tone="blue" />
        <CRMStatCard icon={Users} label="Contacts" value={String(stats.contacts)} helper="Associated contacts" tone="slate" />
        <CRMStatCard icon={CircleDot} label="Leads" value={String(stats.leads)} helper="Active leads" tone="emerald" />
        <CRMStatCard icon={Award} label="Primary Contacts" value={String(stats.primary)} helper="Key contacts" tone="amber" />
      </div>

      {/* Company Directory */}
      <div className="overflow-hidden rounded-[24px] border border-primary-200/70 bg-white/90 shadow-[0_14px_40px_rgba(15,23,42,0.06)] dark:border-[#5a4635] dark:bg-[rgb(29_24_19_/_0.88)]">
        <div className="border-b border-primary-200/70 bg-gradient-to-r from-primary-50/60 to-white p-4 dark:border-[#5a4635] dark:from-[#241c14] dark:to-[rgb(29_24_19_/_0.88)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <Building className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Company Directory</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{companies.length} companies</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input 
              className={`${inputClassName} pl-10 bg-gray-50 dark:bg-gray-900/50`} 
              placeholder="Search companies by name, industry, or primary contact..." 
              value={search} 
              onChange={(event) => setSearch(event.target.value)} 
            />
          </div>

          {companiesQuery.isLoading ? (
            <SkeletonTable rows={6} cols={6} />
          ) : companiesQuery.isError ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-900/30">
                <Building2 className="h-8 w-8 text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Could not load companies</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{companiesQuery.error?.response?.data?.detail || 'Try refreshing the page.'}</p>
            </div>
          ) : companies.length ? (
            <Table columns={columns} data={companies} />
          ) : (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                <Building2 className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">No companies yet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Create your first company to connect contacts and leads.</p>
              <Button onClick={() => setCompanyModalOpen(true)} className="mt-4">Create Company</Button>
            </div>
          )}
        </div>
      </div>

      <CompanyModal
        isOpen={companyModalOpen}
        company={editingCompany}
        onClose={() => { setCompanyModalOpen(false); setEditingCompany(null) }}
        onSave={onSave}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        loading={deleteMutation.isLoading}
        title="Delete Company"
        message="This will permanently remove this company from the CRM. This action cannot be undone."
        confirmLabel="Delete Company"
      />
    </CRMPage>
  )
}
