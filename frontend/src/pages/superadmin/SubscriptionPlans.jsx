import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { Package } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { Button, EmptyState, inputClassName, Modal, PageHeader, SkeletonTable } from '../../components/ui'
import { asArray, formatMoney } from '../phase4Utils'

const emptyForm = { name: '', description: '', price_monthly: 0, price_yearly: 0, max_users: 5, max_projects: 5, max_storage_gb: 5, features: '', enabled_modules: '' }

export default function SubscriptionPlans() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const { data, isLoading } = useQuery('superadmin-plans', superadminApi.getPlans)
  const plans = asArray(data, ['plans'])
  const save = useMutation(
    (payload) => payload.id ? superadminApi.updatePlan(payload.id, payload.data) : superadminApi.createPlan(payload.data),
    { onSuccess: () => { toast.success('Plan saved'); setEditing(null); queryClient.invalidateQueries('superadmin-plans') }, onError: (error) => toast.error(error.response?.data?.detail || 'Could not save plan') },
  )

  const openEditor = (plan = null) => {
    setEditing(plan || {})
    setForm(plan ? { ...emptyForm, ...plan, features: (plan.features || []).join(', '), enabled_modules: (plan.enabled_modules || []).join(', ') } : emptyForm)
  }
  const payload = {
    ...form,
    price_monthly: Number(form.price_monthly) || 0,
    price_yearly: Number(form.price_yearly) || 0,
    max_users: Number(form.max_users) || 0,
    max_projects: Number(form.max_projects) || 0,
    max_storage_gb: Number(form.max_storage_gb) || 0,
    features: splitList(form.features),
    enabled_modules: splitList(form.enabled_modules),
  }

  return (
    <div>
      <PageHeader title="Subscription Plans" description="Manage plan tiers, limits, storage, and included features." actions={<Button onClick={() => openEditor()}>Create Plan</Button>} />
      {isLoading ? <SkeletonTable rows={5} cols={5} /> : plans.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => <PlanCard key={plan.id} plan={plan} onEdit={() => openEditor(plan)} />)}
        </div>
      ) : <EmptyState icon={Package} title="No plans found" action={<Button onClick={() => openEditor()}>Create Plan</Button>} />}
      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit Plan' : 'Create Plan'} size="lg" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button loading={save.isLoading} onClick={() => save.mutate({ id: editing?.id, data: payload })}>Save</Button></div>}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" value={form.name} onChange={(value) => setForm((state) => ({ ...state, name: value }))} />
          <Field label="Monthly Price" type="number" value={form.price_monthly} onChange={(value) => setForm((state) => ({ ...state, price_monthly: value }))} />
          <Field label="Yearly Price" type="number" value={form.price_yearly} onChange={(value) => setForm((state) => ({ ...state, price_yearly: value }))} />
          <Field label="Max Users" type="number" value={form.max_users} onChange={(value) => setForm((state) => ({ ...state, max_users: value }))} />
          <Field label="Max Projects" type="number" value={form.max_projects} onChange={(value) => setForm((state) => ({ ...state, max_projects: value }))} />
          <Field label="Storage GB" type="number" value={form.max_storage_gb} onChange={(value) => setForm((state) => ({ ...state, max_storage_gb: value }))} />
          <label className="block text-sm font-medium md:col-span-2">Features<textarea className={`${inputClassName} mt-1 min-h-20`} value={form.features} onChange={(event) => setForm((state) => ({ ...state, features: event.target.value }))} placeholder="tasks_projects, ai_agents" /></label>
          <label className="block text-sm font-medium md:col-span-2">Enabled Modules<textarea className={`${inputClassName} mt-1 min-h-20`} value={form.enabled_modules} onChange={(event) => setForm((state) => ({ ...state, enabled_modules: event.target.value }))} placeholder="tasks_projects, sales_crm" /></label>
          <label className="block text-sm font-medium md:col-span-2">Description<textarea className={`${inputClassName} mt-1 min-h-20`} value={form.description} onChange={(event) => setForm((state) => ({ ...state, description: event.target.value }))} /></label>
        </div>
      </Modal>
    </div>
  )
}

function PlanCard({ plan, onEdit }) {
  return <section className="rounded-2xl border border-surface-border bg-surface p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-gray-900">{plan.name}</h2><p className="mt-1 text-sm text-gray-500">{plan.description || 'No description'}</p></div><Button size="sm" variant="secondary" onClick={onEdit}>Edit</Button></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Metric label="Monthly" value={formatMoney(plan.price_monthly)} /><Metric label="Yearly" value={formatMoney(plan.price_yearly)} /><Metric label="Users" value={plan.max_users ?? 'Unlimited'} /><Metric label="Projects" value={plan.max_projects ?? 'Unlimited'} /><Metric label="Storage" value={`${plan.max_storage_gb ?? 0} GB`} /></div><div className="mt-4 flex flex-wrap gap-2">{(plan.features || []).map((feature) => <span key={feature} className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">{feature}</span>)}</div></section>
}

function Metric({ label, value }) {
  return <div><p className="text-xs uppercase text-gray-500">{label}</p><p className="font-semibold text-gray-900">{value}</p></div>
}

function Field({ label, value, onChange, type = 'text' }) {
  return <label className="block text-sm font-medium">{label}<input className={`${inputClassName} mt-1`} type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} /></label>
}

function splitList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}
