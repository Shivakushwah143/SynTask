import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Building2, Search, Users, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { Badge, Button, ConfirmDialog, EmptyState, SkeletonTable, Table, inputClassName } from '../../../components/ui'
import { CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { ContactFormModal } from './components'

export default function CRMContactsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
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

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <button
          type="button"
          className="text-left font-medium text-primary-700 hover:underline dark:text-primary-300"
          onClick={() => {
            setEditingContact(row)
            setCreateOpen(true)
          }}
        >
          {row.full_name}
        </button>
      ),
    },
    { key: 'company', header: 'Company', render: (row) => row.company_name || '-' },
    {
      key: 'primary',
      header: 'Primary',
      render: (row) => (row.is_primary_contact ? <Badge label="Primary" colorKey="emerald" /> : <Badge label="Secondary" colorKey="draft" />),
    },
    { key: 'designation', header: 'Designation', render: (row) => row.designation || '-' },
    { key: 'email', header: 'Email', render: (row) => row.email || '-' },
    { key: 'phone', header: 'Phone', render: (row) => `${row.country_code || ''} ${row.phone || ''}`.trim() || '-' },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setEditingContact(row); setCreateOpen(true) }}>Edit</Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteId(row.id)}>Delete</Button>
        </div>
      ),
    },
  ]

  const stats = useMemo(() => ({
    contacts: contacts.length,
    primary: contacts.filter((contact) => contact.is_primary_contact).length,
    companies: new Set(contacts.map((contact) => contact.crm_company_id).filter(Boolean)).size,
  }), [contacts])

  const onSave = (payload) => {
    saveMutation.mutate(payload)
  }

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM"
        title="Contacts"
        description="Lead and account relationships grouped by CRM company."
        actions={(
          <Button onClick={() => { setEditingContact(null); setCreateOpen(true) }}>
            <Plus className="h-4 w-4" />
            New contact
          </Button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CRMStatCard icon={Users} label="Contacts" value={String(stats.contacts)} tone="blue" />
        <CRMStatCard icon={Users} label="Primary contacts" value={String(stats.primary)} tone="emerald" />
        <CRMStatCard icon={Building2} label="Companies linked" value={String(stats.companies)} tone="amber" />
      </div>

      <CRMSection title="Contact directory" description="Search, create, edit and delete CRM contacts.">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            className={`${inputClassName} pl-10`}
            placeholder="Search contacts..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {contactsQuery.isLoading ? (
          <SkeletonTable rows={6} cols={6} />
        ) : contactsQuery.isError ? (
          <EmptyState icon={Users} title="Could not load contacts" description={contactsQuery.error?.response?.data?.detail || 'Try refreshing the page.'} />
        ) : contacts.length ? (
          <Table columns={columns} data={contacts} />
        ) : (
          <EmptyState icon={Users} title="No contacts yet" description="Add the first contact to attach people to CRM companies." action={<Button onClick={() => setCreateOpen(true)}>Add contact</Button>} />
        )}
      </CRMSection>

      <ContactFormModal
        isOpen={createOpen}
        onClose={() => { setCreateOpen(false); setEditingContact(null) }}
        onSave={onSave}
        title={editingContact ? 'Edit contact' : 'Create contact'}
        contact={editingContact}
        companyOptions={companyOptions}
      />

      <ConfirmDialog
        isOpen={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(deleteId)}
        loading={deleteMutation.isLoading}
        title="Delete contact"
        message="The contact will be removed from the CRM workspace."
        confirmLabel="Delete"
      />
    </CRMPage>
  )
}
