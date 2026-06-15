import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { Settings } from 'lucide-react'
import { salesApi } from '../../api/sales'
import { Button, EmptyState, FormField, inputClassName, LoadingSpinner, Modal, PageHeader, Table } from '../../components/ui'
import { asArray } from '../phase4Utils'

const resources = [
  { key: 'stages', title: 'Stages', query: salesApi.getStages, create: salesApi.createStage, fields: ['name', 'order'] },
  { key: 'tags', title: 'Tags', query: salesApi.getTags, create: salesApi.createTag, fields: ['name'] },
  { key: 'channels', title: 'Channels', query: salesApi.getChannels, create: salesApi.createChannel, fields: ['name'] },
  { key: 'categories', title: 'Categories', query: salesApi.getCategories, create: salesApi.createCategory, fields: ['name'] },
  { key: 'products', title: 'Products', query: salesApi.getProducts, create: salesApi.createProduct, fields: ['name', 'category_id', 'rate', 'unit', 'state', 'city'] },
]

const emptyForm = (resource) =>
  resource.fields.reduce((form, field) => ({ ...form, [field]: field === 'rate' || field === 'order' ? '0' : '' }), {})

export default function SalesSettings() {
  return (
    <div className="p-6">
      <PageHeader title="Sales Settings" description="Manage stages, tags, channels, categories, and products." />
      <div className="grid gap-6 xl:grid-cols-2">
        {resources.map((resource) => <ResourceCard key={resource.key} resource={resource} />)}
      </div>
    </div>
  )
}

function ResourceCard({ resource }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => emptyForm(resource))
  const { data, isLoading } = useQuery(['sales-setting', resource.key], resource.query)
  const { data: categoriesData } = useQuery('sales-categories-for-product-form', salesApi.getCategories, { enabled: open && resource.key === 'products' })
  const rows = asArray(data, [resource.key])
  const categories = asArray(categoriesData, ['categories'])
  const mutation = useMutation(() => resource.create(form), {
    onSuccess: () => {
      toast.success(`${resource.title} updated`)
      setOpen(false)
      setForm(emptyForm(resource))
      queryClient.invalidateQueries(['sales-setting', resource.key])
      if (resource.key === 'categories') queryClient.invalidateQueries('sales-categories-for-product-form')
    },
  })

  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">{resource.title}</h2>
        <Button size="sm" onClick={() => setOpen(true)}>Add</Button>
      </div>
      {isLoading ? <LoadingSpinner label="Loading" /> : rows.length ? <Table columns={[{ key: 'name', header: 'Name', render: (row) => row.name || row.label || row.title || row.category_name || row.product_name }, { key: 'status', header: 'Status', render: (row) => row.status || (row.is_active === false ? 'Inactive' : 'Active') }]} data={rows} /> : <EmptyState icon={Settings} title={`No ${resource.title.toLowerCase()}`} />}
      <Modal isOpen={open} onClose={() => setOpen(false)} title={`Add ${resource.title}`}>
        <div className="space-y-4">
          {resource.fields.map((field) => (
            <FormField key={field} label={field.replaceAll('_', ' ')}>
              {field === 'category_id' ? (
                <select className={inputClassName} value={form.category_id} onChange={(event) => update('category_id', event.target.value)}>
                  <option value="">Select category</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              ) : (
                <input
                  className={inputClassName}
                  type={field === 'rate' || field === 'order' ? 'number' : 'text'}
                  value={form[field]}
                  onChange={(event) => update(field, event.target.value)}
                />
              )}
            </FormField>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={mutation.isLoading} onClick={() => mutation.mutate()}>Save</Button></div>
      </Modal>
    </section>
  )
}
