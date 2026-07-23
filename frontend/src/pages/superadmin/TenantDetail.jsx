import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Building2 } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { Badge, Button, EmptyState, inputClassName, Modal, PageHeader, SkeletonCard, Table } from '../../components/ui'
import { asArray, formatDate, formatMoney } from '../phase4Utils'

export default function TenantDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'overview'
  const queryClient = useQueryClient()
  const [resetUser, setResetUser] = useState(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [planForm, setPlanForm] = useState({ plan_id: '', billing_cycle: 'monthly', custom_user_limit: '', notes: '' })

  const tenant = useQuery(['superadmin-tenant', id], () => superadminApi.getTenant(id), { enabled: Boolean(id) })
  const users = useQuery(['superadmin-tenant-users', id], () => superadminApi.getCompanyUsers(id), { enabled: Boolean(id) && tab === 'users' })
  const usage = useQuery(['superadmin-tenant-usage-detailed', id], () => superadminApi.getCompanyDetailedUsage(id), { enabled: Boolean(id) && tab === 'usage' })
  const plans = useQuery('superadmin-plans', superadminApi.getPlans)
  const features = useQuery(['superadmin-features', id], () => superadminApi.getCompanyFeatures(id), { enabled: Boolean(id) && tab === 'features' })

  const detail = tenant.data?.company ? tenant.data : { company: tenant.data || {}, subscription: tenant.data?.subscription, plan: tenant.data?.plan }
  const company = detail.company || {}
  const subscription = detail.subscription || {}
  const currentPlan = detail.plan || {}

  const resetPassword = useMutation((userId) => superadminApi.resetUserPassword(id, userId), {
    onSuccess: (response) => { toast.success(response?.message || 'Password reset email sent'); setResetUser(null) },
    onError: (error) => toast.error(error.response?.data?.detail?.detail || error.response?.data?.detail || 'Could not send reset email'),
  })
  const assignPlan = useMutation((data) => superadminApi.assignPlan(id, data), {
    onSuccess: () => { toast.success('Plan assigned'); setPlanOpen(false); queryClient.invalidateQueries(['superadmin-tenant', id]) },
    onError: (error) => toast.error(error.response?.data?.detail?.detail || error.response?.data?.detail || 'Could not assign plan'),
  })
  const toggleFeature = useMutation((data) => superadminApi.toggleFeature(id, data), {
    onSuccess: () => { toast.success('Feature updated'); queryClient.invalidateQueries(['superadmin-features', id]) },
    onError: (error) => toast.error(error.response?.data?.detail?.detail || error.response?.data?.detail || 'Could not update feature'),
  })

  const planOptions = asArray(plans.data, ['plans'])
  const userRows = asArray(users.data, ['users'])
  const featureRows = asArray(features.data, ['features'])
  const tabs = useMemo(() => ['overview', 'users', 'subscription', 'features', 'usage'], [])

  if (tenant.isLoading) return <div className="p-6"><SkeletonCard lines={8} /></div>
  if (tenant.isError || !company) return <EmptyState icon={Building2} title="Tenant not found" />

  return (
    <div>
      <PageHeader title={company.name || company.company_name || 'Tenant'} description="Tenant controls, users, subscription, feature flags, and usage." actions={<Link to="/super-admin/tenants"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>} />
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((item) => <button key={item} type="button" onClick={() => setParams({ tab: item })} className={`rounded-full border px-3 py-1 text-sm font-medium ${tab === item ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>{item.charAt(0).toUpperCase() + item.slice(1)}</button>)}
      </div>

      {tab === 'overview' ? <Overview company={company} subscription={subscription} plan={currentPlan} /> : null}
      {tab === 'users' ? <Table columns={[{ key: 'name', header: 'Name', render: (row) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '-' }, { key: 'email', header: 'Email' }, { key: 'role', header: 'Role' }, { key: 'active', header: 'Active', render: (row) => row.is_active ? 'Yes' : 'No' }, { key: 'actions', header: '', render: (row) => <Button size="sm" variant="secondary" onClick={() => setResetUser(row)}>Reset Password</Button> }]} data={userRows} /> : null}
      {tab === 'subscription' ? <SubscriptionBlock subscription={subscription} plan={currentPlan} onChange={() => { setPlanForm((form) => ({ ...form, plan_id: subscription.plan_id || '' })); setPlanOpen(true) }} /> : null}
      {tab === 'features' ? <div className="grid gap-3 md:grid-cols-2">{featureRows.map((feature) => <FeatureCard key={feature.key} feature={feature} loading={toggleFeature.isLoading} onToggle={() => toggleFeature.mutate({ feature_key: feature.key, is_enabled: !feature.is_enabled, notes: feature.notes })} />)}</div> : null}
      {tab === 'usage' ? <UsageBlock usage={usage.data} company={company} loading={usage.isLoading} /> : null}

      <Modal isOpen={Boolean(resetUser)} onClose={() => setResetUser(null)} title="Reset Password" description={resetUser?.email} footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setResetUser(null)}>Cancel</Button><Button loading={resetPassword.isLoading} onClick={() => resetPassword.mutate(resetUser.id)}>Send Email</Button></div>}>Send password reset email to this user?</Modal>
      <Modal isOpen={planOpen} onClose={() => setPlanOpen(false)} title="Change Plan" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setPlanOpen(false)}>Cancel</Button><Button loading={assignPlan.isLoading} onClick={() => assignPlan.mutate({ ...planForm, custom_user_limit: planForm.custom_user_limit ? Number(planForm.custom_user_limit) : null })}>Save</Button></div>}>
        <div className="space-y-4">
          <label className="block text-sm font-medium">Plan<select className={`${inputClassName} mt-1`} value={planForm.plan_id} onChange={(event) => setPlanForm((form) => ({ ...form, plan_id: event.target.value }))}><option value="">Select plan</option>{planOptions.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
          <label className="block text-sm font-medium">Billing cycle<select className={`${inputClassName} mt-1`} value={planForm.billing_cycle} onChange={(event) => setPlanForm((form) => ({ ...form, billing_cycle: event.target.value }))}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
          <label className="block text-sm font-medium">Custom user limit<input className={`${inputClassName} mt-1`} type="number" min="1" value={planForm.custom_user_limit} onChange={(event) => setPlanForm((form) => ({ ...form, custom_user_limit: event.target.value }))} /></label>
          <label className="block text-sm font-medium">Notes<textarea className={`${inputClassName} mt-1 min-h-20`} value={planForm.notes} onChange={(event) => setPlanForm((form) => ({ ...form, notes: event.target.value }))} /></label>
        </div>
      </Modal>
    </div>
  )
}

function Overview({ company, subscription, plan }) {
  return <div className="grid gap-4 md:grid-cols-3"><Info label="Status" value={<Badge label={company.status || 'pending'} colorKey={company.status} />} /><Info label="Email" value={company.email} /><Info label="Plan" value={plan.name || subscription.plan_name || subscription.plan_id} /><Info label="Users Limit" value={company.max_users} /><Info label="Projects Limit" value={company.max_projects} /><Info label="Created" value={formatDate(company.created_at)} /></div>
}

function SubscriptionBlock({ subscription, plan, onChange }) {
  return <section className="rounded-2xl border border-surface-border bg-surface p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Subscription</h2><p className="mt-1 text-sm text-gray-500">{plan.name || subscription.plan_id || 'No plan assigned'}</p></div><Button onClick={onChange}>Change Plan</Button></div><div className="mt-4 grid gap-4 md:grid-cols-4"><Info label="Billing Cycle" value={subscription.billing_cycle} /><Info label="Amount" value={formatMoney(subscription.amount)} /><Info label="Next Billing" value={formatDate(subscription.next_billing_date)} /><Info label="Status" value={subscription.status} /></div></section>
}

function FeatureCard({ feature, loading, onToggle }) {
  return <div className="rounded-2xl border border-surface-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">{feature.label}</h3><p className="mt-1 text-sm text-gray-500">{feature.description}</p><p className="mt-2 text-xs text-gray-400">{feature.enabled_at ? `Enabled at ${formatDate(feature.enabled_at)}` : 'No enable history'}</p></div><button type="button" disabled={loading} onClick={onToggle} className={`h-6 w-11 rounded-full p-1 transition ${feature.is_enabled ? 'bg-green-600' : 'bg-gray-300'}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${feature.is_enabled ? 'translate-x-5' : ''}`} /></button></div></div>
}

function UsageBlock({ usage, company, loading }) {
  if (loading) return <SkeletonCard lines={5} />
  const storageLimit = Number(company.max_storage_gb || 10) * 1024
  const used = Number(usage?.storage_used_mb || 0)
  const pct = storageLimit ? Math.min((used / storageLimit) * 100, 100) : 0
  return <div className="grid gap-4 md:grid-cols-3"><Info label="Active Users" value={usage?.active_users} /><Info label="Total Users" value={`${usage?.total_users || 0} / ${company.max_users || '-'}`} /><Info label="API Requests This Month" value={usage?.api_requests_this_month} /><Info label="Projects" value={usage?.project_count} /><Info label="Tasks" value={usage?.task_count} /><div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase text-gray-500">Storage</p><p className="mt-2 text-sm text-gray-900">{used} MB / {storageLimit} MB</p><div className="mt-3 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-primary-600" style={{ width: `${pct}%` }} /></div></div></div>
}

function Info({ label, value }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase text-gray-500">{label}</p><div className="mt-2 text-sm text-gray-900">{value || '-'}</div></div>
}
