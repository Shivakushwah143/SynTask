import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Building2, Search, Users, Plus, Mail, Phone, Briefcase, Award, UserCheck, UserPlus, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { Badge, Button, ConfirmDialog, EmptyState, SkeletonTable, Table } from '../../../components/ui'
import { CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { ContactFormModal } from './components'

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
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800" title={subtitle}>
      <div className={`shrink-0 rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <div className="flex items-baseline gap-1.5">
          <p className="text-lg font-bold leading-tight text-gray-900 dark:text-white">{value}</p>
          {subtitle && <span className="truncate text-[10px] font-medium text-gray-400 dark:text-gray-500">{subtitle}</span>}
        </div>
      </div>
    </div>
  )
}

export default function CRMContactsPage() {
  const queryClient = useQueryClient()
  const [localSearch, setLocalSearch] = useState('')
  const context = useOutletContext()
  const search = context?.searchValue ?? localSearch
  const setSearch = context?.setSearchValue || setLocalSearch
  const [createOpen, setCreateOpen] = useState(false)
  const [editingContact, setEditingContact] = useState(null)
  const [deleteId, setDeleteId] = useState(null)

  const contactsQuery = useQuery(['crm-contacts', search], () => crmApi.getContacts({ search, limit: 100 }))
  const companiesQuery = useQuery('crm-contact-companies', () => crmApi.getCompanies({ limit: 500 }))

  const contactsData = contactsQuery.data?.contacts
  const companiesData = companiesQuery.data?.companies
  const contacts = useMemo(() => contactsData || [], [contactsData])
  const companies = useMemo(() => companiesData || [], [companiesData])

  const saveMutation = useMutation(
    (payload) => (editingContact ? crmApi.updateContact(editingContact.id, payload) : crmApi.createContact(payload)),
    {
      onSuccess: () => {
        toast.success(editingContact ? 'Contact updated' : 'Contact created')
        setCreateOpen(false)
        setEditingContact(null)
        queryClient.invalidateQueries('crm-contacts')
        queryClient.invalidateQueries('crm-companies')
      },
    }
  )

  const deleteMutation = useMutation((contactId) => crmApi.deleteContact(contactId), {
    onSuccess: () => {
      toast.success('Contact deleted')
      setDeleteId(null)
      queryClient.invalidateQueries('crm-contacts')
      queryClient.invalidateQueries('crm-companies')
    },
  })

  const companyOptions = useMemo(() => companies.map((company) => ({ id: company.id, name: company.name })), [companies])

  // Calculate stats
  const totalContacts = contacts.length
  const primaryContacts = contacts.filter((contact) => contact.is_primary_contact).length
  const linkedCompanies = new Set(contacts.map((contact) => contact.crm_company_id).filter(Boolean)).size
  const contactsWithEmail = contacts.filter((contact) => contact.email).length
  const contactsWithPhone = contacts.filter((contact) => contact.phone).length

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-semibold shadow-lg shadow-indigo-500/20">
            {row.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <button
            type="button"
            className="text-left font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
            onClick={() => {
              setEditingContact(row)
              setCreateOpen(true)
            }}
          >
            {row.full_name}
          </button>
        </div>
      ),
    },
    { 
      key: 'company', 
      header: 'Company', 
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-gray-700 dark:text-gray-300">{row.company_name || '-'}</span>
        </div>
      )
    },
    {
      key: 'primary',
      header: 'Type',
      render: (row) => (
        row.is_primary_contact 
          ? <Badge label="Primary" colorKey="emerald" className="gap-1.5">
              <Award className="h-3 w-3" /> Primary
            </Badge>
          : <Badge label="Secondary" colorKey="draft" />
      ),
    },
    { 
      key: 'designation', 
      header: 'Designation', 
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-gray-700 dark:text-gray-300">{row.designation || '-'}</span>
        </div>
      )
    },
    { 
      key: 'email', 
      header: 'Email', 
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-gray-700 dark:text-gray-300">{row.email || '-'}</span>
        </div>
      )
    },
    { 
      key: 'phone', 
      header: 'Phone', 
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-gray-700 dark:text-gray-300">{`${row.country_code || ''} ${row.phone || ''}`.trim() || '-'}</span>
        </div>
      )
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => { setEditingContact(row); setCreateOpen(true) }} className="gap-1">
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteId(row.id)} className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300">
            Delete
          </Button>
        </div>
      ),
    },
  ]

  const onSave = (payload) => {
    saveMutation.mutate(payload)
  }

  return (
    <CRMPage>
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-violet-600 px-4 py-3.5 text-white shadow-lg md:px-5 mb-5">
        <div className="absolute right-0 top-0 -mr-10 -mt-10 h-40 w-40 rounded-full bg-white/10 blur-2xl"></div>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-200">CRM</p>
              <h1 className="text-lg font-bold md:text-xl">Contacts</h1>
              <p className="truncate text-xs text-indigo-100 md:text-sm">Lead and account relationships grouped by CRM company.</p>
            </div>
          </div>
          <Button 
            onClick={() => { setEditingContact(null); setCreateOpen(true) }} 
            className="bg-white/20 px-3 py-1.5 text-xs text-white backdrop-blur-sm hover:bg-white/30 border-0"
          >
            <Plus className="h-3.5 w-3.5" />
            New Contact
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-5">
        <StatCard
          label="Total Contacts"
          value={totalContacts}
          icon={Users}
          color="indigo"
          subtitle="All contacts"
        />
        <StatCard
          label="Primary Contacts"
          value={primaryContacts}
          icon={Award}
          color="emerald"
          subtitle="Key contacts"
        />
        <StatCard
          label="Companies Linked"
          value={linkedCompanies}
          icon={Building2}
          color="amber"
          subtitle="Unique companies"
        />
        <StatCard
          label="With Email"
          value={contactsWithEmail}
          icon={Mail}
          color="blue"
          subtitle="Email available"
        />
      </div>

      {/* Contact Directory */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                <UserCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Contact Directory</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">{contacts.length} contacts</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="input input-sm pl-8"
              placeholder="Search contacts by name, company, email, or phone..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {contactsQuery.isLoading ? (
            <SkeletonTable rows={6} cols={6} />
          ) : contactsQuery.isError ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-900/30">
                <Users className="h-8 w-8 text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Could not load contacts</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{contactsQuery.error?.response?.data?.detail || 'Try refreshing the page.'}</p>
            </div>
          ) : contacts.length ? (
            <Table columns={columns} data={contacts} />
          ) : (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
                <UserPlus className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white">No contacts yet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Add the first contact to attach people to CRM companies.</p>
              <Button onClick={() => setCreateOpen(true)} className="mt-4">Add Contact</Button>
            </div>
          )}
        </div>
      </div>

      <ContactFormModal
        isOpen={createOpen}
        onClose={() => { setCreateOpen(false); setEditingContact(null) }}
        onSave={onSave}
        title={editingContact ? 'Edit Contact' : 'Create Contact'}
        contact={editingContact}
        companyOptions={companyOptions}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        loading={deleteMutation.isLoading}
        title="Delete Contact"
        message="The contact will be removed from the CRM workspace. This action cannot be undone."
        confirmLabel="Delete Contact"
      />
    </CRMPage>
  )
}
