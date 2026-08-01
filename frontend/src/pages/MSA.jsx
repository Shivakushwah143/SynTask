import { useState, useEffect, useCallback } from 'react'
import { FileText, Plus, X, Search, Send, CheckCircle, Clock, Download, Filter, Bookmark } from 'lucide-react'
import { msaAPI } from '../api/msa'
import { useAuthStore } from '../store/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { hasCompanyAdminAccess, isLeadRole } from '../utils/roles'
import { timeService } from '@/services/timeService'

const MSA = () => {
  const { user } = useAuthStore()
  const [msas, setMsas] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [activeTab, setActiveTab] = useState('client') // 'client' or 'candidate'
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [selectedMSA] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  const [createFormData, setCreateFormData] = useState({
    client_name: '',
    client_email: '',
    agreement_title: '',
    content: '',
    // Company details
    gst_cin: '',
    company_name: '',
    signer_name: '',
    signer_email: '',
    company_signature_file: null,
    company_stamp_file: null,
    company_logo_file: null,
    header_background_color: '#1F2937',
    company_address: '',
  })

  const [sendFormData, setSendFormData] = useState({
    gst_cin: '',
    company_name: '',
    signer_name: '',
    signer_email: '',
    company_signature_file: null,
    company_stamp_file: null,
    company_logo_file: null,
    header_background_color: '#1F2937',
    company_address: '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [sending, setSending] = useState(false)
  const [templates, setTemplates] = useState([])

  const isCompanyAdmin = hasCompanyAdminAccess(user?.role)
  const isLead = isLeadRole(user?.role)

  const loadMSAs = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const params = { msa_type: activeTab }
      const data = await msaAPI.listMSAs(params)
      setMsas(data.msas || [])
    } catch (error) {
      console.error('Error loading MSAs:', error)
      const message = error.response?.status === 403
        ? 'You do not have permission to view MSAs. Please contact your administrator.'
        : error.response?.status === 401
          ? 'Please login to view MSAs'
          : 'Failed to load MSAs'
      setLoadError(message)
      toast.error(message)
      setMsas([])
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  const loadTemplates = useCallback(async () => {
    try {
      const params = { is_template: true }
      const data = await msaAPI.listMSAs(params)
      setTemplates(data.msas || [])
    } catch (error) {
      console.error('Error loading templates:', error)
    }
  }, [])

  useEffect(() => {
    loadMSAs()
    loadTemplates()
  }, [loadMSAs, loadTemplates])

  const handleCreateMSA = async (e, sendImmediately = false) => {
    e.preventDefault()
    if (!createFormData.client_name || !createFormData.client_email || !createFormData.agreement_title || !createFormData.content) {
      toast.error('Please fill all required fields')
      return
    }

    try {
      setSubmitting(true)
      const formDataToSend = new FormData()
      formDataToSend.append('client_name', createFormData.client_name)
      formDataToSend.append('client_email', createFormData.client_email)
      formDataToSend.append('agreement_title', createFormData.agreement_title)
      formDataToSend.append('content', createFormData.content)
      formDataToSend.append('msa_type', activeTab)

      // Add company details
      if (createFormData.gst_cin) formDataToSend.append('gst_cin', createFormData.gst_cin)
      if (createFormData.company_name) formDataToSend.append('company_name', createFormData.company_name)
      if (createFormData.signer_name) formDataToSend.append('signer_name', createFormData.signer_name)
      if (createFormData.signer_email) formDataToSend.append('signer_email', createFormData.signer_email)
      if (createFormData.header_background_color) formDataToSend.append('header_background_color', createFormData.header_background_color)
      if (createFormData.company_address) formDataToSend.append('company_address', createFormData.company_address)

      if (createFormData.company_logo_file) {
        formDataToSend.append('company_logo', createFormData.company_logo_file)
      }
      if (createFormData.company_signature_file) {
        formDataToSend.append('company_signature', createFormData.company_signature_file)
      }
      if (createFormData.company_stamp_file) {
        formDataToSend.append('company_stamp', createFormData.company_stamp_file)
      }

      // Add send flag
      formDataToSend.append('send_immediately', sendImmediately ? 'true' : 'false')

      await msaAPI.createMSA(formDataToSend)
      toast.success(sendImmediately ? 'MSA created and sent successfully' : 'MSA saved as draft')
      setShowCreateModal(false)
      setCreateFormData({
        client_name: '',
        client_email: '',
        agreement_title: '',
        content: '',
        gst_cin: '',
        company_name: '',
        signer_name: '',
        signer_email: '',
        company_signature_file: null,
        company_stamp_file: null,
        company_logo_file: null,
        header_background_color: '#1F2937',
        company_address: '',
      })
      loadMSAs()
    } catch (error) {
      console.error('Error creating MSA:', error)
      toast.error(error.response?.data?.detail || 'Failed to create MSA')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendMSA = async (e) => {
    e.preventDefault()
    if (!selectedMSA) return

    try {
      setSending(true)
      // For draft MSAs, send without asking for details again (use saved data)
      // Only send if there are new files or updated fields
      const formDataToSend = new FormData()

      // Only include fields if they have new values
      if (sendFormData.gst_cin) formDataToSend.append('gst_cin', sendFormData.gst_cin)
      if (sendFormData.company_name) formDataToSend.append('company_name', sendFormData.company_name)
      if (sendFormData.signer_name) formDataToSend.append('signer_name', sendFormData.signer_name)
      if (sendFormData.signer_email) formDataToSend.append('signer_email', sendFormData.signer_email)
      if (sendFormData.header_background_color) formDataToSend.append('header_background_color', sendFormData.header_background_color)
      if (sendFormData.company_address) formDataToSend.append('company_address', sendFormData.company_address)

      if (sendFormData.company_logo_file) {
        formDataToSend.append('company_logo', sendFormData.company_logo_file)
      }
      if (sendFormData.company_signature_file) {
        formDataToSend.append('company_signature', sendFormData.company_signature_file)
      }
      if (sendFormData.company_stamp_file) {
        formDataToSend.append('company_stamp', sendFormData.company_stamp_file)
      }

      await msaAPI.sendMSA(selectedMSA.id, formDataToSend)
      toast.success('MSA sent successfully')
      setShowSendModal(false)
      loadMSAs()
    } catch (error) {
      console.error('Error sending MSA:', error)
      toast.error(error.response?.data?.detail || 'Failed to send MSA')
    } finally {
      setSending(false)
    }
  }

  const handleQuickSend = async (msa) => {
    // Quick send for draft MSAs - use saved data
    try {
      setSending(true)
      await msaAPI.sendForSignature(msa.id)
      toast.success('MSA sent successfully')
      loadMSAs()
    } catch (error) {
      console.error('Error sending MSA:', error)
      toast.error(error.response?.data?.detail || 'Failed to send MSA')
    } finally {
      setSending(false)
    }
  }

  const handleLoadTemplate = (template) => {
    setCreateFormData({
      client_name: '',
      client_email: '',
      agreement_title: template.agreement_title || '',
      content: template.content || '',
      gst_cin: '',
      company_name: '',
      signer_name: '',
      signer_email: '',
      company_signature_file: null,
      company_stamp_file: null,
      company_logo_file: null,
      header_background_color: '#1F2937',
      company_address: '',
    })
    setShowTemplateModal(false)
    setShowCreateModal(true)
    toast.success('Template loaded')
  }

  const handleSaveAsTemplate = async () => {
    if (!selectedMSA) return

    try {
      await msaAPI.saveAsTemplate(selectedMSA.id)
      toast.success('Saved as template successfully')
      loadTemplates()
    } catch (error) {
      console.error('Error saving template:', error)
      toast.error('Failed to save as template')
    }
  }

  const handleDownloadMSA = async (msa) => {
    try {
      await msaAPI.downloadMSA(msa.id)
      toast.success('MSA downloaded successfully')
    } catch (error) {
      console.error('Error downloading MSA:', error)
      toast.error('Failed to download MSA')
    }
  }

  const getStatusBadge = (msa) => {
    if (msa.status === 'completed' || (msa.staffing_signed && msa.client_signed)) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3" />
          Signed by Both
        </span>
      )
    } else if (msa.status === 'sent' || msa.status === 'staffing_signed' || msa.status === 'client_signed') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <Clock className="h-3 w-3" />
          Pending Signature
        </span>
      )
    } else {
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium bg-surface-muted text-text-secondary">
          <Clock className="h-3 w-3" />
          Draft
        </span>
      )
    }
  }

  const filteredMSAs = msas.filter(msa => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      msa.client_name?.toLowerCase().includes(query) ||
      msa.client_email?.toLowerCase().includes(query) ||
      msa.agreement_title?.toLowerCase().includes(query) ||
      msa.client_company_name?.toLowerCase().includes(query)
    )
  })

  return (
    <div className="min-h-screen bg-surface-muted p-6 text-text-primary dark:bg-black dark:text-text-primary">
      {/* Header */}
      <div className="mb-6">
        <h1 className="mb-2 text-3xl font-bold text-text-primary">Master Service Agreement (MSA)</h1>
        <p className="text-text-secondary">Manage agreements with clients and candidates</p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 mb-6">
        <button
          onClick={() => setShowTemplateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-surface-muted text-text-primary rounded-lg hover:bg-surface dark:bg-black/70 dark:text-text-primary dark:hover:bg-white/5"
        >
          <FileText className="h-4 w-4" />
          Load Template
        </button>
        {(isCompanyAdmin || isLead) && (
          <button
            onClick={() => {
              setCreateFormData({
                client_name: '',
                client_email: '',
                agreement_title: '',
                content: '',
              })
              setShowCreateModal(true)
            }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            Create New MSA
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-surface rounded-lg shadow-sm mb-6 dark:bg-black/85">
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('client')}
            className={`px-6 py-3 font-medium text-sm ${activeTab === 'client'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            MSA with Client
          </button>
          <button
            onClick={() => setActiveTab('candidate')}
            className={`px-6 py-3 font-medium text-sm ${activeTab === 'candidate'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-text-secondary hover:text-text-primary'
              }`}
          >
            MSA with Candidate
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-surface rounded-lg shadow-sm p-4 mb-6 dark:bg-black/85">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, title, or company..."
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-surface text-text-primary focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-black/70 dark:text-text-primary"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg hover:bg-surface-muted dark:hover:bg-white/5">
            <Filter className="h-4 w-4" />
            Filters
          </button>
        </div>
        <div className="mt-3 text-sm text-text-secondary">
          Showing {filteredMSAs.length} of {msas.length} MSAs
        </div>
      </div>

      {/* MSAs Table */}
      <div className="viewport-scroll-x bg-surface rounded-lg shadow-sm dark:bg-black/85">
        {loading ? (
          <div className="p-8 text-center text-text-muted">Loading...</div>
        ) : loadError ? (
          <div className="p-8 text-center">
            <div className="font-semibold text-text-primary">MSAs unavailable</div>
            <div className="mt-1 text-sm text-text-muted">{loadError}</div>
            <button
              type="button"
              onClick={loadMSAs}
              className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Retry
            </button>
          </div>
        ) : filteredMSAs.length === 0 ? (
          <div className="p-8 text-center text-text-muted">No MSAs found</div>
        ) : (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-muted dark:bg-black/70">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">CLIENT</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">AGREEMENT TITLE</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">SENT DATE</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">SIGNED DATE</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">STATUS</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-border dark:bg-black/85">
              {filteredMSAs.map(msa => (
                <tr key={msa.id} className="hover:bg-surface-muted dark:hover:bg-white/5">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-text-primary">{msa.client_name}</div>
                    <div className="text-sm text-text-muted">{msa.client_email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-text-primary">{msa.agreement_title || 'MSA'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-text-primary">
                      {msa.sent_date ? timeService.formatDateOnly(msa.sent_date) : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-text-primary">
                      {msa.signed_date ? timeService.formatDateOnly(msa.signed_date) : '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(msa)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {msa.status === 'completed' || (msa.staffing_signed && msa.client_signed) ? (
                      <button
                        onClick={() => handleDownloadMSA(msa)}
                        className="flex items-center gap-2 px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </button>
                    ) : msa.status === 'draft' ? (
                      <button
                        onClick={() => handleQuickSend(msa)}
                        className="flex items-center gap-2 px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                      >
                        <Send className="h-4 w-4" />
                        Send
                      </button>
                    ) : (
                      <span className="text-text-muted">Awaiting signature</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create MSA Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col dark:bg-black/95">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-xl font-bold">Create New MSA - {activeTab === 'client' ? 'Client' : 'Candidate'}</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateMSA} className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Client Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={createFormData.client_name}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, client_name: e.target.value }))}
                      placeholder="Enter name"
                      required
                      className="w-full px-4 py-2 border border-border rounded-lg bg-surface text-text-primary focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-black/70 dark:text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Client Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={createFormData.client_email}
                      onChange={(e) => setCreateFormData(prev => ({ ...prev, client_email: e.target.value }))}
                      placeholder="Enter email"
                      required
                      className="w-full px-4 py-2 border border-border rounded-lg bg-surface text-text-primary focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-black/70 dark:text-text-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agreement Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={createFormData.agreement_title}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, agreement_title: e.target.value }))}
                    placeholder="e.g., Master Service Agreement 2025"
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agreement Content <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={createFormData.content}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, content: e.target.value }))}
                    placeholder="Enter the full agreement content here..."
                    rows={15}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* GST / Corporate ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GST / Corporate ID Number
                  </label>
                  <input
                    type="text"
                    value={createFormData.gst_cin}
                    onChange={(e) => setCreateFormData(prev => ({ ...prev, gst_cin: e.target.value }))}
                    placeholder="e.g., U62090MP2024PTC071854"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Header Customization */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Header Customization</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Logo</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, company_logo_file: e.target.files[0] }))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                      <p className="text-xs text-gray-500 mt-1">Recommended: 200x200px, PNG with transparent background</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Header Background Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={createFormData.header_background_color}
                          onChange={(e) => setCreateFormData(prev => ({ ...prev, header_background_color: e.target.value }))}
                          className="h-10 w-20 border border-gray-300 rounded"
                        />
                        <input
                          type="text"
                          value={createFormData.header_background_color}
                          onChange={(e) => setCreateFormData(prev => ({ ...prev, header_background_color: e.target.value }))}
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Address</label>
                      <textarea
                        value={createFormData.company_address}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, company_address: e.target.value }))}
                        placeholder="C/O Address Line 1, City, State - Pincode"
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Company Signatory Details */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Company Signatory Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                      <input
                        type="text"
                        value={createFormData.company_name}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, company_name: e.target.value }))}
                        placeholder="Your Company Name"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Signer Name</label>
                      <input
                        type="text"
                        value={createFormData.signer_name}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, signer_name: e.target.value }))}
                        placeholder="Authorized Signatory Name"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Signer Email</label>
                      <input
                        type="email"
                        value={createFormData.signer_email}
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, signer_email: e.target.value }))}
                        placeholder="Signatory email"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Signature (Optional)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, company_signature_file: e.target.files[0] }))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Stamp (Optional)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setCreateFormData(prev => ({ ...prev, company_stamp_file: e.target.files[0] }))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => handleCreateMSA(e, false)}
                  disabled={submitting}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:bg-gray-400"
                >
                  {submitting ? 'Saving...' : 'Save as Draft'}
                </button>
                <button
                  type="submit"
                  onClick={(e) => handleCreateMSA(e, true)}
                  disabled={submitting}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                >
                  {submitting ? 'Creating & Sending...' : 'Create & Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send MSA Modal */}
      {showSendModal && selectedMSA && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex-none flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-bold">Send MSA</h2>
              <button
                onClick={() => setShowSendModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSendMSA} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* GST / Corporate ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GST / Corporate ID Number
                </label>
                <input
                  type="text"
                  value={sendFormData.gst_cin}
                  onChange={(e) => setSendFormData(prev => ({ ...prev, gst_cin: e.target.value }))}
                  placeholder="e.g., U62090MP2024PTC071854"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Header Customization */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Header Customization</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Logo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setSendFormData(prev => ({ ...prev, company_logo_file: e.target.files[0] }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">Recommended: 200x200px, PNG with transparent background</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Header Background Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={sendFormData.header_background_color}
                        onChange={(e) => setSendFormData(prev => ({ ...prev, header_background_color: e.target.value }))}
                        className="h-10 w-20 border border-gray-300 rounded"
                      />
                      <input
                        type="text"
                        value={sendFormData.header_background_color}
                        onChange={(e) => setSendFormData(prev => ({ ...prev, header_background_color: e.target.value }))}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Address</label>
                    <textarea
                      value={sendFormData.company_address}
                      onChange={(e) => setSendFormData(prev => ({ ...prev, company_address: e.target.value }))}
                      placeholder="C/O Address Line 1, City, State - Pincode"
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Company Signatory Details */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Company Signatory Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                    <input
                      type="text"
                      value={sendFormData.company_name}
                      onChange={(e) => setSendFormData(prev => ({ ...prev, company_name: e.target.value }))}
                      placeholder="Your Company Name"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Signer Name</label>
                    <input
                      type="text"
                      value={sendFormData.signer_name}
                      onChange={(e) => setSendFormData(prev => ({ ...prev, signer_name: e.target.value }))}
                      placeholder="Authorized Signatory Name"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Signer Email</label>
                    <input
                      type="email"
                      value={sendFormData.signer_email}
                      onChange={(e) => setSendFormData(prev => ({ ...prev, signer_email: e.target.value }))}
                      placeholder="Signatory email"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Signature (Optional)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setSendFormData(prev => ({ ...prev, company_signature_file: e.target.files[0] }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Stamp (Optional)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setSendFormData(prev => ({ ...prev, company_stamp_file: e.target.files[0] }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleSaveAsTemplate}
                  className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  <Bookmark className="h-4 w-4" />
                  Save as Template
                </button>
                <button
                  type="button"
                  onClick={() => setShowSendModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                >
                  {sending ? 'Sending...' : 'Send MSA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Load Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-xl font-bold">Load Template</h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {templates.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No templates available</div>
              ) : (
                <div className="space-y-2">
                  {templates.map(template => (
                    <button
                      key={template.id}
                      onClick={() => handleLoadTemplate(template)}
                      className="w-full text-left p-4 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-purple-500"
                    >
                      <div className="font-medium text-gray-900">{template.agreement_title || 'Untitled Template'}</div>
                      <div className="text-sm text-gray-500 mt-1">{template.template_name || 'No description'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MSA
