import { useState, useEffect } from 'react'
import { DollarSign, RefreshCw, Search, Plus, Edit, X } from 'lucide-react'
import { ledgerAPI } from '../api/ledger'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const Ledger = () => {
  const { user } = useAuthStore()
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

  const isCompanyAdmin = user?.role === 'company_admin'
  const isLead = user?.role === 'lead'

  useEffect(() => {
    loadLedger()
  }, [])

  const loadLedger = async () => {
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
  }

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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
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

  if (loading && !ledgerData) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading ledger data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Ledger</h1>
      </div>

      {/* Summary Cards */}
      {ledgerData?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600 mb-1">Total Invoiced</div>
            <div className="text-3xl font-bold text-gray-900">
              {formatCurrency(ledgerData.summary.total_invoiced)}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600 mb-1">Total Received</div>
            <div className="text-3xl font-bold text-green-600">
              {formatCurrency(ledgerData.summary.total_received)}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600 mb-1">Total Outstanding</div>
            <div className="text-3xl font-bold text-red-600">
              {formatCurrency(ledgerData.summary.total_outstanding)}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice ID</label>
            <input
              type="text"
              value={filters.invoice_id}
              onChange={(e) => setFilters(prev => ({ ...prev, invoice_id: e.target.value }))}
              placeholder="Enter invoice ID"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
            <input
              type="text"
              value={filters.client_name}
              onChange={(e) => setFilters(prev => ({ ...prev, client_name: e.target.value }))}
              placeholder="Enter client name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">All Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              onClick={handleApplyFilters}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Apply
            </button>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              title="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : !ledgerData?.invoices || ledgerData.invoices.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No invoices found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">INVOICE ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CLIENT</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">INVOICE DATE</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DAYS PASSED</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">TOTAL</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RECEIVED</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OUTSTANDING</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">TDS</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ledgerData.invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{invoice.invoice_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{invoice.client_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{invoice.invoice_date_formatted}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDaysPassedBadge(invoice.days_passed)}`}>
                        {invoice.days_passed} days
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatCurrency(invoice.total_amount)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-green-600 font-medium">{formatCurrency(invoice.total_received)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-red-600 font-medium">{formatCurrency(invoice.outstanding_amount)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-900">{formatCurrency(invoice.tds_amount)}</span>
                        <button
                          onClick={() => {
                            setSelectedInvoice(invoice)
                            setTdsAmount(invoice.tds_amount.toString())
                            setShowTDSModal(true)
                          }}
                          className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
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
                        className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Add Payment
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-bold">Add Payment</h2>
              <button
                onClick={() => {
                  setShowPaymentModal(false)
                  setSelectedInvoice(null)
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddPayment} className="p-6 space-y-4">
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
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentModal(false)
                    setSelectedInvoice(null)
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {submitting ? 'Adding...' : 'Add Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit TDS Modal */}
      {showTDSModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-bold">Edit TDS</h2>
              <button
                onClick={() => {
                  setShowTDSModal(false)
                  setSelectedInvoice(null)
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateTDS} className="p-6 space-y-4">
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
                <button
                  type="button"
                  onClick={() => {
                    setShowTDSModal(false)
                    setSelectedInvoice(null)
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {submitting ? 'Updating...' : 'Update TDS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Ledger

