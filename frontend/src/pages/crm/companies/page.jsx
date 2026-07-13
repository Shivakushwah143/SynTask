import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Building2, CircleDot, Clock3, Plus, Search, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { Button, ConfirmDialog, EmptyState, FormField, inputClassName, Modal, SkeletonTable, Table } from '../../../components/ui'
import { CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'

const COMPANY_TEMPLATE = {
  name: '',
  email: '',
  phone: '',
  website: '',
  industry: '',
  company_size: '',
  notes: '',
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={company ? 'Edit company' : 'New company'} size="xl">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Company name" required>
          <input className={inputClassName} value={form.name} onChange={(event) => update('name', event.target.value)} />
        </FormField>
        <FormField label="Email">
          <input className={inputClassName} value={form.email} onChange={(event) => update('email', event.target.value)} />
        </FormField>
        <FormField label="Phone">
          <input className={inputClassName} value={form.phone} onChange={(event) => update('phone', event.target.value)} />
        </FormField>
        <FormField label="Website">
          <input className={inputClassName} value={form.website} onChange={(event) => update('website', event.target.value)} />
        </FormField>
        <FormField label="Industry">
          <input className={inputClassName} value={form.industry} onChange={(event) => update('industry', event.target.value)} />
        </FormField>
        <FormField label="Company size">
          <input className={inputClassName} value={form.company_size} onChange={(event) => update('company_size', event.target.value)} />
        </FormField>
        <FormField label="Notes" className="md:col-span-2">
          <textarea className={`${inputClassName} min-h-28`} value={form.notes} onChange={(event) => update('notes', event.target.value)} />
        </FormField>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(form)} disabled={!form.name}>{company ? 'Save' : 'Create'}</Button>
      </div>
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
    onSuccess: () => {
      toast.success('Company created')
      setCompanyModalOpen(false)
      setEditingCompany(null)
      queryClient.invalidateQueries('crm-companies')
    },
  })

  const updateMutation = useMutation(({ companyId, payload }) => crmApi.updateCompany(companyId, payload), {
    onSuccess: () => {
      toast.success('Company updated')
      setCompanyModalOpen(false)
      setEditingCompany(null)
      queryClient.invalidateQueries('crm-companies')
    },
  })

  const deleteMutation = useMutation((companyId) => crmApi.deleteCompany(companyId), {
    onSuccess: () => {
      toast.success('Company deleted')
      setDeleteId(null)
      queryClient.invalidateQueries('crm-companies')
    },
  })

  const columns = [
    {
      key: 'name',
      header: 'Company',
      render: (row) => (
        <button
          type="button"
          className="text-left font-medium text-primary-700 hover:underline dark:text-primary-300"
          onClick={() => navigate(`/crm/companies/${row.id}`)}
        >
          {row.name}
        </button>
      ),
    },
    { key: 'industry', header: 'Industry', render: (row) => row.industry || '-' },
    { key: 'contacts', header: 'Contacts', render: (row) => String(row.contact_count || 0) },
    { key: 'leads', header: 'Leads', render: (row) => String(row.lead_count || 0) },
    { key: 'primary', header: 'Primary contact', render: (row) => row.primary_contact_name || '-' },
    { key: 'updated', header: 'Updated', render: (row) => (row.updated_at ? format(new Date(row.updated_at), 'MMM d, yyyy') : '-') },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setEditingCompany(row); setCompanyModalOpen(true) }}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteId(row.id)}>
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
    if (editingCompany) {
      updateMutation.mutate({ companyId: editingCompany.id, payload })
      return
    }
    createMutation.mutate(payload)
  }

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM"
        title="Companies"
        description="Accounts and their related contacts, leads, and activity."
        actions={(
            <Button onClick={() => { setEditingCompany(null); setCompanyModalOpen(true) }}>
            <Plus className="h-4 w-4" />
            New
            </Button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CRMStatCard icon={Building2} label="Companies" value={String(stats.total)} tone="blue" />
        <CRMStatCard icon={Users} label="Contacts" value={String(stats.contacts)} tone="emerald" />
        <CRMStatCard icon={CircleDot} label="Leads" value={String(stats.leads)} tone="amber" />
        <CRMStatCard icon={Clock3} label="Primary contacts" value={String(stats.primary)} tone="slate" />
      </div>

        <CRMSection title="Company directory" description="Search and manage CRM accounts.">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input className={`${inputClassName} pl-10`} placeholder="Search companies..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        {companiesQuery.isLoading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : companiesQuery.isError ? (
          <EmptyState icon={Building2} title="Could not load companies" description={companiesQuery.error?.response?.data?.detail || 'Try refreshing the page.'} />
        ) : companies.length ? (
          <Table columns={columns} data={companies} />
        ) : (
          <EmptyState icon={Building2} title="No companies yet" description="Create the first CRM account to connect contacts and leads." action={<Button onClick={() => setCompanyModalOpen(true)}>Create</Button>} />
        )}
      </CRMSection>

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
        title="Delete company"
        message="This removes the company from CRM."
        confirmLabel="Delete"
      />
    </CRMPage>
  )
}
