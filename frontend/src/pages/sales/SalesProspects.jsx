import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { Briefcase, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { salesApi } from '../../api/sales'
import { usersAPI } from '../../api/users'
import { Badge, Button, EmptyState, FormField, inputClassName, LoadingSpinner, Modal, PageHeader, Table } from '../../components/ui'
import { asArray, formatDate, getId } from '../phase4Utils'

export default function SalesProspects() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError } = useQuery(['sales-prospects', search], () => salesApi.getProspects({ search, limit: 50 }))
  const prospects = asArray(data, ['prospects'])

  const columns = [
    { key: 'prospect_name', header: 'Prospect', render: (row) => <Link className="font-medium text-primary-700" to={`/sales/prospects/${getId(row)}`}>{row.prospect_name || `${row.first_name || ''} ${row.last_name || ''}`}</Link> },
    { key: 'company_name', header: 'Company', render: (row) => row.company_name || '-' },
    { key: 'interest_level', header: 'Interest', render: (row) => row.interest_level ? <Badge label={row.interest_level} colorKey={row.interest_level} /> : '-' },
    { key: 'current_stage', header: 'Stage', render: (row) => row.current_stage || '-' },
    { key: 'status', header: 'Status', render: (row) => <Badge label={row.status || 'open'} colorKey={row.status || 'active'} /> },
    { key: 'estimated_close_date', header: 'Close Date', render: (row) => formatDate(row.estimated_close_date) },
  ]

  return (
    <div className="p-6">
      <PageHeader title="Prospects" description={`${prospects.length} active prospects`} actions={<Button onClick={() => setOpen(true)}>Add Prospect</Button>} />
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input className={`${inputClassName} pl-10`} placeholder="Search prospects..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {isLoading ? <LoadingSpinner label="Loading prospects" /> : isError ? <EmptyState icon={Briefcase} title="Could not load prospects" /> : prospects.length ? <Table columns={columns} data={prospects} /> : <EmptyState icon={Briefcase} title="No prospects yet" description="Create prospects to fill your pipeline." action={<Button onClick={() => setOpen(true)}>Add Prospect</Button>} />}
      <ProspectModal isOpen={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); queryClient.invalidateQueries('sales-prospects') }} />
    </div>
  )
}

function ProspectModal({ isOpen, onClose, onDone }) {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    country_code: '+91',
    phone: '',
    category_id: '',
    product_ids: [],
    interest_level: 'medium',
    estimated_close_date: new Date().toISOString().slice(0, 10),
    assigned_to: '',
    current_stage: '',
    email: '',
    company_name: '',
    remark: '',
  })

  const { data: stagesData } = useQuery('sales-stages-for-prospect', salesApi.getStages, { enabled: isOpen })
  const { data: categoriesData } = useQuery('sales-categories-for-prospect', salesApi.getCategories, { enabled: isOpen })
  const { data: productsData } = useQuery('sales-products-for-prospect', salesApi.getProducts, { enabled: isOpen })
  const { data: usersData } = useQuery('assignable-users-for-prospect', () => usersAPI.getAssignableUsers(), { enabled: isOpen })

  const stages = asArray(stagesData, ['stages'])
  const categories = asArray(categoriesData, ['categories'])
  const products = asArray(productsData, ['products'])
  const users = asArray(usersData, ['users'])

  const mutation = useMutation((payload) => salesApi.createProspect(payload), {
    onSuccess: () => {
      toast.success('Prospect created')
      onDone()
    },
  })
  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))
  const toggleProduct = (productId) => {
    setForm((state) => ({
      ...state,
      product_ids: state.product_ids.includes(productId)
        ? state.product_ids.filter((id) => id !== productId)
        : [...state.product_ids, productId],
    }))
  }

  const submit = () => {
    if (!form.category_id || !form.current_stage || !form.assigned_to || form.product_ids.length === 0) {
      toast.error('Select category, stage, owner, and at least one product')
      return
    }
    mutation.mutate({
      ...form,
      product_ids: form.product_ids.join('|'),
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add prospect" size="lg">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="First name">
          <input className={inputClassName} value={form.first_name} onChange={(event) => update('first_name', event.target.value)} required />
        </FormField>
        <FormField label="Last name">
          <input className={inputClassName} value={form.last_name} onChange={(event) => update('last_name', event.target.value)} required />
        </FormField>
        <FormField label="Country code">
          <input className={inputClassName} value={form.country_code} onChange={(event) => update('country_code', event.target.value)} required />
        </FormField>
        <FormField label="Phone">
          <input className={inputClassName} value={form.phone} onChange={(event) => update('phone', event.target.value)} required />
        </FormField>
        <FormField label="Email">
          <input className={inputClassName} type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
        </FormField>
        <FormField label="Company">
          <input className={inputClassName} value={form.company_name} onChange={(event) => update('company_name', event.target.value)} />
        </FormField>
        <FormField label="Category">
          <select className={inputClassName} value={form.category_id} onChange={(event) => update('category_id', event.target.value)} required>
            <option value="">Select category</option>
            {categories.map((category) => <option key={getId(category)} value={getId(category)}>{category.name}</option>)}
          </select>
        </FormField>
        <FormField label="Stage">
          <select className={inputClassName} value={form.current_stage} onChange={(event) => update('current_stage', event.target.value)} required>
            <option value="">Select stage</option>
            {stages.map((stage) => <option key={getId(stage)} value={getId(stage)}>{stage.name}</option>)}
          </select>
        </FormField>
        <FormField label="Owner">
          <select className={inputClassName} value={form.assigned_to} onChange={(event) => update('assigned_to', event.target.value)} required>
            <option value="">Assign to</option>
            {users.map((user) => <option key={getId(user)} value={getId(user)}>{user.first_name} {user.last_name}</option>)}
          </select>
        </FormField>
        <FormField label="Interest level">
          <select className={inputClassName} value={form.interest_level} onChange={(event) => update('interest_level', event.target.value)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </FormField>
        <FormField label="Estimated close date">
          <input className={inputClassName} type="date" value={form.estimated_close_date} onChange={(event) => update('estimated_close_date', event.target.value)} required />
        </FormField>
        <FormField label="Remark">
          <input className={inputClassName} value={form.remark} onChange={(event) => update('remark', event.target.value)} />
        </FormField>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-gray-700">Products</p>
        <div className="grid max-h-40 gap-2 overflow-y-auto rounded-lg border border-gray-200 p-3 sm:grid-cols-2">
          {products.length ? products.map((product) => (
            <label key={getId(product)} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.product_ids.includes(getId(product))}
                onChange={() => toggleProduct(getId(product))}
              />
              {product.name}
            </label>
          )) : <span className="text-sm text-gray-500">Create products in Sales Settings first.</span>}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={mutation.isLoading} onClick={submit}>Save</Button>
      </div>
    </Modal>
  )
}
