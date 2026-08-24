import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { 
  Building2, 
  Search, 
  Filter, 
  ShieldAlert, 
  Users, 
  CreditCard, 
  Calendar, 
  Clock, 
  AlertTriangle,
  Check,
  CheckCircle2,
  XCircle,
  Eye,
  Settings,
  UserPlus,
  Mail,
  Phone,
  Globe,
  BarChart3,
  TrendingUp,
  Activity,
  Zap,
  Award,
  Shield,
  Lock,
  Unlock,
  RefreshCw,
  Download,
  Plus,
  Globe2,
  ShieldCheck,
  User,
  ChevronDown,
  ChevronRight,
  DollarSign,
  PieChart,
  LineChart
} from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { companiesAPI } from '../../api/companies'
import { Badge, Button, EmptyState, FormField, inputClassName, Modal, PageHeader, PasswordInput, PhoneInput, SkeletonTable, Table } from '../../components/ui'
import { timeService } from '@/services/timeService'
import { asArray, getId } from '../phase4Utils'

// Stat Card Component
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle, trend }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-md bg-gradient-to-r ${colors[color]} p-1.5 text-white shadow-sm`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>}
      {trend && (
        <div className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  )
}

// Tenant Card Component for Grid View
const TenantCard = ({ tenant, onSuspend, onActivate, isActivating, isSuspending }) => {
  const statusColor = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    suspended: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    inactive: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  }

  const statusIcon = {
    active: CheckCircle2,
    pending: Clock,
    suspended: XCircle,
    inactive: AlertTriangle,
  }

  const StatusIcon = statusIcon[tenant.status] || CheckCircle2

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-bold text-lg shadow-lg shadow-indigo-500/20">
            {tenant.name?.charAt(0)?.toUpperCase() || tenant.company_name?.charAt(0)?.toUpperCase() || 'T'}
          </div>
          <div>
            <Link 
              to={`/super-admin/tenants/${getId(tenant)}`}
              className="font-semibold text-gray-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
            >
              {tenant.name || tenant.company_name}
            </Link>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[tenant.status] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                <StatusIcon className="h-3 w-3" />
                {tenant.status || 'pending'}
              </span>
              {tenant.plan && (
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  {tenant.plan}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link to={`/super-admin/tenants/${getId(tenant)}`}>
            <Button variant="secondary" size="sm" className="gap-1">
              <Eye className="h-3.5 w-3.5" />
              View
            </Button>
          </Link>
          {tenant.status === 'suspended' ? (
            <Button 
              size="sm" 
              variant="secondary" 
              loading={isActivating} 
              onClick={() => onActivate(getId(tenant))}
              className="gap-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
            >
              <Unlock className="h-3.5 w-3.5" />
              Activate
            </Button>
          ) : (
            <Button 
              size="sm" 
              variant="danger" 
              onClick={() => onSuspend(tenant)}
              className="gap-1"
            >
              <Lock className="h-3.5 w-3.5" />
              Suspend
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-gray-50 p-2.5 text-center dark:bg-gray-900/50">
          <Users className="mx-auto h-4 w-4 text-gray-400" />
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {tenant.user_count ?? tenant.current_users ?? 0}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Users</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-2.5 text-center dark:bg-gray-900/50">
          <CreditCard className="mx-auto h-4 w-4 text-gray-400" />
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {tenant.plan || 'Free'}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Plan</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-2.5 text-center dark:bg-gray-900/50">
          <Calendar className="mx-auto h-4 w-4 text-gray-400" />
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
            {tenant.created_at ? timeService.formatDate(tenant.created_at) : 'N/A'}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Created</p>
        </div>
      </div>

      {riskScore(tenant) > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-800/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Risk score: {riskScore(tenant)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// Quick Actions Component
const QuickActions = ({ onRefresh, onExport }) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" onClick={onRefresh} className="gap-1.5">
        <RefreshCw className="h-4 w-4" />
        Refresh
      </Button>
      <Button variant="secondary" size="sm" onClick={onExport} className="gap-1.5">
        <Download className="h-4 w-4" />
        Export
      </Button>
    </div>
  )
}

export default function TenantManagement() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [viewMode, setViewMode] = useState('table')
  const [suspendTarget, setSuspendTarget] = useState(null)
  const [suspendForm, setSuspendForm] = useState({ reason: 'payment_failed', notes: '', notify_admin: true })
  const [selectedTenants, setSelectedTenants] = useState([])
  const [showBulkActions, setShowBulkActions] = useState(false)
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState(null)
  
  const { data, isLoading, isError, refetch } = useQuery(
    ['superadmin-tenants', search], 
    () => superadminApi.getTenants({ search }),
    { staleTime: 30000 }
  )
  
  const tenants = asArray(data, ['tenants', 'companies'])
    .filter((tenant) => `${tenant.name || tenant.company_name || ''}`.toLowerCase().includes(search.toLowerCase()))
    .filter((tenant) => statusFilter === 'all' ? true : String(tenant.status || '').toLowerCase() === statusFilter)
    .sort((a, b) => riskScore(b) - riskScore(a))
  
  const activate = useMutation(
    (id) => superadminApi.activateTenant(id), 
    { 
      onSuccess: () => { 
        toast.success('Tenant activated successfully'); 
        queryClient.invalidateQueries('superadmin-tenants') 
      },
      onError: (error) => toast.error(error?.response?.data?.detail || 'Failed to activate tenant')
    }
  )
  
  const suspend = useMutation(
    ({ id, data }) => superadminApi.suspendTenant(id, data),
    { 
      onSuccess: () => { 
        toast.success('Tenant suspended successfully'); 
        setSuspendTarget(null); 
        queryClient.invalidateQueries('superadmin-tenants') 
      }, 
      onError: (error) => toast.error(error?.response?.data?.detail || 'Could not suspend tenant') 
    }
  )

  const rejectTenant = useMutation(
    (id) => companiesAPI.updateCompanyStatus(id, 'cancelled'),
    {
      onSuccess: () => {
        toast.success('Tenant rejected')
        queryClient.invalidateQueries('superadmin-tenants')
      },
      onError: (error) => toast.error(error?.response?.data?.detail || 'Failed to reject tenant')
    }
  )

  const registerCompany = useMutation(
    (companyData) => companiesAPI.registerCompany(companyData),
    {
      onSuccess: () => {
        toast.success('Company added. Awaiting approval.')
        setShowRegisterModal(false)
        queryClient.invalidateQueries('superadmin-tenants')
      },
      onError: (error) => toast.error(error?.response?.data?.detail || 'Failed to add company')
    }
  )

  const approveCompany = useMutation(
    ({ companyId, adminData }) => companiesAPI.approveCompany(companyId, adminData),
    {
      onSuccess: () => {
        toast.success('Company approved and admin created')
        setShowApproveModal(false)
        setSelectedCompany(null)
        queryClient.invalidateQueries('superadmin-tenants')
      },
      onError: (error) => toast.error(error?.response?.data?.detail || 'Failed to approve company')
    }
  )

  const bulkActivate = useMutation(
    (ids) => Promise.all(ids.map(id => superadminApi.activateTenant(id))),
    {
      onSuccess: () => {
        toast.success(`${selectedTenants.length} tenants activated`);
        setSelectedTenants([]);
        setShowBulkActions(false);
        queryClient.invalidateQueries('superadmin-tenants');
      },
      onError: (error) => toast.error(error?.response?.data?.detail || 'Failed to bulk activate tenants')
    }
  )

  const bulkSuspend = useMutation(
    (ids) => Promise.all(ids.map(id => superadminApi.suspendTenant(id, { reason: 'bulk_action' }))),
    {
      onSuccess: () => {
        toast.success(`${selectedTenants.length} tenants suspended`);
        setSelectedTenants([]);
        setShowBulkActions(false);
        queryClient.invalidateQueries('superadmin-tenants');
      },
      onError: (error) => toast.error(error?.response?.data?.detail || 'Failed to bulk suspend tenants')
    }
  )

  // Calculate stats
  const totalTenants = tenants.length
  const activeTenants = tenants.filter(t => t.status === 'active').length
  const pendingTenants = tenants.filter(t => t.status === 'pending').length
  const suspendedTenants = tenants.filter(t => t.status === 'suspended').length
  const riskyTenants = tenants.filter((tenant) => riskScore(tenant) > 0).length
  const totalUsers = tenants.reduce((sum, t) => sum + (t.user_count ?? t.current_users ?? 0), 0)

  const handleExport = () => {
    const headers = ['Company', 'Status', 'Plan', 'Users', 'Created', 'Risk Score']
    const rows = tenants.map(t => [
      t.name || t.company_name,
      t.status,
      t.plan || 'Free',
      t.user_count ?? t.current_users ?? 0,
      t.created_at ? timeService.formatDate(t.created_at) : 'N/A',
      riskScore(t)
    ])
    
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tenants_${timeService.toUtcDateOnlyNow()}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleSelectAll = () => {
    if (selectedTenants.length === tenants.length) {
      setSelectedTenants([])
    } else {
      setSelectedTenants(tenants.map(t => getId(t)))
    }
  }

  const handleSelectTenant = (id) => {
    setSelectedTenants(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  const handleRegisterSubmit = (event) => {
    event.preventDefault()
    const formData = new FormData(event.target)
    registerCompany.mutate({
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      website: formData.get('website'),
    })
  }

  const handleApproveClick = (company) => {
    setSelectedCompany(company)
    setShowApproveModal(true)
  }

  const handleApproveSubmit = (event) => {
    event.preventDefault()
    if (!selectedCompany) return
    const formData = new FormData(event.target)
    approveCompany.mutate({
      companyId: getId(selectedCompany),
      adminData: {
        admin_first_name: formData.get('admin_first_name'),
        admin_last_name: formData.get('admin_last_name'),
        admin_email: formData.get('admin_email'),
        admin_password: formData.get('admin_password'),
        subscription_plan: formData.get('subscription_plan') || 'free',
      }
    })
  }

  const columns = [
    { 
      key: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={selectedTenants.length === tenants.length && tenants.length > 0}
          onChange={handleSelectAll}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700"
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedTenants.includes(getId(row))}
          onChange={() => handleSelectTenant(getId(row))}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700"
        />
      )
    },
    { 
      key: 'name', 
      header: 'Company', 
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/20">
            {row.name?.charAt(0)?.toUpperCase() || row.company_name?.charAt(0)?.toUpperCase() || 'T'}
          </div>
          <Link 
            className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300" 
            to={`/super-admin/tenants/${getId(row)}`}
          >
            {row.name || row.company_name}
          </Link>
        </div>
      ) 
    },
    { 
      key: 'status', 
      header: 'Status', 
      render: (row) => <Badge label={row.status || 'pending'} colorKey={row.status} /> 
    },
    { 
      key: 'plan', 
      header: 'Plan', 
      render: (row) => (
        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
          {row.plan || row.subscription_plan || 'Free'}
        </span>
      ) 
    },
    { 
      key: 'users', 
      header: 'Users', 
      render: (row) => (
        <Link 
          className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300" 
          to={`/super-admin/tenants/${getId(row)}?tab=users`}
        >
          {row.user_count ?? row.current_users ?? 0}
        </Link>
      ) 
    },
    { 
      key: 'created', 
      header: 'Created', 
      render: (row) => row.created_at ? timeService.formatDate(row.created_at) : '-' 
    },
    { 
      key: 'risk', 
      header: 'Risk', 
      render: (row) => {
        const score = riskScore(row)
        return score > 0 ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            score >= 3 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' :
            'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
          }`}>
            <AlertTriangle className="h-3 w-3" />
            {score}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">-</span>
        )
      }
    },
    { 
      key: 'actions', 
      header: '', 
      render: (row) => {
        const status = String(row.status || '').toLowerCase()
        const pending = status === 'pending'
        const active = status === 'active'
        const suspended = status === 'suspended'
        return (
          <div className="flex flex-wrap gap-1.5">
            {pending ? (
              <>
                <Button
                  size="sm"
                  loading={approveCompany.isLoading}
                  onClick={() => handleApproveClick(row)}
                  className="gap-1"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={rejectTenant.isLoading}
                  onClick={() => rejectTenant.mutate(getId(row))}
                  className="gap-1"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </Button>
              </>
            ) : null}
            {active ? (
              <Button
                size="sm"
                variant="danger"
                onClick={() => setSuspendTarget(row)}
                className="gap-1"
              >
                <Lock className="h-3.5 w-3.5" />
                Suspend
              </Button>
            ) : null}
            {suspended ? (
              <Button 
                size="sm" 
                variant="secondary" 
                loading={activate.isLoading} 
                onClick={() => activate.mutate(getId(row))}
                className="gap-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
              >
                <Unlock className="h-3.5 w-3.5" />
                Activate
              </Button>
            ) : null}
            {!pending && !active && !suspended ? (
              <span className="text-xs text-gray-400 dark:text-gray-500">No action</span>
            ) : null}
          </div>
        )
      } 
    },
  ]

  return (
    <div className="space-y-4 p-3 md:p-4">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-indigo-600 dark:text-indigo-300">Super Admin</p>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Tenant Management</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Review, activate, and suspend tenant companies.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
              <ShieldAlert className="h-4 w-4" />
              {riskyTenants} risky
            </div>
            <Button size="sm" onClick={() => setShowRegisterModal(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Company
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard
          label="Total Tenants"
          value={totalTenants}
          icon={Building2}
          color="indigo"
          subtitle="All companies"
          trend={totalTenants > 0 ? 5 : 0}
        />
        <StatCard
          label="Active"
          value={activeTenants}
          icon={CheckCircle2}
          color="emerald"
          subtitle="Running"
          trend={activeTenants > 0 ? 3 : 0}
        />
        <StatCard
          label="Pending"
          value={pendingTenants}
          icon={Clock}
          color="amber"
          subtitle="Awaiting approval"
        />
        <StatCard
          label="Suspended"
          value={suspendedTenants}
          icon={XCircle}
          color="rose"
          subtitle="Restricted"
        />
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Users</span>
            <Users className="h-3.5 w-3.5 text-indigo-500" />
          </div>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{totalUsers}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">All tenants</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Avg Users</span>
            <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
          </div>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
            {totalTenants > 0 ? Math.round(totalUsers / totalTenants) : 0}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Per tenant</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Risk</span>
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{riskyTenants}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Need attention</p>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedTenants.length > 0 && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800/50 dark:bg-indigo-950/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              {selectedTenants.length} tenant{selectedTenants.length !== 1 ? 's' : ''} selected
            </span>
            <div className="flex flex-wrap gap-2">
              <Button 
                size="sm" 
                variant="secondary" 
                onClick={() => {
                  setShowBulkActions(true)
                  bulkActivate.mutate(selectedTenants)
                }}
                loading={bulkActivate.isLoading}
                className="gap-1.5 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
              >
                <Unlock className="h-4 w-4" />
                Activate All
              </Button>
              <Button 
                size="sm" 
                variant="danger" 
                onClick={() => {
                  setShowBulkActions(true)
                  bulkSuspend.mutate(selectedTenants)
                }}
                loading={bulkSuspend.isLoading}
                className="gap-1.5"
              >
                <Lock className="h-4 w-4" />
                Suspend All
              </Button>
              <Button 
                size="sm" 
                variant="secondary" 
                onClick={() => setSelectedTenants([])}
                className="gap-1.5"
              >
                Clear Selection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input 
              className={`${inputClassName} pl-10 bg-gray-50 dark:bg-gray-900/50`} 
              value={search} 
              onChange={(event) => setSearch(event.target.value)} 
              placeholder="Search tenants by name, plan, or status..." 
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            {['all', 'active', 'pending', 'suspended', 'inactive'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  statusFilter === status
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-indigo-700 dark:hover:text-indigo-400'
                }`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-600 dark:bg-gray-700">
            <button
              onClick={() => setViewMode('table')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                viewMode === 'table' 
                  ? 'bg-white text-indigo-700 shadow-sm dark:bg-gray-600 dark:text-white' 
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                viewMode === 'grid' 
                  ? 'bg-white text-indigo-700 shadow-sm dark:bg-gray-600 dark:text-white' 
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              Grid
            </button>
          </div>
          <QuickActions onRefresh={refetch} onExport={handleExport} />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <SkeletonTable rows={7} cols={6} />
      ) : isError ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-100 dark:bg-rose-900/30">
            <Building2 className="h-8 w-8 text-rose-600 dark:text-rose-400" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Could not load tenants</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Please refresh the page or try again later.</p>
        </div>
      ) : tenants.length ? (
        viewMode === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tenants.map((tenant) => (
              <TenantCard
                key={getId(tenant)}
                tenant={tenant}
                onSuspend={setSuspendTarget}
                onActivate={activate.mutate}
                isActivating={activate.isLoading}
                isSuspending={suspend.isLoading}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
            <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                    <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-white">Tenants</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{tenants.length} companies</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                    {activeTenants} active
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                    {pendingTenants} pending
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-400"></span>
                    {suspendedTenants} suspended
                  </span>
                </div>
              </div>
            </div>
            <Table columns={columns} data={tenants} />
          </div>
        )
      ) : (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
            <Building2 className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white">No tenants found</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Try adjusting your search or filters.</p>
        </div>
      )}

      <Modal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        title="Add company"
        description="Create a tenant record. Approval and admin setup can happen after review."
        size="lg"
      >
        <form onSubmit={handleRegisterSubmit} className="space-y-6">
          <div className="rounded-2xl border border-primary-100 bg-primary-50/70 p-4 dark:border-primary-900/50 dark:bg-primary-950/20">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white p-2 text-primary-600 shadow-sm dark:bg-[var(--color-app-surface)]">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-[var(--color-app-text)]">Company profile</p>
                <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-[var(--color-app-text-muted)]">
                  Use official business contact details so billing, approvals, and tenant ownership stay clear.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Company name" required className="sm:col-span-2">
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input type="text" name="name" required className={`${inputClassName} pl-11`} placeholder="TechCorp Inc." />
              </div>
            </FormField>
            <FormField label="Email" required>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input type="email" name="email" required className={`${inputClassName} pl-11`} placeholder="contact@techcorp.com" />
              </div>
            </FormField>
            <FormField label="Phone" required>
              <PhoneInput name="phone" required />
            </FormField>
            <FormField label="Website (optional)" helperText="Include https:// for best results." className="sm:col-span-2">
              <div className="relative">
                <Globe2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input type="url" name="website" className={`${inputClassName} pl-11`} placeholder="https://techcorp.com" />
              </div>
            </FormField>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 dark:border-[var(--color-app-border)] sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setShowRegisterModal(false)} disabled={registerCompany.isLoading}>
              Cancel
            </Button>
            <Button type="submit" loading={registerCompany.isLoading} loadingText="Registering">
              <Plus className="h-4 w-4" />
              Add Company
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showApproveModal && Boolean(selectedCompany)}
        onClose={() => {
          setShowApproveModal(false)
          setSelectedCompany(null)
        }}
        title="Approve company"
        description={selectedCompany ? `Create company admin for ${selectedCompany.name || selectedCompany.company_name}.` : ''}
        size="lg"
      >
        {selectedCompany ? (
          <form onSubmit={handleApproveSubmit} className="space-y-6">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-white p-2 text-emerald-600 shadow-sm dark:bg-[var(--color-app-surface)]">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-[var(--color-app-text)]">
                    {selectedCompany.name || selectedCompany.company_name}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-[var(--color-app-text-muted)]">
                    Approval activates tenant access and creates first company admin.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Admin first name" required>
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input type="text" name="admin_first_name" required className={`${inputClassName} pl-11`} placeholder="John" />
                </div>
              </FormField>

              <FormField label="Admin last name" required>
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input type="text" name="admin_last_name" required className={`${inputClassName} pl-11`} placeholder="Doe" />
                </div>
              </FormField>

              <FormField label="Admin email" required>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input type="email" name="admin_email" required className={`${inputClassName} pl-11`} placeholder="admin@company.com" />
                </div>
              </FormField>

              <FormField label="Admin password" required>
                <PasswordInput
                  name="admin_password"
                  required
                  minLength={8}
                  className={inputClassName}
                  placeholder="Min 8 characters"
                  toggleLabel="admin password"
                />
              </FormField>

              <FormField label="Subscription plan" className="sm:col-span-2">
                <div className="relative">
                  <CreditCard className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <select name="subscription_plan" className={`${inputClassName} pl-11`}>
                    <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="free">Free</option>
                    <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="basic">Basic</option>
                    <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="professional">Professional</option>
                    <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="enterprise">Enterprise</option>
                  </select>
                </div>
              </FormField>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 dark:border-[var(--color-app-border)] sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowApproveModal(false)
                  setSelectedCompany(null)
                }}
                disabled={approveCompany.isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" loading={approveCompany.isLoading} loadingText="Approving">
                <Check className="h-4 w-4" />
                Approve & Create Admin
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Suspend Modal */}
      <Modal
        isOpen={Boolean(suspendTarget)}
        onClose={() => setSuspendTarget(null)}
        title="Suspend Tenant"
        description={suspendTarget?.name || suspendTarget?.company_name}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSuspendTarget(null)}>Cancel</Button>
            <Button 
              variant="danger" 
              loading={suspend.isLoading} 
              onClick={() => suspend.mutate({ id: getId(suspendTarget), data: suspendForm })}
            >
              Suspend
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/20">
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              <span>This action will suspend the tenant and restrict access.</span>
            </div>
          </div>

          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Reason
            <select 
              className={`${inputClassName} mt-1 bg-gray-50 dark:bg-gray-900/50`} 
              value={suspendForm.reason} 
              onChange={(event) => setSuspendForm((form) => ({ ...form, reason: event.target.value }))}
            >
              <option value="payment_failed">Payment Failed</option>
              <option value="compliance">Compliance</option>
              <option value="manual">Manual</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Notes
            <textarea 
              className={`${inputClassName} mt-1 min-h-24 resize-y bg-gray-50 dark:bg-gray-900/50`} 
              value={suspendForm.notes} 
              onChange={(event) => setSuspendForm((form) => ({ ...form, notes: event.target.value }))} 
              placeholder="Additional details about the suspension..."
            />
          </label>

          <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input 
              type="checkbox" 
              checked={suspendForm.notify_admin} 
              onChange={(event) => setSuspendForm((form) => ({ ...form, notify_admin: event.target.checked }))} 
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700"
            />
            Notify Admin via Email
          </label>
        </div>
      </Modal>
    </div>
  )
}

function riskScore(tenant) {
  const status = String(tenant?.status || '').toLowerCase()
  if (['suspended', 'blocked'].includes(status)) return 3
  if (['pending', 'inactive', 'overdue'].includes(status)) return 2
  return 0
}
