import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { Package } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { Button, EmptyState, FormField, inputClassName, Modal, PageHeader, SkeletonTable, Table } from '../../components/ui'
import { asArray, formatMoney } from '../phase4Utils'

export default function SubscriptionPlans() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', price: '', billing_cycle: 'monthly' })
  const { data, isLoading } = useQuery('superadmin-plans', superadminApi.getPlans)
  const plans = asArray(data, ['plans'])
  const create = useMutation((payload) => superadminApi.createPlan(payload), { onSuccess: () => { toast.success('Plan created'); setOpen(false); queryClient.invalidateQueries('superadmin-plans') } })
  const columns = [
    { key: 'name', header: 'Plan', render: (row) => row.name || row.plan_name },
    { key: 'price', header: 'Price', render: (row) => formatMoney(row.price || row.amount) },
    { key: 'billing_cycle', header: 'Billing', render: (row) => row.billing_cycle || '-' },
    { key: 'features', header: 'Features', render: (row) => Array.isArray(row.features) ? row.features.slice(0, 3).join(', ') : '-' },
  ]
  const update = (key, value) => setForm((state) => ({ ...state, [key]: value }))

  return (
    <div>
      <PageHeader title="Subscription Plans" description="Manage plan tiers and pricing." actions={<Button onClick={() => setOpen(true)}>Create Plan</Button>} />
      {isLoading ? <SkeletonTable rows={5} cols={5} /> : plans.length ? <Table columns={columns} data={plans} /> : <EmptyState icon={Package} title="No plans found" action={<Button onClick={() => setOpen(true)}>Create Plan</Button>} />}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Create plan">
        <div className="grid gap-4">
          {Object.keys(form).map((key) => <FormField key={key} label={key.replace('_', ' ')}><input className={inputClassName} value={form[key]} onChange={(event) => update(key, event.target.value)} /></FormField>)}
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.isLoading} onClick={() => create.mutate(form)}>Save</Button></div>
      </Modal>
    </div>
  )
}
