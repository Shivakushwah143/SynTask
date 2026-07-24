import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { Line, LineChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { CreditCard } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { Badge, Button, EmptyState, inputClassName, Modal, PageHeader, SkeletonTable, Table } from '../../components/ui'
import { ChartTooltip } from '../../components/charts/ChartTooltip'
import { asArray, formatDate, formatMoney, getId } from '../phase4Utils'

export default function BillingRevenue() {
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState('30d')
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [form, setForm] = useState({ company_id: '', amount: '', description: 'SynTask Subscription', tax_rate: 18, billing_period_start: '', billing_period_end: '' })
  const revenue = useQuery(['superadmin-revenue', period], () => superadminApi.getRevenueAnalytics({ period }))
  const tenants = useQuery('superadmin-tenants-invoice-options', () => superadminApi.getTenants({ limit: 1000 }))
  const invoices = useQuery('superadmin-invoices', () => superadminApi.listInvoices({ limit: 50 }))
  const rows = asArray(invoices.data, ['invoices'])
  const trend = asArray(revenue.data?.monthly_breakdown || revenue.data?.monthly || revenue.data?.trend || [], ['items'])
  const generate = useMutation((data) => superadminApi.generateInvoice(data), {
    onSuccess: () => { toast.success('Invoice generated'); setInvoiceOpen(false); queryClient.invalidateQueries('superadmin-invoices') },
    onError: (error) => toast.error(error.response?.data?.detail?.detail || error.response?.data?.detail || 'Could not generate invoice'),
  })
  const send = useMutation((invoiceId) => superadminApi.sendInvoice(invoiceId), {
    onSuccess: (response) => toast.success(response?.message || 'Invoice sent'),
    onError: (error) => toast.error(error.response?.data?.detail?.detail || error.response?.data?.detail || 'Could not send invoice'),
  })
  const columns = [
    { key: 'invoice_number', header: 'Invoice #' },
    { key: 'company', header: 'Company', render: (row) => row.company_name || row.company_id || '-' },
    { key: 'amount', header: 'Amount', render: (row) => formatMoney(row.amount) },
    { key: 'tax_amount', header: 'Tax', render: (row) => formatMoney(row.tax_amount) },
    { key: 'total_amount', header: 'Total', render: (row) => formatMoney(row.total_amount) },
    { key: 'status', header: 'Status', render: (row) => <Badge label={row.status || row.payment_status || 'pending'} colorKey={row.status || row.payment_status} /> },
    { key: 'due_date', header: 'Due Date', render: (row) => formatDate(row.due_date) },
    { key: 'sent', header: 'Sent', render: (row) => row.email_sent_at ? formatDate(row.email_sent_at) : '-' },
    { key: 'actions', header: '', render: (row) => <Button size="sm" variant="secondary" loading={send.isLoading} onClick={() => send.mutate(getId(row))}>Send Email</Button> },
  ]
  const tenantOptions = asArray(tenants.data, ['tenants', 'companies'])

  return (
    <div>
      <PageHeader title="Billing & Invoices" description="Revenue analytics, invoices, and email sending." actions={<Button onClick={() => setInvoiceOpen(true)}>Generate Invoice</Button>} />
      {revenue.isLoading || invoices.isLoading ? <SkeletonTable rows={6} cols={5} /> : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">{['7d', '30d', '90d', '1y'].map((item) => <button key={item} type="button" onClick={() => setPeriod(item)} className={`rounded-full border px-3 py-1 text-sm font-medium ${period === item ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600'}`}>{item}</button>)}</div>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="MRR" value={formatMoney(revenue.data?.mrr)} />
            <Stat label="Collected" value={formatMoney(revenue.data?.total_revenue)} />
            <Stat label="Pending" value={formatMoney(revenue.data?.pending_revenue)} />
            <Stat label="Overdue Subs" value={revenue.data?.overdue_subscriptions || 0} />
          </div>
          {trend.length ? <section className="rounded-2xl border border-surface-border bg-surface/95 p-4"><h2 className="mb-4 font-semibold text-gray-900">Revenue trend</h2><div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend}><CartesianGrid strokeDasharray="3 3" strokeOpacity={0.18} /><XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} /><YAxis tick={{ fill: '#6b7280', fontSize: 11 }} /><ChartTooltip valueFormatter={(value) => formatMoney(value)} /><Line dataKey="revenue" name="Revenue" stroke="#2563eb" strokeWidth={2} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer></div></section> : null}
          {rows.length ? <Table columns={columns} data={rows} /> : <EmptyState icon={CreditCard} title="No invoices found" />}
        </div>
      )}
      <Modal isOpen={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="Generate Invoice" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setInvoiceOpen(false)}>Cancel</Button><Button loading={generate.isLoading} onClick={() => generate.mutate({ ...form, amount: Number(form.amount), tax_rate: Number(form.tax_rate), billing_period_start: form.billing_period_start || null, billing_period_end: form.billing_period_end || null })}>Generate</Button></div>}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium md:col-span-2">Company<select className={`${inputClassName} mt-1`} value={form.company_id} onChange={(event) => setForm((value) => ({ ...value, company_id: event.target.value }))}><option value="">Select company</option>{tenantOptions.map((tenant) => <option key={getId(tenant)} value={getId(tenant)}>{tenant.name || tenant.company_name}</option>)}</select></label>
          <label className="block text-sm font-medium">Amount<input className={`${inputClassName} mt-1`} type="number" min="1" value={form.amount} onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))} /></label>
          <label className="block text-sm font-medium">Tax Rate<input className={`${inputClassName} mt-1`} type="number" min="0" value={form.tax_rate} onChange={(event) => setForm((value) => ({ ...value, tax_rate: event.target.value }))} /></label>
          <label className="block text-sm font-medium">Billing Period Start<input className={`${inputClassName} mt-1`} type="date" value={form.billing_period_start} onChange={(event) => setForm((value) => ({ ...value, billing_period_start: event.target.value }))} /></label>
          <label className="block text-sm font-medium">Billing Period End<input className={`${inputClassName} mt-1`} type="date" value={form.billing_period_end} onChange={(event) => setForm((value) => ({ ...value, billing_period_end: event.target.value }))} /></label>
          <label className="block text-sm font-medium md:col-span-2">Description<textarea className={`${inputClassName} mt-1 min-h-20`} value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} /></label>
        </div>
      </Modal>
    </div>
  )
}

function Stat({ label, value }) {
  return <div className="rounded-2xl border border-surface-border bg-surface/95 p-4"><p className="text-sm text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>
}
