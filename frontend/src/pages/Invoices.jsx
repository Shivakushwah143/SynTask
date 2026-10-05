import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  CreditCard, 
  Download, 
  FileText, 
  Plus, 
  Trash2, 
  X, 
  Search, 
  Eye, 
  Send, 
  Mail,
  LayoutDashboard,
  Users,
  DollarSign,
  TrendingUp,
  Filter,
  AlertCircle,
  CheckCircle,
  Clock,
  Calendar,
  ArrowUp,
  ArrowDown,
  Banknote,
  Receipt,
  Building2,
  User,
  Phone,
  MapPin,
  Edit,
  Printer,
  ChevronDown,
  ChevronRight,
  Save,
  RefreshCw,
  Copy,
  Check,
  Star,
  Zap,
  Award,
  Target,
  Activity,
  BarChart3,
  PieChart,
  HelpCircle,
  Settings,
  Globe
} from 'lucide-react'
import { invoicesAPI } from '../api/invoices'
import { clientsAPI } from '../api/clients'
import { downloadBlob, getDownloadFilename, safeDownloadFilename, decodeBlobErrorMessage } from '../utils/download'
import { useConfirmation } from '../hooks/useConfirmation'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isLeadRole } from '../utils/roles'
import { EmailComposer } from '../components/EmailComposer'
import { CreatableSelectField } from '../components/ui'
import { QuickCreateClientModal } from '../components/relatedRecords/QuickCreateModals'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
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
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r ${colors[color]} text-white shadow-sm`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <span className="truncate text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</span>
          <p className="mt-0.5 truncate text-lg font-bold leading-tight text-gray-900 dark:text-white">{value}</p>
          {subtitle && <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// SECTION HEADER COMPONENT
// ============================================================
const SectionHeader = ({ icon: Icon, title, description, action }) => (
  <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-3 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/30">
          <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
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
// INVOICE TYPE BADGE
// ============================================================
const InvoiceTypeBadge = ({ type }) => {
  if (type === 'tax') {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
        Tax Invoice
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
      Proforma
    </span>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================
const Invoices = () => {
  const { user } = useAuthStore()
  const { confirm, showUndoNotification } = useConfirmation()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [clients, setClients] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [showQuickClientModal, setShowQuickClientModal] = useState(false)
  
  const [formData, setFormData] = useState({
    invoice_type: 'proforma',
    include_tax: false,
    client_id: '',
    invoice_date: timeService.toZonedDateOnly(timeService.now()),
    due_date: '',
    tax_rate: 18,
    notes: '',
    terms_and_conditions: '',
    items: [
      { description: '', quantity: 1, unit_price: 0, tax_rate: 18 }
    ],
  })
  
  const [clientDetails, setClientDetails] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [downloadingPdfId, setDownloadingPdfId] = useState(null)
  const downloadingPdfRef = useRef(false)

  const isCompanyAdmin = hasCompanyAdminAccess(user?.role)
  const isLead = isLeadRole(user?.role)

  // Calculate stats
  const stats = {
    total: invoices.length,
    totalAmount: invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0),
    paid: invoices.filter(inv => inv.status === 'paid').length,
    paidAmount: invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + (inv.total_amount || 0), 0),
    outstanding: invoices.filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled').length,
    outstandingAmount: invoices.filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled').reduce((sum, inv) => sum + (inv.total_amount || 0), 0),
  }

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const params = {}
      if (invoiceTypeFilter) params.invoice_type = invoiceTypeFilter
      if (statusFilter) params.status = statusFilter
      const data = await invoicesAPI.listInvoices(0, 100, params.invoice_type || '', params.status || '', '')
      setInvoices(data.invoices || [])
    } catch (error) {
      console.error('Error loading invoices:', error)
      const message = error.response?.status === 403
        ? 'You do not have permission to view invoices. Please contact your administrator.'
        : error.response?.status === 401
          ? 'Please login to view invoices'
          : 'Failed to load invoices'
      setLoadError(message)
      toast.error(message)
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [invoiceTypeFilter, statusFilter])

  const loadClients = useCallback(async () => {
    try {
      const data = await clientsAPI.listClients({})
      setClients(data.clients || [])
    } catch (error) {
      console.error('Error loading clients:', error)
      setClients([])
    }
  }, [])

  useEffect(() => {
    loadInvoices()
    loadClients()
  }, [loadInvoices, loadClients])

  const handleClientSelect = async (clientId) => {
    if (!clientId) {
      setClientDetails(null)
      return
    }

    try {
      const client = await clientsAPI.getClient(clientId)
      setClientDetails(client)
      setFormData(prev => ({ ...prev, client_id: clientId }))
    } catch (error) {
      console.error('Error loading client details:', error)
      toast.error('Failed to load client details')
    }
  }

  const handleAddItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, unit_price: 0, tax_rate: prev.tax_rate || 18 }]
    }))
  }

  const handleRemoveItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }))
  }

  const handleItemChange = (index, field, value) => {
    setFormData(prev => {
      const newItems = [...prev.items]
      newItems[index] = { ...newItems[index], [field]: value }
      
      if (field === 'quantity' || field === 'unit_price') {
        const quantity = parseFloat(newItems[index].quantity) || 0
        const unitPrice = parseFloat(newItems[index].unit_price) || 0
        newItems[index].amount = quantity * unitPrice
      }
      
      return { ...prev, items: newItems }
    })
  }

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity) || 0
      const unitPrice = parseFloat(item.unit_price) || 0
      return sum + (quantity * unitPrice)
    }, 0)

    let taxAmount = 0
    if (formData.include_tax) {
      if (formData.invoice_type === 'tax') {
        taxAmount = subtotal * ((formData.tax_rate || 0) / 100)
      } else {
        taxAmount = formData.items.reduce((sum, item) => {
          const quantity = parseFloat(item.quantity) || 0
          const unitPrice = parseFloat(item.unit_price) || 0
          const itemTotal = quantity * unitPrice
          const itemTaxRate = parseFloat(item.tax_rate) || 0
          return sum + (itemTotal * (itemTaxRate / 100))
        }, 0)
      }
    }

    return { subtotal, taxAmount, total: subtotal + taxAmount }
  }
  const totals = calculateTotals()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.client_id) {
      toast.error('Please select a client')
      return
    }

    if (formData.items.length === 0 || formData.items.some(item => !item.description || !item.unit_price)) {
      toast.error('Please add at least one valid invoice item')
      return
    }

    try {
      setSubmitting(true)
      const invoiceData = {
        invoice_type: formData.invoice_type,
        include_tax: formData.include_tax,
        client_id: formData.client_id,
        invoice_date: formData.invoice_date ? timeService.toUtcISOString(formData.invoice_date) : null,
        due_date: formData.due_date ? timeService.toUtcISOString(formData.due_date) : null,
        items: formData.items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unit_price: parseFloat(item.unit_price) || 0,
          amount: (parseFloat(item.quantity) || 1) * (parseFloat(item.unit_price) || 0),
          tax_rate: formData.include_tax ? (parseFloat(item.tax_rate) || 0) : null,
          tax_amount: formData.include_tax && item.tax_rate ? 
            ((parseFloat(item.quantity) || 1) * (parseFloat(item.unit_price) || 0) * (parseFloat(item.tax_rate) || 0) / 100) : null
        })),
        notes: formData.notes,
        terms_and_conditions: formData.terms_and_conditions,
        tax_rate: formData.include_tax && formData.invoice_type === 'tax' ? parseFloat(formData.tax_rate) : null,
      }

      await invoicesAPI.createInvoice(invoiceData)
      toast.success('Invoice created successfully! 📄')
      setShowCreateModal(false)
      resetForm()
      await loadInvoices()
    } catch (error) {
      console.error('Error creating invoice:', error)
      toast.error(error.response?.data?.detail || 'Failed to create invoice')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      invoice_type: 'proforma',
      include_tax: false,
      client_id: '',
      invoice_date: timeService.toZonedDateOnly(timeService.now()),
      due_date: '',
      tax_rate: 18,
      notes: '',
      terms_and_conditions: '',
      items: [{ description: '', quantity: 1, unit_price: 0, tax_rate: 18 }],
    })
    setClientDetails(null)
  }

  const handleViewInvoice = async (invoice) => {
    try {
      const details = await invoicesAPI.getInvoice(invoice.id)
      setSelectedInvoice(details)
      setShowDetailModal(true)
    } catch (error) {
      console.error('Error loading invoice details:', error)
      toast.error('Failed to load invoice details')
    }
  }

  const handleDownloadInvoice = async (invoice) => {
    if (downloadingPdfRef.current) return
    downloadingPdfRef.current = true
    setDownloadingPdfId(invoice.id)
    try {
      const response = await invoicesAPI.downloadInvoicePdf(invoice.id)
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const filename = getDownloadFilename(
        response.headers?.['content-disposition'],
        safeDownloadFilename(`${invoice.invoice_number || 'invoice'}.pdf`)
      )
      downloadBlob(blob, filename)
      toast.success('Invoice PDF downloaded! 📥')
    } catch (error) {
      console.error('Error downloading invoice PDF:', error)
      // Backend errors arrive as JSON inside a Blob; surface the real message.
      const message = await decodeBlobErrorMessage(error, 'Failed to download invoice PDF')
      toast.error(message)
    } finally {
      downloadingPdfRef.current = false
      setDownloadingPdfId(null)
    }
  }

  const handleRecordFullPayment = async (invoice) => {
    const outstandingAmount = Number(invoice.outstanding_amount ?? invoice.total_amount ?? 0)
    if (outstandingAmount <= 0) {
      toast.success('Invoice is already fully paid')
      return
    }

    try {
      setRecordingPayment(true)
      const result = await invoicesAPI.recordPayment(invoice.id, {
        amount: outstandingAmount,
        payment_date: timeService.toZonedDateOnly(timeService.now()),
        payment_method: 'local_test_payment',
        reference_number: `LOCAL-${timeService.now().getTime()}`,
        notes: 'Local test payment recorded before Razorpay go-live',
      })
      setSelectedInvoice(result.invoice)
      toast.success('Payment recorded successfully! 💰')
      await loadInvoices()
    } catch (error) {
      console.error('Error recording payment:', error)
      toast.error(error.response?.data?.detail || 'Failed to record payment')
    } finally {
      setRecordingPayment(false)
    }
  }

  const handleCreateRazorpayOrder = async (invoice) => {
    try {
      const result = await invoicesAPI.createRazorpayOrder(invoice.id)
      toast.success(`Razorpay order ready: ${result.order_id}`)
    } catch (error) {
      console.error('Error creating Razorpay invoice order:', error)
      toast.error(error.response?.data?.detail || 'Razorpay invoice payments are disabled or not configured')
    }
  }

  const handleSendEmail = async (invoiceId) => {
    try {
      await invoicesAPI.sendInvoiceEmail(invoiceId)
      toast.success('Invoice email sent successfully! ✉️')
      await loadInvoices()
    } catch (error) {
      console.error('Error sending invoice email:', error)
      toast.error(error.response?.data?.detail || 'Failed to send invoice email')
    }
  }

  const handleDelete = async (invoiceId) => {
    const confirmed = await confirm({
      title: 'Delete Invoice',
      message: 'Are you sure you want to delete this invoice?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDangerous: true,
    })
    if (!confirmed) return

    try {
      await invoicesAPI.deleteInvoice(invoiceId)
      toast.success('Invoice deleted successfully')
      showUndoNotification({
        message: 'Invoice deleted',
        onUndo: async () => {
          await loadInvoices()
        },
        duration: 3000,
      })
      await loadInvoices()
    } catch (error) {
      console.error('Error deleting invoice:', error)
      toast.error('Failed to delete invoice')
    }
  }

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = !searchQuery || 
      invoice.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.client_name?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = !invoiceTypeFilter || invoice.invoice_type === invoiceTypeFilter
    const matchesStatus = !statusFilter || invoice.status === statusFilter
    return matchesSearch && matchesType && matchesStatus
  })

  if (loading && !invoices.length) {
    return (
      <div className="space-y-4 p-4 md:p-5">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 px-4 py-3 text-white shadow-sm">
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/15 p-2 backdrop-blur-sm">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold md:text-xl">Invoices</h1>
                <p className="mt-0.5 truncate text-xs text-cyan-100">Loading invoices...</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"></div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-2.5 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                  <div className="h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                  <div className="h-2 w-14 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"></div>
              <div className="space-y-1">
                <div className="h-3 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                <div className="h-2 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
              </div>
            </div>
          </div>
          <div className="grid gap-3 p-3 md:grid-cols-4">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="space-y-1">
                <div className="h-3 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
                <div className="h-9 w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"></div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"></div>
              <div className="h-3 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700"></div>
            </div>
          </div>
          <div className="space-y-3 p-4">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="h-11 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-5">
      {/* ============================================================ */}
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-3 text-white shadow-sm">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg border border-white/15 bg-white/15 p-2 backdrop-blur-md">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-white md:text-xl">Invoices & Financials</h1>
              <p className="mt-0.5 truncate text-xs text-indigo-100">Generate tax invoices, proforma estimates & track client billing status</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(isCompanyAdmin || isLead) && (
              <>
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-3 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/20"
                >
                  <Mail className="h-4 w-4" />
                  <span>Send Email</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetForm()
                    setShowCreateModal(true)
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/20 bg-white/20 px-3 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Invoice</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* STAT CARDS - 4 Cards with Gradients */}
      {/* ============================================================ */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Total Invoices" 
          value={stats.total} 
          icon={FileText} 
          color="indigo"
          subtitle={`₹${stats.totalAmount.toLocaleString()} total`}
        />
        <StatCard 
          label="Paid" 
          value={stats.paid} 
          icon={CheckCircle} 
          color="emerald"
          subtitle={`₹${stats.paidAmount.toLocaleString()} collected`}
        />
        <StatCard 
          label="Outstanding" 
          value={stats.outstanding} 
          icon={AlertCircle} 
          color="amber"
          subtitle={`₹${stats.outstandingAmount.toLocaleString()} pending`}
        />
        <StatCard 
          label="Avg. Invoice Value" 
          value={stats.total > 0 ? `₹${(stats.totalAmount / stats.total).toLocaleString()}` : '₹0'} 
          icon={TrendingUp} 
          color="blue"
          subtitle="Average per invoice"
        />
      </div>

      {/* ============================================================ */}
      {/* FILTERS SECTION */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Filter}
          title="Filters & Search"
          description="Search by invoice number or client, filter by type or status"
          action={
            <button
              onClick={() => {
                setSearchQuery('')
                setInvoiceTypeFilter('')
                setStatusFilter('')
              }}
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 transition hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          }
        />
        <div className="p-3">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search invoices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Invoice Type</label>
              <select
                value={invoiceTypeFilter}
                onChange={(e) => {
                  setInvoiceTypeFilter(e.target.value)
                  loadInvoices()
                }}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                <option value="">All Types</option>
                <option value="proforma">Proforma Invoice</option>
                <option value="tax">Tax Invoice</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  loadInvoices()
                }}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              >
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => loadInvoices()}
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
          title="All Invoices"
          description={`${filteredInvoices.length} invoice${filteredInvoices.length !== 1 ? 's' : ''} found`}
        />
        <div className="p-4">
          {loadError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Invoices Unavailable</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{loadError}</p>
              <button onClick={loadInvoices} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700">
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No Invoices Found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create your first invoice to get started.</p>
              {(isCompanyAdmin || isLead) && (
                <button
                  onClick={() => {
                    resetForm()
                    setShowCreateModal(true)
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700"
                >
                  <Plus className="h-4 w-4" />
                  Create First Invoice
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                    <th className="py-3 pr-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Invoice #</th>
                    <th className="py-3 pr-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Client</th>
                    <th className="py-3 pr-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Type</th>
                    <th className="py-3 pr-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Date</th>
                    <th className="py-3 pr-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Amount</th>
                    <th className="py-3 pr-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                    <th className="py-3 pr-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{invoice.invoice_number}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                            <User className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{invoice.client_name}</div>
                            {invoice.client_company_name && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">{invoice.client_company_name}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <InvoiceTypeBadge type={invoice.invoice_type} />
                      </td>
                      <td className="py-3 pr-4 text-sm text-gray-600 dark:text-gray-400">
                        {invoice.invoice_date ? timeService.formatDateOnly(invoice.invoice_date) : '-'}
                      </td>
                      <td className="py-3 pr-4 text-sm font-semibold text-gray-900 dark:text-white">
                        ₹{invoice.total_amount?.toLocaleString() || '0'}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleViewInvoice(invoice)}
                            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-indigo-100 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDownloadInvoice(invoice)}
                            disabled={downloadingPdfId === invoice.id}
                            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-blue-100 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                            title={downloadingPdfId === invoice.id ? 'Downloading...' : 'Download PDF'}
                            data-testid={`download-pdf-${invoice.id}`}
                          >
                            {downloadingPdfId === invoice.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </button>
                          {!invoice.email_sent && invoice.status === 'draft' && (
                            <button
                              onClick={() => handleSendEmail(invoice.id)}
                              className="rounded-lg p-1.5 text-gray-500 transition hover:bg-emerald-100 hover:text-emerald-600 dark:text-gray-400 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400"
                              title="Send Email"
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          )}
                          {(isCompanyAdmin || isLead) && (
                            <button
                              onClick={() => handleDelete(invoice.id)}
                              className="rounded-lg p-1.5 text-gray-500 transition hover:bg-rose-100 hover:text-rose-600 dark:text-gray-400 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* CREATE INVOICE MODAL - Glassmorphism */}
      {/* ============================================================ */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false)
          }}
        >
          <div className="relative w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="mb-6 flex items-start justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create New Invoice</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Generate an invoice for your client</p>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  resetForm()
                }}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Invoice Type and Tax Options */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Invoice Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.invoice_type}
                    onChange={(e) => setFormData({ ...formData, invoice_type: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    required
                  >
                    <option value="proforma">Proforma Invoice</option>
                    <option value="tax">Tax Invoice</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <input
                    type="checkbox"
                    id="include_tax"
                    checked={formData.include_tax}
                    onChange={(e) => setFormData({ ...formData, include_tax: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
                  />
                  <label htmlFor="include_tax" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Include Tax Calculation
                  </label>
                </div>
              </div>

              {/* Client Selection */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select Client <span className="text-rose-500">*</span>
                </label>
                <CreatableSelectField
                  value={formData.client_id}
                  onChange={handleClientSelect}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  required
                  createLabel="Create client"
                  onCreate={() => setShowQuickClientModal(true)}
                  canCreate={isCompanyAdmin || isLead}
                >
                  <option value="">Select a client...</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name} {client.company_name ? `(${client.company_name})` : ''}
                    </option>
                  ))}
                </CreatableSelectField>
              </div>

              {/* Auto-filled Client Details */}
              {clientDetails && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Client Details</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                    {clientDetails.name && <div><strong>Name:</strong> {clientDetails.name}</div>}
                    {clientDetails.email && <div><strong>Email:</strong> {clientDetails.email}</div>}
                    {clientDetails.contact && <div><strong>Contact:</strong> {clientDetails.contact}</div>}
                    {clientDetails.company_name && <div><strong>Company:</strong> {clientDetails.company_name}</div>}
                    {clientDetails.address && (
                      <div className="col-span-2"><strong>Address:</strong> {clientDetails.address}</div>
                    )}
                    {(clientDetails.city || clientDetails.state) && (
                      <div className="col-span-2">
                        {clientDetails.city} {clientDetails.state} {clientDetails.zip_code}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Invoice Dates */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Invoice Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.invoice_date}
                    onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Tax Rate */}
              {formData.include_tax && formData.invoice_type === 'tax' && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    placeholder="e.g., 18"
                  />
                </div>
              )}

              {/* Invoice Items */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Invoice Items <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Item
                  </button>
                </div>
                
                <div className="space-y-3">
                  {formData.items.map((item, index) => (
                    // Phones stack each line-item field full width; tablet/desktop
                    // keep the original 12-column layout (col-spans clamp to 1 here).
                    <div key={index} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-12">
                      <div className="col-span-5 space-y-1">
                        <label className="text-xs text-gray-500 dark:text-gray-400">Description</label>
                        <input
                          type="text"
                          placeholder="Description"
                          value={item.description}
                          onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          required
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs text-gray-500 dark:text-gray-400">Qty</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          required
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-xs text-gray-500 dark:text-gray-400">Unit Price</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Price"
                          value={item.unit_price}
                          onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          required
                        />
                      </div>
                      {formData.include_tax && formData.invoice_type === 'proforma' && (
                        <div className="col-span-2 space-y-1">
                          <label className="text-xs text-gray-500 dark:text-gray-400">Tax %</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Tax %"
                            value={item.tax_rate}
                            onChange={(e) => handleItemChange(index, 'tax_rate', e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                      )}
                      <div className="col-span-1">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="mt-4 w-full rounded-lg bg-rose-100 px-2 py-2 text-rose-600 transition hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50"
                          disabled={formData.items.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                      <span className="font-semibold text-gray-900 dark:text-white">₹{totals.subtotal.toLocaleString()}</span>
                    </div>
                    {formData.include_tax && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Tax:</span>
                        <span className="font-semibold text-gray-900 dark:text-white">₹{totals.taxAmount.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-300 pt-2 text-base font-bold dark:border-gray-600">
                      <span className="text-gray-900 dark:text-white">Total:</span>
                      <span className="text-gray-900 dark:text-white">₹{totals.total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes and Terms */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white min-h-24"
                    rows="3"
                    placeholder="Additional notes..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Terms & Conditions</label>
                  <textarea
                    value={formData.terms_and_conditions}
                    onChange={(e) => setFormData({ ...formData, terms_and_conditions: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white min-h-24"
                    rows="3"
                    placeholder="Terms and conditions..."
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    resetForm()
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Create Invoice
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* QUICK CREATE CLIENT MODAL */}
      {/* ============================================================ */}
      <QuickCreateClientModal
        isOpen={showQuickClientModal}
        onClose={() => setShowQuickClientModal(false)}
        existing={clients}
        onCreated={async (created) => {
          await loadClients()
          await handleClientSelect(created.id)
        }}
      />

      {/* ============================================================ */}
      {/* INVOICE DETAIL MODAL */}
      {/* ============================================================ */}
      {showDetailModal && selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDetailModal(false)
          }}
        >
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="mb-6 flex items-start justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Invoice Details</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedInvoice.invoice_number}</p>
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false)
                  setSelectedInvoice(null)
                }}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Header Info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Invoice Number</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedInvoice.invoice_number}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Type</p>
                  <InvoiceTypeBadge type={selectedInvoice.invoice_type} />
                </div>
              </div>

              {/* Client Info */}
              <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Bill To</h3>
                <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <p className="font-semibold text-gray-900 dark:text-white">{selectedInvoice.client_name}</p>
                  {selectedInvoice.client_company_name && <p>{selectedInvoice.client_company_name}</p>}
                  {selectedInvoice.client_address && <p>{selectedInvoice.client_address}</p>}
                  {(selectedInvoice.client_city || selectedInvoice.client_state) && (
                    <p>{selectedInvoice.client_city}, {selectedInvoice.client_state} {selectedInvoice.client_zip_code}</p>
                  )}
                  {selectedInvoice.client_email && <p>{selectedInvoice.client_email}</p>}
                  {selectedInvoice.client_contact && <p>{selectedInvoice.client_contact}</p>}
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Description</th>
                      <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Qty</th>
                      <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Price</th>
                      {selectedInvoice.include_tax && <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Tax</th>}
                      <th className="py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {selectedInvoice.items?.map((item, index) => (
                      <tr key={index}>
                        <td className="py-2 text-gray-700 dark:text-gray-300">{item.description}</td>
                        <td className="py-2 text-right text-gray-700 dark:text-gray-300">{item.quantity}</td>
                        <td className="py-2 text-right text-gray-700 dark:text-gray-300">₹{item.unit_price?.toLocaleString()}</td>
                        {selectedInvoice.include_tax && (
                          <td className="py-2 text-right text-gray-700 dark:text-gray-300">
                            {item.tax_rate ? `${item.tax_rate}%` : '-'}
                          </td>
                        )}
                        <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">₹{item.amount?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">₹{selectedInvoice.subtotal?.toLocaleString()}</span>
                  </div>
                  {selectedInvoice.include_tax && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Tax:</span>
                      <span className="font-semibold text-gray-900 dark:text-white">₹{selectedInvoice.tax_amount?.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-gray-300 pt-2 text-base font-bold dark:border-gray-600">
                    <span className="text-gray-900 dark:text-white">Total:</span>
                    <span className="text-gray-900 dark:text-white">₹{selectedInvoice.total_amount?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Received:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">₹{selectedInvoice.total_received?.toLocaleString() || "0"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Outstanding:</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">₹{selectedInvoice.outstanding_amount?.toLocaleString() || "0"}</span>
                  </div>
                </div>
              </div>

              {/* Payments */}
              {selectedInvoice.payments?.length > 0 && (
                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Payments</h3>
                  <div className="space-y-2">
                    {selectedInvoice.payments.map((payment, index) => (
                      <div key={index} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/50">
                        <span className="text-gray-700 dark:text-gray-300">
                          {payment.payment_method || 'Payment'} 
                          {payment.reference_number && ` - ${payment.reference_number}`}
                        </span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">₹{Number(payment.amount || 0).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  onClick={() => handleDownloadInvoice(selectedInvoice)}
                  disabled={downloadingPdfId === selectedInvoice.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="download-pdf-detail"
                >
                  {downloadingPdfId === selectedInvoice.id ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent"></div>
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download PDF
                    </>
                  )}
                </button>
                {(isCompanyAdmin || isLead) && Number(selectedInvoice.outstanding_amount ?? selectedInvoice.total_amount ?? 0) > 0 && (
                  <button
                    onClick={() => handleRecordFullPayment(selectedInvoice)}
                    disabled={recordingPayment}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    <CreditCard className="h-4 w-4" />
                    {recordingPayment ? 'Recording...' : 'Record Full Payment'}
                  </button>
                )}
                {(isCompanyAdmin || isLead) && Number(selectedInvoice.outstanding_amount ?? selectedInvoice.total_amount ?? 0) > 0 && (
                  <button
                    onClick={() => handleCreateRazorpayOrder(selectedInvoice)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <CreditCard className="h-4 w-4" />
                    Razorpay Order
                  </button>
                )}
                {!selectedInvoice.email_sent && selectedInvoice.status === 'draft' && (
                  <button
                    onClick={() => {
                      handleSendEmail(selectedInvoice.id)
                      setShowDetailModal(false)
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700"
                  >
                    <Send className="h-4 w-4" />
                    Send Email
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EMAIL COMPOSER */}
      {/* ============================================================ */}
      <EmailComposer
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        initialData={{
          to: selectedInvoice?.client_email ? [{ email: selectedInvoice.client_email, name: selectedInvoice.client_name || '' }] : [],
          subject: selectedInvoice ? `Invoice ${selectedInvoice.invoice_number}` : 'Invoice follow-up',
          html: '<p>Hello,</p><p></p>',
          text: 'Hello,',
          related_entity_type: 'invoice',
          related_entity_id: selectedInvoice?.id || '',
          related_module: 'billing',
        }}
      />
    </div>
  )
}

export default Invoices
