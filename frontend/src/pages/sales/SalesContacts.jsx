import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { salesApi } from '../../api/sales'
import { Badge, Button, ConfirmDialog, EmptyState, FormField, inputClassName, LoadingSpinner, Modal, PageHeader, Table } from '../../components/ui'
import { asArray, formatDate, getId, toFormData } from '../phase4Utils'

export default function SalesContacts() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const { data, isLoading, isError } = useQuery(['sales-contacts', search], () => salesApi.getContacts({ search, limit: 50 }))
  const contacts = asArray(data, ['contacts'])

  const deleteMutation = useMutation((id) => salesApi.deleteContact(id), {
    onSuccess: () => {
      toast.success('Contact deleted')
      setDeleteId(null)
      queryClient.invalidateQueries('sales-contacts')
    },
  })

  const columns = [
    { key: 'name', header: 'Name', render: (row) => <Link className="font-medium text-primary-700" to={`/sales/contacts/${getId(row)}`}>{row.first_name} {row.last_name}</Link> },
    { key: 'company_name', header: 'Company', render: (row) => row.company_name || '-' },
    { key: 'email', header: 'Email', render: (row) => row.email || '-' },
    { key: 'phone', header: 'Phone', render: (row) => `${row.country_code || ''} ${row.phone || ''}` },
    { key: 'channel', header: 'Channel', render: (row) => row.channel ? <Badge label={row.channel} /> : '-' },
    { key: 'created_at', header: 'Created', render: (row) => formatDate(row.created_at) },
    { key: 'actions', header: '', render: (row) => <Button variant="ghost" size="sm" onClick={() => setDeleteId(getId(row))}>Delete</Button> },
  ]

  return (
    <div className="p-6">
      <PageHeader title="Contacts" description={`${contacts.length} contacts`} actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add Contact</Button>} />
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input className={`${inputClassName} pl-10`} placeholder="Search contacts..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {isLoading ? <LoadingSpinner label="Loading contacts" /> : isError ? <EmptyState icon={Users} title="Could not load contacts" description="Try refreshing the page." /> : contacts.length ? <Table columns={columns} data={contacts} /> : <EmptyState icon={Users} title="No contacts yet" description="Add your first sales contact." action={<Button onClick={() => setCreateOpen(true)}>Add Contact</Button>} />}
      <ContactModal isOpen={createOpen} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); queryClient.invalidateQueries('sales-contacts') }} />
      <ConfirmDialog isOpen={Boolean(deleteId)} onClose={() => setDeleteId(null)} onConfirm={() => deleteMutation.mutate(deleteId)} loading={deleteMutation.isLoading} title="Delete contact" message="This contact will be removed from the CRM." confirmLabel="Delete" />
    </div>
  )
}

function ContactModal({ isOpen, onClose, onDone }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', country_code: '+91', phone: '', email: '', company_name: '' })
  const mutation = useMutation((payload) => salesApi.createContact(toFormData(payload)), {
    onSuccess: () => {
      toast.success('Contact created')
      onDone()
    },
  })
  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add contact">
      <div className="grid gap-4 sm:grid-cols-2">
        {['first_name', 'last_name', 'country_code', 'phone', 'email', 'company_name'].map((key) => (
          <FormField key={key} label={key.replace('_', ' ')}>
            <input className={inputClassName} value={form[key]} onChange={(event) => update(key, event.target.value)} />
          </FormField>
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={mutation.isLoading} onClick={() => mutation.mutate(form)}>Save</Button>
      </div>
    </Modal>
  )
}
