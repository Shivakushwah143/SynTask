import { useState, useEffect, useCallback } from 'react'
import { CreditCard, Download, FileText, Plus, Trash2, X, Search, Eye, Send, Mail } from 'lucide-react'
import { invoicesAPI } from '../api/invoices'
import { clientsAPI } from '../api/clients'
import { useConfirmation } from '../hooks/useConfirmation'
import { useAuthStore } from '../store/authStore'
import { hasCompanyAdminAccess, isLeadRole } from '../utils/roles'
import { EmailComposer } from '../components/EmailComposer'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

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
  
  const [formData, setFormData] = useState({
    invoice_type: 'proforma',
    include_tax: false,
    client_id: '',
    invoice_date: format(new Date(), 'yyyy-MM-dd'),
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

  const isCompanyAdmin = hasCompanyAdminAccess(user?.role)
  const isLead = isLeadRole(user?.role)

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
      if (error.response?.status === 403) {
        setLoadError('You do not have permission to load clients for invoices. Please contact your administrator.')
      }
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
      
      // Calculate amount for this item
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
        // Calculate tax from individual items
        taxAmount = formData.items.reduce((sum, item) => {
          const quantity = parseFloat(item.quantity) || 0
          const unitPrice = parseFloat(item.unit_price) || 0
          const itemTotal = quantity * unitPrice
          const itemTaxRate = parseFloat(item.tax_rate) || 0
          return sum + (itemTotal * (itemTaxRate / 100))
        }, 0)
      }
    }

    return {
      subtotal,
      taxAmount,
      total: subtotal + taxAmount
    }
  }

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
        invoice_date: formData.invoice_date ? new Date(formData.invoice_date).toISOString() : null,
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
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
      toast.success('Invoice created successfully')
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
      invoice_date: format(new Date(), 'yyyy-MM-dd'),
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
    try {
      const response = await invoicesAPI.downloadInvoicePdf(invoice.id)
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${invoice.invoice_number || 'invoice'}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      toast.success('Invoice PDF downloaded')
    } catch (error) {
      console.error('Error downloading invoice PDF:', error)
      toast.error(error.response?.data?.detail || 'Failed to download invoice PDF')
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
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: 'local_test_payment',
        reference_number: `LOCAL-${Date.now()}`,
        notes: 'Local test payment recorded before Razorpay go-live',
      })
      setSelectedInvoice(result.invoice)
      toast.success('Payment recorded and invoice updated')
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
      toast.success('Invoice email sent successfully')
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

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading invoices...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600 text-xs mt-0.5">Generate and manage invoices for your clients</p>
        </div>
        {(isCompanyAdmin || isLead) && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setComposerOpen(true)}
              className="btn btn-primary flex items-center space-x-2"
            >
              <Mail className="h-4 w-4" />
              <span>Send Email</span>
            </button>
            <button
              onClick={() => {
                resetForm()
                setShowCreateModal(true)
              }}
              className="btn btn-primary flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Create Invoice</span>
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select
          value={invoiceTypeFilter}
          onChange={(e) => {
            setInvoiceTypeFilter(e.target.value)
            loadInvoices()
          }}
          className="input"
        >
          <option value="">All Types</option>
          <option value="proforma">Proforma Invoice</option>
          <option value="tax">Tax Invoice</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            loadInvoices()
          }}
          className="input"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Invoices Table */}
      {loadError ? (
        <div className="card text-center py-12">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-900 font-semibold">Invoices unavailable</p>
          <p className="mt-1 text-sm text-gray-600">{loadError}</p>
          <button onClick={loadInvoices} className="btn btn-primary mt-4">
            Retry
          </button>
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No invoices found</p>
          {(isCompanyAdmin || isLead) && (
            <button
              onClick={() => {
                resetForm()
                setShowCreateModal(true)
              }}
              className="btn btn-primary mt-4"
            >
              Create Your First Invoice
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-3 pr-4 font-medium">Invoice #</th>
                <th className="py-3 pr-4 font-medium">Client</th>
                <th className="py-3 pr-4 font-medium">Type</th>
                <th className="py-3 pr-4 font-medium">Date</th>
                <th className="py-3 pr-4 font-medium">Amount</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="py-3 pr-4">
                    <div className="text-sm font-semibold text-gray-900">{invoice.invoice_number}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="text-sm text-gray-900">{invoice.client_name}</div>
                    {invoice.client_company_name && (
                      <div className="text-xs text-gray-500">{invoice.client_company_name}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      invoice.invoice_type === 'tax' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {invoice.invoice_type === 'tax' ? 'Tax Invoice' : 'Proforma Invoice'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-gray-700">
                    {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'MMM d, yyyy') : '-'}
                  </td>
                  <td className="py-3 pr-4 text-sm font-semibold text-gray-900">
                    ₹{invoice.total_amount?.toLocaleString() || '0'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      invoice.status === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : invoice.status === 'sent'
                        ? 'bg-blue-100 text-blue-700'
                        : invoice.status === 'cancelled'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleViewInvoice(invoice)}
                        className="p-1 text-gray-600 hover:text-primary-600"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadInvoice(invoice)}
                        className="p-1 text-gray-600 hover:text-primary-600"
                        title="Download PDF"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {!invoice.email_sent && invoice.status === 'draft' && (
                        <button
                          onClick={() => handleSendEmail(invoice.id)}
                          className="p-1 text-gray-600 hover:text-green-600"
                          title="Send Email"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      {(isCompanyAdmin || isLead) && (
                        <button
                          onClick={() => handleDelete(invoice.id)}
                          className="p-1 text-red-600 hover:text-red-700"
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

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-4xl w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">Create New Invoice</h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    resetForm()
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Invoice Type and Tax Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Type *</label>
                    <select
                      value={formData.invoice_type}
                      onChange={(e) => setFormData({ ...formData, invoice_type: e.target.value })}
                      className="input"
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
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <label htmlFor="include_tax" className="text-xs font-medium text-gray-700">
                      Include Tax Calculation
                    </label>
                  </div>
                </div>

                {/* Client Selection */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Select Client *</label>
                  <select
                    value={formData.client_id}
                    onChange={(e) => handleClientSelect(e.target.value)}
                    className="input"
                    required
                  >
                    <option value="">Select a client...</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>
                        {client.name} {client.company_name ? `(${client.company_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Auto-filled Client Details */}
                {clientDetails && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="text-xs font-semibold text-gray-700 mb-2">Client Details</h3>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Invoice Date *</label>
                    <input
                      type="date"
                      value={formData.invoice_date}
                      onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                {/* Tax Rate (if tax invoice and include tax) */}
                {formData.include_tax && formData.invoice_type === 'tax' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tax Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.tax_rate}
                      onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                      className="input"
                      placeholder="e.g., 18"
                    />
                  </div>
                )}

                {/* Invoice Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-medium text-gray-700">Invoice Items *</label>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="btn btn-sm btn-primary flex items-center space-x-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Item</span>
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {formData.items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                          <input
                            type="text"
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                            className="input"
                            required
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                            className="input"
                            required
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Unit Price"
                            value={item.unit_price}
                            onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                            className="input"
                            required
                          />
                        </div>
                        {formData.include_tax && formData.invoice_type === 'proforma' && (
                          <div className="col-span-2">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Tax %"
                              value={item.tax_rate}
                              onChange={(e) => handleItemChange(index, 'tax_rate', e.target.value)}
                              className="input"
                            />
                          </div>
                        )}
                        <div className="col-span-1">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="btn btn-sm btn-secondary w-full"
                            disabled={formData.items.length === 1}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className="font-semibold">₹{totals.subtotal.toLocaleString()}</span>
                      </div>
                      {formData.include_tax && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">Tax:</span>
                          <span className="font-semibold">₹{totals.taxAmount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold border-t pt-2">
                        <span>Total:</span>
                        <span>₹{totals.total.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes and Terms */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="input"
                      rows="3"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Terms & Conditions</label>
                    <textarea
                      value={formData.terms_and_conditions}
                      onChange={(e) => setFormData({ ...formData, terms_and_conditions: e.target.value })}
                      className="input"
                      rows="3"
                    />
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false)
                      resetForm()
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary"
                  >
                    {submitting ? 'Creating...' : 'Create Invoice'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {showDetailModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-3xl w-full my-8 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">Invoice Details</h2>
                <button
                  onClick={() => {
                    setShowDetailModal(false)
                    setSelectedInvoice(null)
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Invoice Details Display */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Invoice Number</p>
                    <p className="text-sm font-semibold">{selectedInvoice.invoice_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Type</p>
                    <p className="text-sm font-semibold capitalize">
                      {selectedInvoice.invoice_type === 'tax' ? 'Tax Invoice' : 'Proforma Invoice'}
                    </p>
                  </div>
                </div>

                {/* Client Info */}
                <div className="border-t pt-4">
                  <h3 className="text-xs font-semibold text-gray-700 mb-2">Bill To:</h3>
                  <div className="text-xs text-gray-600 space-y-1">
                    <p className="font-semibold text-gray-900">{selectedInvoice.client_name}</p>
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
                <div className="viewport-scroll-x border-t pt-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Description</th>
                        <th className="text-right py-2">Qty</th>
                        <th className="text-right py-2">Price</th>
                        {selectedInvoice.include_tax && <th className="text-right py-2">Tax</th>}
                        <th className="text-right py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoice.items?.map((item, index) => (
                        <tr key={index} className="border-b">
                          <td className="py-2">{item.description}</td>
                          <td className="text-right py-2">{item.quantity}</td>
                          <td className="text-right py-2">₹{item.unit_price?.toLocaleString()}</td>
                          {selectedInvoice.include_tax && (
                            <td className="text-right py-2">
                              {item.tax_rate ? `${item.tax_rate}%` : '-'}
                            </td>
                          )}
                          <td className="text-right py-2">₹{item.amount?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="border-t pt-4">
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className="font-semibold">₹{selectedInvoice.subtotal?.toLocaleString()}</span>
                      </div>
                      {selectedInvoice.include_tax && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">Tax:</span>
                          <span className="font-semibold">₹{selectedInvoice.tax_amount?.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold border-t pt-2">
                        <span>Total:</span>
                        <span>₹{selectedInvoice.total_amount?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Received:</span>
                        <span className="font-semibold">INR {selectedInvoice.total_received?.toLocaleString() || "0"}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Outstanding:</span>
                        <span className="font-semibold">INR {selectedInvoice.outstanding_amount?.toLocaleString() || "0"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedInvoice.payments?.length > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="text-xs font-semibold text-gray-700 mb-2">Payments</h3>
                    <div className="space-y-2">
                      {selectedInvoice.payments.map((payment, index) => (
                        <div key={index} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
                          <span>{payment.payment_method || 'Payment'} {payment.reference_number ? '- ' + payment.reference_number : ''}</span>
                          <span className="font-semibold">INR {Number(payment.amount || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="border-t pt-4 flex flex-wrap items-center justify-end gap-3">
                  <button
                    onClick={() => handleDownloadInvoice(selectedInvoice)}
                    className="btn btn-secondary flex items-center space-x-2"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download PDF</span>
                  </button>
                  {(isCompanyAdmin || isLead) && Number(selectedInvoice.outstanding_amount ?? selectedInvoice.total_amount ?? 0) > 0 && (
                    <button
                      onClick={() => handleRecordFullPayment(selectedInvoice)}
                      disabled={recordingPayment}
                      className="btn btn-secondary flex items-center space-x-2"
                    >
                      <CreditCard className="h-4 w-4" />
                      <span>{recordingPayment ? 'Recording...' : 'Record Full Payment'}</span>
                    </button>
                  )}
                  {(isCompanyAdmin || isLead) && Number(selectedInvoice.outstanding_amount ?? selectedInvoice.total_amount ?? 0) > 0 && (
                    <button
                      onClick={() => handleCreateRazorpayOrder(selectedInvoice)}
                      className="btn btn-secondary flex items-center space-x-2"
                    >
                      <CreditCard className="h-4 w-4" />
                      <span>Razorpay Order</span>
                    </button>
                  )}
                  {!selectedInvoice.email_sent && selectedInvoice.status === 'draft' && (
                    <button
                      onClick={() => {
                        handleSendEmail(selectedInvoice.id)
                        setShowDetailModal(false)
                      }}
                      className="btn btn-primary flex items-center space-x-2"
                    >
                      <Send className="h-4 w-4" />
                      <span>Send Email</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
