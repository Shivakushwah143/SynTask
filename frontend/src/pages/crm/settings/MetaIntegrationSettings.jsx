import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { metaApi } from '../../../api/meta'
import { useAuthStore } from '../../../store/authStore'
import { Button, FormField, inputClassName } from '../../../components/ui'

const ADMIN_ROLES = new Set(['admin', 'super_admin'])
const EMPTY_FORM = {
  enabled: false,
  lead_sync_enabled: false,
  insights_sync_enabled: false,
  inbound_messaging_enabled: false,
  page_id: '',
  page_access_token: '',
  business_id: '',
  ad_account_id: '',
  system_user_token: '',
  lead_form_id: '',
  whatsapp_business_id: '',
  default_lead_owner_id: '',
}

export function MetaIntegrationSettings() {
  const user = useAuthStore((state) => state.user)
  const [result, setResult] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const queryClient = useQueryClient()
  const companyId = user?.role === 'super_admin' ? user?.company_id : undefined
  const allowed = ADMIN_ROLES.has(user?.role)
  const tenantSelected = user?.role !== 'super_admin' || Boolean(companyId)
  const settingsQuery = useQuery(['meta-settings', companyId], () => metaApi.getSettings(companyId), { enabled: allowed && tenantSelected, retry: false })
  const healthQuery = useQuery(['meta-health', companyId], () => metaApi.getHealth(companyId), { enabled: allowed && tenantSelected, retry: false })
  const testMutation = useMutation(() => metaApi.testConnection(companyId), {
    onSuccess: (data) => {
      setResult(data?.status === 'connected' ? 'Connected' : 'Connection test completed')
      queryClient.invalidateQueries(['meta-health', companyId])
    },
    onError: () => setResult('Connection test failed'),
  })
  const saveMutation = useMutation((payload) => metaApi.updateSettings(payload, companyId), {
    onSuccess: (data) => {
      queryClient.setQueryData(['meta-settings', companyId], data)
      queryClient.invalidateQueries(['meta-health', companyId])
      toast.success('Meta settings saved')
      setResult('Settings saved')
      setForm((state) => ({ ...state, page_access_token: '', system_user_token: '' }))
    },
    onError: (error) => setResult(error?.response?.data?.detail || error?.message || 'Meta settings could not be saved'),
  })
  const syncMutation = useMutation(() => metaApi.syncNow(companyId), {
    onSuccess: () => {
      toast.success('Meta sync queued')
      setResult('Sync queued')
    },
    onError: () => setResult('Sync could not be queued'),
  })

  useEffect(() => {
    const config = settingsQuery.data
    if (!config) return
    setForm({
      enabled: Boolean(config.enabled),
      lead_sync_enabled: Boolean(config.lead_sync_enabled),
      insights_sync_enabled: Boolean(config.insights_sync_enabled),
      inbound_messaging_enabled: Boolean(config.inbound_messaging_enabled),
      page_id: config.page_id || '',
      page_access_token: '',
      business_id: config.business_id || '',
      ad_account_id: config.ad_account_id || '',
      system_user_token: '',
      lead_form_id: config.lead_form_id || '',
      whatsapp_business_id: config.whatsapp_business_id || '',
      default_lead_owner_id: config.default_lead_owner_id || '',
    })
  }, [settingsQuery.data])

  const updateField = (field, value) => setForm((state) => ({ ...state, [field]: value }))
  const save = () => {
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, value]) => value !== ''),
    )
    saveMutation.mutate(payload)
  }

  if (!allowed) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Admin access required.</div>
  }
  if (!tenantSelected) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Select a tenant before managing its Meta integration.</div>
  }
  if (settingsQuery.isLoading || healthQuery.isLoading) return <div className="p-4 text-sm text-slate-500">Loading Meta integration…</div>
  if (settingsQuery.isError || healthQuery.isError) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Meta integration status could not be loaded.</div>
  }

  const config = settingsQuery.data || {}
  const health = healthQuery.data || {}
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="meta-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="meta-settings-title" className="text-lg font-semibold text-slate-900">Meta Integration</h2>
          <p className="text-sm text-slate-500">Read-only connection controls for Lead Ads and marketing insights.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{health.status || 'unknown'}</span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Status label="App ID" value={config.app_id} />
        <Status label="Page" value={config.page_id} />
        <Status label="Ad account" value={config.ad_account_id} />
        <Status label="Page token" value={config.page_access_token_masked} />
        <Status label="System token" value={config.system_user_token_masked} />
        <Status label="Webhook" value={health.webhook_status} />
        <Status label="Last sync" value={health.last_insights_sync_at} />
        <Status label="Last error" value={health.last_error_code} />
      </dl>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Toggle label="Enabled" checked={form.enabled} onChange={(value) => updateField('enabled', value)} />
        <Toggle label="Lead sync" checked={form.lead_sync_enabled} onChange={(value) => updateField('lead_sync_enabled', value)} />
        <Toggle label="Insights sync" checked={form.insights_sync_enabled} onChange={(value) => updateField('insights_sync_enabled', value)} />
        <Toggle label="Inbound messaging" checked={form.inbound_messaging_enabled} onChange={(value) => updateField('inbound_messaging_enabled', value)} />
        <TextField label="Page ID" value={form.page_id} onChange={(value) => updateField('page_id', value)} />
        <TextField label="Lead form ID" value={form.lead_form_id} onChange={(value) => updateField('lead_form_id', value)} />
        <TextField label="Business ID" value={form.business_id} onChange={(value) => updateField('business_id', value)} />
        <TextField label="Ad account ID" value={form.ad_account_id} onChange={(value) => updateField('ad_account_id', value)} />
        <TextField label="WhatsApp business ID" value={form.whatsapp_business_id} onChange={(value) => updateField('whatsapp_business_id', value)} />
        <TextField label="Default lead owner ID" value={form.default_lead_owner_id} onChange={(value) => updateField('default_lead_owner_id', value)} />
        <TextField label="New page token" type="password" value={form.page_access_token} onChange={(value) => updateField('page_access_token', value)} />
        <TextField label="New system user token" type="password" value={form.system_user_token} onChange={(value) => updateField('system_user_token', value)} />
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="button" variant="secondary" onClick={save} loading={saveMutation.isLoading} loadingText="Saving">Save Settings</Button>
        <Button type="button" onClick={() => testMutation.mutate()} disabled={testMutation.isLoading}>Test Connection</Button>
        <Button type="button" variant="secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isLoading}>Sync Now</Button>
      </div>
      {result ? <p className="mt-3 text-sm text-slate-700" role="status">{result}</p> : null}
    </section>
  )
}

function Status({ label, value }) {
  return <div><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="break-all text-sm text-slate-900">{value || 'Not configured'}</dd></div>
}

function TextField({ label, value, onChange, type = 'text' }) {
  return (
    <FormField label={label}>
      <input className={inputClassName} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </FormField>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}
