import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Building2, Search } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { Badge, Button, EmptyState, inputClassName, PageHeader, SkeletonTable, Table } from '../../components/ui'
import { asArray, getId } from '../phase4Utils'

export default function TenantManagement() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const { data, isLoading, isError } = useQuery(['superadmin-tenants', search], () => superadminApi.getTenants({ search }))
  const tenants = asArray(data, ['tenants', 'companies']).filter((tenant) => `${tenant.name || tenant.company_name || ''}`.toLowerCase().includes(search.toLowerCase()))
  const activate = useMutation((id) => superadminApi.activateTenant(id), { onSuccess: () => { toast.success('Tenant activated'); queryClient.invalidateQueries('superadmin-tenants') } })
  const suspend = useMutation((id) => superadminApi.suspendTenant(id), { onSuccess: () => { toast.success('Tenant suspended'); queryClient.invalidateQueries('superadmin-tenants') } })

  const columns = [
    { key: 'name', header: 'Company', render: (row) => <Link className="font-medium text-primary-700" to={`/super-admin/tenants/${getId(row)}`}>{row.name || row.company_name}</Link> },
    { key: 'status', header: 'Status', render: (row) => <Badge label={row.status || 'pending'} colorKey={row.status} /> },
    { key: 'plan', header: 'Plan', render: (row) => row.plan || row.subscription_plan || '-' },
    { key: 'users', header: 'Users', render: (row) => row.user_count ?? row.current_users ?? '-' },
    { key: 'actions', header: '', render: (row) => <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => activate.mutate(getId(row))}>Activate</Button><Button size="sm" variant="danger" onClick={() => suspend.mutate(getId(row))}>Suspend</Button></div> },
  ]

  return (
    <div>
      <PageHeader title="Tenant Management" description="Review, activate, and suspend tenant companies." />
      <div className="relative mb-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input className={`${inputClassName} pl-10`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tenants..." /></div>
      {isLoading ? <SkeletonTable rows={7} cols={5} /> : isError ? <EmptyState icon={Building2} title="Could not load tenants" /> : tenants.length ? <Table columns={columns} data={tenants} /> : <EmptyState icon={Building2} title="No tenants found" />}
    </div>
  )
}
