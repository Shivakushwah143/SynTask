import { useQuery } from 'react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2 } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { Badge, Button, EmptyState, LoadingSpinner, PageHeader } from '../../components/ui'
import { formatDate } from '../phase4Utils'

export default function TenantDetail() {
  const { id } = useParams()
  const tenant = useQuery(['superadmin-tenant', id], () => superadminApi.getTenant(id), { enabled: Boolean(id) })
  const usage = useQuery(['superadmin-tenant-usage', id], () => superadminApi.getCompanyUsage(id), { enabled: Boolean(id) })
  if (tenant.isLoading) return <LoadingSpinner label="Loading tenant" />
  if (tenant.isError || !tenant.data) return <EmptyState icon={Building2} title="Tenant not found" />

  return (
    <div>
      <PageHeader title={tenant.data.name || tenant.data.company_name || 'Tenant'} description="Tenant details and usage." actions={<Link to="/super-admin/tenants"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>} />
      <div className="grid gap-4 md:grid-cols-3">
        <Info label="Status" value={<Badge label={tenant.data.status || 'pending'} colorKey={tenant.data.status} />} />
        <Info label="Email" value={tenant.data.email} />
        <Info label="Plan" value={tenant.data.plan || tenant.data.subscription_plan} />
        <Info label="Users" value={usage.data?.users || tenant.data.user_count} />
        <Info label="Projects" value={usage.data?.projects || tenant.data.project_count} />
        <Info label="Created" value={formatDate(tenant.data.created_at)} />
      </div>
    </div>
  )
}

function Info({ label, value }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase text-gray-500">{label}</p><div className="mt-2 text-sm text-gray-900">{value || '-'}</div></div>
}
