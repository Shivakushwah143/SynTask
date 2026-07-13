import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { ledgerAPI } from '../api/ledger'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { formatCurrency } from './crm/pipeline/utils'
import { Button, Modal, Table } from '../components/ui'

const Ledger = () => {
  const [ledgerData, setLedgerData] = useState(null)
  const [loading, setLoading] = useState(true)
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
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'cash',
    reference_number: '',
    notes: '',
  })
  
  const [tdsAmount, setTdsAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadLedger = useCallback(async () => {
    try {
      setLoading(true)
      const params = {}
      if (filters.invoice_id) params.invoice_id = filters.invoice_id
      if (filters.client_name) params.client_name = filters.client_name
      if (filters.status) params.status_filter = filters.status
      
      const data = await ledgerAPI.getLedger(params)
      setLedgerData(data)
    } catch (error) {
      console.error('Error loading ledger:', error)
      toast.error('Failed to load ledger data')
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
      toast.success('Payment added successfully')
      setShowPaymentModal(false)
      setPaymentForm({
        amount: '',
        payment_date: format(new Date(), 'yyyy-MM-dd'),
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
      toast.success('TDS updated successfully')
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

  const getDaysPassedBadge = (days) => {
    if (days < 30) {
      return 'bg-green-100 text-green-800'
    } else if (days < 60) {
      return 'bg-yellow-100 text-yellow-800'
    } else {
      return 'bg-red-100 text-red-800'
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
      render: (invoice) => <span className="font-medium text-text-primary">{invoice.invoice_id}</span>,
    },
    { key: 'client_name', header: 'Client', render: (invoice) => invoice.client_name },
    { key: 'invoice_date_formatted', header: 'Invoice Date', render: (invoice) => invoice.invoice_date_formatted },
    {
      key: 'days_passed',
      header: 'Days Passed',
      render: (invoice) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getDaysPassedBadge(invoice.days_passed)}`}>
          {invoice.days_passed} days
        </span>
      ),
    },
    { key: 'total_amount', header: 'Total', render: (invoice) => formatCurrency(invoice.total_amount) },
    {
      key: 'total_received',
      header: 'Received',
      render: (invoice) => <span className="font-medium text-emerald-600 dark:text-emerald-300">{formatCurrency(invoice.total_received)}</span>,
    },
    {
      key: 'outstanding_amount',
      header: 'Outstanding',
      render: (invoice) => <span className="font-medium text-rose-600 dark:text-rose-300">{formatCurrency(invoice.outstanding_amount)}</span>,
    },
    {
      key: 'tds_amount',
      header: 'TDS',
      render: (invoice) => (
        <div className="flex items-center gap-2">
          <span>{formatCurrency(invoice.tds_amount)}</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setSelectedInvoice(invoice)
              setTdsAmount(invoice.tds_amount.toString())
              setShowTDSModal(true)
            }}
          >
            Edit
          </Button>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (invoice) => (
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setSelectedInvoice(invoice)
            setPaymentForm({
              amount: invoice.outstanding_amount > 0 ? invoice.outstanding_amount.toString() : '',
              payment_date: format(new Date(), 'yyyy-MM-dd'),
              payment_method: 'cash',
              reference_number: '',
              notes: '',
            })
            setShowPaymentModal(true)
          }}
        >
          Add Payment
        </Button>
      ),
    },
  ]

  if (loading && !ledgerData) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-text-secondary">Loading ledger data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-muted p-6 text-text-primary dark:bg-black dark:text-text-primary">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-text-primary">Ledger</h1>
      </div>

      {/* Summary Cards */}
      {ledgerData?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="rounded-lg bg-surface/95 p-6 shadow dark:bg-black/85 dark:border dark:border-border">
            <div className="mb-1 text-sm font-medium text-text-secondary">Total Invoiced</div>
            <div className="text-3xl font-bold text-text-primary">
              {formatCurrency(ledgerData.summary.total_invoiced)}
            </div>
          </div>
          <div className="rounded-lg bg-surface/95 p-6 shadow">
            <div className="mb-1 text-sm font-medium text-text-secondary">Total Received</div>
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-300">
              {formatCurrency(ledgerData.summary.total_received)}
            </div>
          </div>
          <div className="rounded-lg bg-surface/95 p-6 shadow">
            <div className="mb-1 text-sm font-medium text-text-secondary">Total Outstanding</div>
            <div className="text-3xl font-bold text-rose-600 dark:text-rose-300">
              {formatCurrency(ledgerData.summary.total_outstanding)}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 rounded-lg bg-surface/95 p-4 shadow dark:bg-black/85 dark:border dark:border-border">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Invoice ID</label>
            <input
              type="text"
              value={filters.invoice_id}
              onChange={(e) => setFilters(prev => ({ ...prev, invoice_id: e.target.value }))}
              placeholder="Enter invoice ID"
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text-primary focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-black/70 dark:text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Client Name</label>
            <input
              type="text"
              value={filters.client_name}
              onChange={(e) => setFilters(prev => ({ ...prev, client_name: e.target.value }))}
              placeholder="Enter client name"
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text-primary focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-black/70 dark:text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">All Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text-primary focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-black/70 dark:text-text-primary"
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              onClick={handleApplyFilters}
              className="w-full"
            >
              Apply
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleRefresh}
              className="px-3"
              title="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-surface rounded-lg shadow dark:bg-black/85 dark:border dark:border-border">
        {loading ? (
          <div className="p-8 text-center text-text-muted">Loading...</div>
        ) : (
          <Table columns={invoiceColumns} data={ledgerData?.invoices || []} emptyMessage="No invoices found" />
        )}
      </div>

      {/* Add Payment Modal */}
      <Modal isOpen={showPaymentModal && Boolean(selectedInvoice)} onClose={closePaymentModal} title="Add Payment">
        {selectedInvoice ? (
            <form onSubmit={handleAddPayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice ID</label>
                <input
                  type="text"
                  value={selectedInvoice.invoice_id}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="Enter payment amount"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Outstanding: {formatCurrency(selectedInvoice.outstanding_amount)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  value={paymentForm.payment_method}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_method: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                <input
                  type="text"
                  value={paymentForm.reference_number}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, reference_number: e.target.value }))}
                  placeholder="Optional"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  placeholder="Optional notes"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closePaymentModal}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={submitting}
                  loadingText="Adding..."
                >
                  Add Payment
                </Button>
              </div>
            </form>
        ) : null}
      </Modal>

      {/* Edit TDS Modal */}
      <Modal isOpen={showTDSModal && Boolean(selectedInvoice)} onClose={closeTDSModal} title="Edit TDS">
        {selectedInvoice ? (
            <form onSubmit={handleUpdateTDS} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice ID</label>
                <input
                  type="text"
                  value={selectedInvoice.invoice_id}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">TDS Amount <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="0.01"
                  value={tdsAmount}
                  onChange={(e) => setTdsAmount(e.target.value)}
                  placeholder="Enter TDS amount"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeTDSModal}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={submitting}
                  loadingText="Updating..."
                >
                  Update TDS
                </Button>
              </div>
            </form>
        ) : null}
      </Modal>
    </div>
  )
}

export default Ledger
