import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Building2, Search, Filter, ShieldAlert } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { Badge, Button, EmptyState, inputClassName, PageHeader, SkeletonTable, Table } from '../../components/ui'
import { asArray, getId } from '../phase4Utils'

export default function TenantManagement() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const { data, isLoading, isError } = useQuery(['superadmin-tenants', search], () => superadminApi.getTenants({ search }))
  const tenants = asArray(data, ['tenants', 'companies'])
    .filter((tenant) => `${tenant.name || tenant.company_name || ''}`.toLowerCase().includes(search.toLowerCase()))
    .filter((tenant) => statusFilter === 'all' ? true : String(tenant.status || '').toLowerCase() === statusFilter)
    .sort((a, b) => riskScore(b) - riskScore(a))
  const activate = useMutation((id) => superadminApi.activateTenant(id), { onSuccess: () => { toast.success('Tenant activated'); queryClient.invalidateQueries('superadmin-tenants') } })
  const suspend = useMutation((id) => superadminApi.suspendTenant(id), { onSuccess: () => { toast.success('Tenant suspended'); queryClient.invalidateQueries('superadmin-tenants') } })
  const riskyTenants = tenants.filter((tenant) => riskScore(tenant) > 0).length

  const columns = [
    { key: 'name', header: 'Company', render: (row) => <Link className="font-medium text-primary-700" to={`/super-admin/tenants/${getId(row)}`}>{row.name || row.company_name}</Link> },
    { key: 'status', header: 'Status', render: (row) => <Badge label={row.status || 'pending'} colorKey={row.status} /> },
    { key: 'plan', header: 'Plan', render: (row) => row.plan || row.subscription_plan || '-' },
    { key: 'users', header: 'Users', render: (row) => row.user_count ?? row.current_users ?? '-' },
    { key: 'actions', header: '', render: (row) => <div className="flex gap-2"><Link to={`/super-admin/tenants/${getId(row)}`}><Button size="sm" variant="secondary">View</Button></Link><Button size="sm" variant="secondary" onClick={() => activate.mutate(getId(row))}>Activate</Button><Button size="sm" variant="danger" onClick={() => suspend.mutate(getId(row))}>Suspend</Button></div> },
  ]

  return (
    <div>
      <PageHeader
        title="Tenant Management"
        description="Review, activate, and suspend tenant companies."
        actions={<div className="flex items-center gap-2 text-sm text-gray-500"><ShieldAlert className="h-4 w-4 text-amber-500" />{riskyTenants} risky tenant{riskyTenants === 1 ? '' : 's'}</div>}
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input className={`${inputClassName} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tenants..." />
        </div>
        <div className="flex flex-wrap gap-2">
          <Filter className="mt-2 h-4 w-4 text-gray-400" />
          {['all', 'active', 'pending', 'suspended', 'inactive'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                statusFilter === status
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-primary-300 hover:text-primary-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'
              }`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? <SkeletonTable rows={7} cols={5} /> : isError ? <EmptyState icon={Building2} title="Could not load tenants" /> : tenants.length ? <Table columns={columns} data={tenants} /> : <EmptyState icon={Building2} title="No tenants found" />}
    </div>
  )
}

function riskScore(tenant) {
  const status = String(tenant?.status || '').toLowerCase()
  if (['suspended', 'blocked'].includes(status)) return 3
  if (['pending', 'inactive', 'overdue'].includes(status)) return 2
  return 0
}
