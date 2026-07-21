import { useCallback, useEffect, useState } from 'react'
import { 
  RefreshCw, 
  LayoutDashboard,
  FileText,
  Users,
  DollarSign,
  TrendingUp,
  Filter,
  Search,
  AlertCircle,
  CheckCircle,
  Clock,
  Calendar,
  ArrowUp,
  ArrowDown,
  Banknote,
  CreditCard,
  Receipt,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  Plus,
  Edit,
  Trash2,
  Eye,
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  X,
  Save
} from 'lucide-react'
import { ledgerAPI } from '../api/ledger'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { formatCurrency } from './crm/pipeline/utils'
import { Button, Modal, Table } from '../components/ui'
import { timeService } from '@/services/timeService'

// ============================================================
// STAT CARD COMPONENT
// ============================================================
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg transition-transform group-hover:scale-110`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

// ============================================================
// SECTION HEADER COMPONENT
// ============================================================
const SectionHeader = ({ icon: Icon, title, description, action }) => (
  <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
          <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      {action}
    </div>
  </div>
)

// ============================================================
// STATUS BADGE COMPONENT
// ============================================================
const StatusBadge = ({ status }) => {
  const statusMap = {
    draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
    sent: { label: 'Sent', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    paid: { label: 'Paid', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    cancelled: { label: 'Cancelled', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  }

  const { label, color } = statusMap[status?.toLowerCase()] || statusMap.draft

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

// ============================================================
// DAYS PASSED BADGE
// ============================================================
const DaysPassedBadge = ({ days }) => {
  const getColor = () => {
    if (days < 30) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    if (days < 60) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getColor()}`}>
      {days} days
    </span>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================
const Ledger = () => {
  const [ledgerData, setLedgerData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showTDSModal, setShowTDSModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  
  const [filters, setFilters] = useState({
    invoice_id: '',
    client_name: '',
    status: '',
  })
  
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: format(timeService.now(), 'yyyy-MM-dd'),
    payment_method: 'cash',
    reference_number: '',
    notes: '',
  })
  
  const [tdsAmount, setTdsAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadLedger = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const params = {}
      if (filters.invoice_id) params.invoice_id = filters.invoice_id
      if (filters.client_name) params.client_name = filters.client_name
      if (filters.status) params.status_filter = filters.status
      
      const data = await ledgerAPI.getLedger(params)
      setLedgerData(data)
    } catch (error) {
      console.error('Error loading ledger:', error)
      const message = error.response?.status === 403
        ? 'You do not have permission to view ledger data. Please contact your administrator.'
        : error.response?.status === 401
          ? 'Please login to view ledger data'
          : 'Failed to load ledger data'
      setLoadError(message)
      setLedgerData(null)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [filters.client_name, filters.invoice_id, filters.status])

  useEffect(() => {
    loadLedger()
  }, [loadLedger])

  const handleApplyFilters = () => {
    loadLedger()
  }

  const handleRefresh = () => {
    setFilters({
      invoice_id: '',
      client_name: '',
      status: '',
    })
    loadLedger()
  }

  const handleAddPayment = async (e) => {
    e.preventDefault()
    if (!selectedInvoice || !paymentForm.amount) {
      toast.error('Please enter payment amount')
      return
    }

    try {
      setSubmitting(true)
      await ledgerAPI.addPayment(selectedInvoice.invoice_id, paymentForm)
      toast.success('Payment added successfully! 💰')
      setShowPaymentModal(false)
      setPaymentForm({
        amount: '',
        payment_date: format(timeService.now(), 'yyyy-MM-dd'),
        payment_method: 'cash',
        reference_number: '',
        notes: '',
      })
      loadLedger()
    } catch (error) {
      console.error('Error adding payment:', error)
      toast.error(error.response?.data?.detail || 'Failed to add payment')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateTDS = async (e) => {
    e.preventDefault()
    if (!selectedInvoice) return

    try {
      setSubmitting(true)
      await ledgerAPI.updateTDS(selectedInvoice.invoice_id, parseFloat(tdsAmount) || 0)
      toast.success('TDS updated successfully! 📋')
      setShowTDSModal(false)
      setTdsAmount('')
      loadLedger()
    } catch (error) {
      console.error('Error updating TDS:', error)
      toast.error(error.response?.data?.detail || 'Failed to update TDS')
    } finally {
      setSubmitting(false)
    }
  }

  const closePaymentModal = () => {
    setShowPaymentModal(false)
    setSelectedInvoice(null)
  }

  const closeTDSModal = () => {
    setShowTDSModal(false)
    setSelectedInvoice(null)
  }

  const invoiceColumns = [
    {
      key: 'invoice_id',
      header: 'Invoice ID',
      render: (invoice) => (
        <span className="font-medium text-gray-900 dark:text-white">{invoice.invoice_id}</span>
      ),
    },
    { 
      key: 'client_name', 
      header: 'Client', 
      render: (invoice) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
            <User className="h-4 w-4" />
          </div>
          <span className="text-gray-700 dark:text-gray-300">{invoice.client_name}</span>
        </div>
      )
    },
    { 
      key: 'invoice_date_formatted', 
      header: 'Invoice Date', 
      render: (invoice) => (
        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
          <Calendar className="h-3.5 w-3.5" />
          <span>{invoice.invoice_date_formatted}</span>
        </div>
      )
    },
    {
      key: 'days_passed',
      header: 'Days Passed',
      render: (invoice) => <DaysPassedBadge days={invoice.days_passed} />,
    },
    { 
      key: 'total_amount', 
      header: 'Total', 
      render: (invoice) => (
        <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(invoice.total_amount)}</span>
      )
    },
    {
      key: 'total_received',
      header: 'Received',
      render: (invoice) => (
        <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(invoice.total_received)}</span>
      ),
    },
    {
      key: 'outstanding_amount',
      header: 'Outstanding',
      render: (invoice) => (
        <span className="font-medium text-rose-600 dark:text-rose-400">{formatCurrency(invoice.outstanding_amount)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (invoice) => <StatusBadge status={invoice.status} />,
    },
    {
      key: 'tds_amount',
      header: 'TDS',
      render: (invoice) => (
        <div className="flex items-center gap-2">
          <span className="text-gray-700 dark:text-gray-300">{formatCurrency(invoice.tds_amount)}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedInvoice(invoice)
              setTdsAmount(invoice.tds_amount.toString())
              setShowTDSModal(true)
            }}
            className="rounded-lg p-1 text-gray-400 transition hover:bg-indigo-100 hover:text-indigo-600 dark:text-gray-500 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (invoice) => (
        <button
          type="button"
          onClick={() => {
            setSelectedInvoice(invoice)
            setPaymentForm({
              amount: invoice.outstanding_amount > 0 ? invoice.outstanding_amount.toString() : '',
              payment_date: format(timeService.now(), 'yyyy-MM-dd'),
              payment_method: 'cash',
              reference_number: '',
              notes: '',
            })
            setShowPaymentModal(true)
          }}
          disabled={invoice.outstanding_amount <= 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="h-3.5 w-3.5" />
          Payment
        </button>
      ),
    },
  ]

  if (loading && !ledgerData) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
          <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Ledger</h1>
                <p className="mt-1 text-indigo-100">Loading ledger data...</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading ledger data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (loadError && !ledgerData) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
          <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Ledger</h1>
                <p className="mt-1 text-indigo-100">Financial overview</p>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center dark:border-rose-900/60 dark:bg-rose-950/30">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h3 className="mt-4 text-lg font-semibold text-rose-900 dark:text-rose-100">Ledger Unavailable</h3>
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{loadError}</p>
          <button
            onClick={loadLedger}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
        {/* Decorative blur circles */}
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Ledger</h1>
                <p className="mt-1 text-indigo-100">
                  Financial overview and invoice management
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* STAT CARDS - 3 Cards with Gradients */}
      {/* ============================================================ */}
      {ledgerData?.summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard 
            label="Total Invoiced" 
            value={formatCurrency(ledgerData.summary.total_invoiced)} 
            icon={Receipt} 
            color="indigo"
            subtitle="All invoices"
          />
          <StatCard 
            label="Total Received" 
            value={formatCurrency(ledgerData.summary.total_received)} 
            icon={CheckCircle} 
            color="emerald"
            subtitle="Payments collected"
          />
          <StatCard 
            label="Total Outstanding" 
            value={formatCurrency(ledgerData.summary.total_outstanding)} 
            icon={AlertCircle} 
            color="rose"
            subtitle="Pending payments"
          />
        </div>
      )}

      {/* ============================================================ */}
      {/* FILTERS SECTION */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Filter}
          title="Filters & Search"
          description="Filter invoices by ID, client, or status"
          action={
            <button
              onClick={() => {
                setFilters({ invoice_id: '', client_name: '', status: '' })
                loadLedger()
              }}
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          }
        />
        <div className="p-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Invoice ID</label>
              <input
                type="text"
                value={filters.invoice_id}
                onChange={(e) => setFilters(prev => ({ ...prev, invoice_id: e.target.value }))}
                placeholder="Search by ID"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Client Name</label>
              <input
                type="text"
                value={filters.client_name}
                onChange={(e) => setFilters(prev => ({ ...prev, client_name: e.target.value }))}
                placeholder="Search by client"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleApplyFilters}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700"
              >
                <Search className="h-4 w-4" />
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* INVOICES TABLE */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={FileText}
          title="Invoices"
          description={`${ledgerData?.invoices?.length || 0} invoice${ledgerData?.invoices?.length !== 1 ? 's' : ''} found`}
        />
        <div className="p-4">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Loading invoices...</p>
              </div>
            </div>
          ) : (
            <Table columns={invoiceColumns} data={ledgerData?.invoices || []} emptyMessage="No invoices found" />
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* ADD PAYMENT MODAL - Glassmorphism */}
      {/* ============================================================ */}
      <Modal isOpen={showPaymentModal && Boolean(selectedInvoice)} onClose={closePaymentModal} title="Add Payment">
        {selectedInvoice && (
          <form onSubmit={handleAddPayment} className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Invoice</span>
                <span className="font-semibold text-gray-900 dark:text-white">{selectedInvoice.invoice_id}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Outstanding</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400">
                  {formatCurrency(selectedInvoice.outstanding_amount)}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Amount <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="Enter payment amount"
                required
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Payment Date</label>
                <input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Payment Method</label>
                <select
                  value={paymentForm.payment_method}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_method: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Reference Number</label>
              <input
                type="text"
                value={paymentForm.reference_number}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, reference_number: e.target.value }))}
                placeholder="Optional reference"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
              <textarea
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                placeholder="Optional notes"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={closePaymentModal}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add Payment
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ============================================================ */}
      {/* EDIT TDS MODAL - Glassmorphism */}
      {/* ============================================================ */}
      <Modal isOpen={showTDSModal && Boolean(selectedInvoice)} onClose={closeTDSModal} title="Edit TDS">
        {selectedInvoice && (
          <form onSubmit={handleUpdateTDS} className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Invoice</span>
                <span className="font-semibold text-gray-900 dark:text-white">{selectedInvoice.invoice_id}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                TDS Amount <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={tdsAmount}
                onChange={(e) => setTdsAmount(e.target.value)}
                placeholder="Enter TDS amount"
                required
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={closeTDSModal}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Update TDS
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

export default Ledger