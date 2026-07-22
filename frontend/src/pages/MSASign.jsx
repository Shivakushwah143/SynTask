import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CheckCircle, X, FileText } from 'lucide-react'
import { msaAPI } from '../api/msa'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import SignatureCanvas from '../components/SignatureCanvas'
import { timeService } from '@/services/timeService'

const MSASign = () => {
  const { token } = useParams()
  const navigate = useNavigate()
  const [msa, setMsa] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [clientName, setClientName] = useState('')
  const [signing, setSigning] = useState(false)

  const loadMSA = useCallback(async () => {
    try {
      setLoading(true)
      const data = await msaAPI.getMSAByToken(token)
      setMsa(data)
      setClientName(data.client_name || '')
    } catch (error) {
      console.error('Error loading MSA:', error)
      toast.error(error.response?.data?.detail || 'Failed to load MSA. Link may be invalid or expired.')
      setTimeout(() => {
        navigate('/')
      }, 3000)
    } finally {
      setLoading(false)
    }
  }, [navigate, token])

  useEffect(() => {
    loadMSA()
  }, [loadMSA])

  const handleSign = async (signatureImage) => {
    if (!msa || signing) return

    if (!clientName.trim()) {
      toast.error('Please enter your name')
      return
    }

    try {
      setSigning(true)
      await msaAPI.clientSignMSA(token, signatureImage, clientName.trim())
      toast.success('MSA signed successfully!')
      setShowSignatureModal(false)
      loadMSA() // Reload to show updated status
    } catch (error) {
      console.error('Error signing MSA:', error)
      toast.error(error.response?.data?.detail || 'Failed to sign MSA')
    } finally {
      setSigning(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading MSA...</p>
        </div>
      </div>
    )
  }

  if (!msa) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <X className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">MSA Not Found</h2>
          <p className="text-gray-600 mb-4">
            The MSA link is invalid or has expired. Please contact the sender for a new link.
          </p>
        </div>
      </div>
    )
  }

  const isCompleted = msa.status === 'completed'
  const isClientSigned = msa.client_signature?.signature_image

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Master Service Agreement</h1>
              <p className="text-gray-600 mt-1">MSA Number: {msa.msa_number}</p>
            </div>
            {isCompleted && (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-6 w-6" />
                <span className="font-semibold">Completed</span>
              </div>
            )}
          </div>
        </div>

        {/* MSA Content */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Agreement Details</h2>
          
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-medium text-gray-700 mb-2">From (Staffing Company)</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p className="font-medium">{msa.company_name}</p>
                  {msa.company_address && <p>{msa.company_address}</p>}
                  {(msa.company_city || msa.company_state) && (
                    <p>{msa.company_city}, {msa.company_state} {msa.company_zip_code}</p>
                  )}
                  {msa.company_country && <p>{msa.company_country}</p>}
                  {msa.company_cin && <p className="mt-2">CIN: {msa.company_cin}</p>}
                </div>
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-2">To (Client)</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <p className="font-medium">{msa.client_name}</p>
                  {msa.client_company_name && <p>{msa.client_company_name}</p>}
                  {msa.client_address && <p>{msa.client_address}</p>}
                  {(msa.client_city || msa.client_state) && (
                    <p>{msa.client_city}, {msa.client_state} {msa.client_zip_code}</p>
                  )}
                  {msa.client_country && <p>{msa.client_country}</p>}
                  {msa.client_identifier && <p className="mt-2">ID: {msa.client_identifier}</p>}
                </div>
              </div>
            </div>
            
            {msa.effective_date && (
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Effective Date:</span>{' '}
                  {format(timeService.instant(msa.effective_date), 'MMMM dd, yyyy')}
                </p>
              </div>
            )}
          </div>

          {/* MSA Content */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="font-medium text-gray-700 mb-2">Agreement Content</h3>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800">
                {msa.content || 'No content'}
              </pre>
            </div>
          </div>
        </div>

        {/* Signatures Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Signatures</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Staffing Company Signature */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium mb-2">Staffing Company</h3>
              {msa.staffing_company_signature?.signature_image ? (
                <div>
                  <img 
                    src={msa.staffing_company_signature.signature_image} 
                    alt="Staffing Signature" 
                    className="max-w-full h-24 object-contain border border-gray-200 rounded mb-2"
                  />
                  <p className="text-sm text-gray-600">
                    Signed by: {msa.staffing_company_signature.signed_by}
                  </p>
                  <p className="text-xs text-gray-500">
                    {msa.staffing_company_signature.signed_at ? 
                      format(timeService.instant(msa.staffing_company_signature.signed_at), 'MMM d, yyyy h:mm a') : ''}
                  </p>
                </div>
              ) : (
                <div className="text-gray-400 text-sm py-8 text-center">Not signed yet</div>
              )}
            </div>

            {/* Client Signature */}
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium mb-2">Client</h3>
              {isClientSigned ? (
                <div>
                  <img 
                    src={msa.client_signature.signature_image} 
                    alt="Client Signature" 
                    className="max-w-full h-24 object-contain border border-gray-200 rounded mb-2"
                  />
                  <p className="text-sm text-gray-600">
                    Signed by: {msa.client_signature.signed_by}
                  </p>
                  <p className="text-xs text-gray-500">
                    {msa.client_signature.signed_at ? 
                      format(timeService.instant(msa.client_signature.signed_at), 'MMM d, yyyy h:mm a') : ''}
                  </p>
                </div>
              ) : (
                <div className="text-gray-400 text-sm py-8 text-center">Waiting for signature</div>
              )}
            </div>
          </div>

          {/* Stamp */}
          {msa.stamp_image_url && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="font-medium mb-2">Stamp</h3>
              <img 
                src={msa.stamp_image_url} 
                alt="Stamp" 
                className="max-w-xs h-32 object-contain border border-gray-200 rounded"
              />
            </div>
          )}
        </div>

        {/* Sign Button */}
        {!isClientSigned && !isCompleted && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="max-w-md mx-auto">
              <h3 className="text-lg font-semibold mb-4 text-center">Sign This Agreement</h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name *
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                onClick={() => setShowSignatureModal(true)}
                disabled={!clientName.trim() || signing}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <FileText className="h-5 w-5" />
                Sign Agreement
              </button>

              <p className="text-xs text-gray-500 text-center mt-4">
                By signing, you agree to the terms and conditions outlined in this agreement.
              </p>
            </div>
          </div>
        )}

        {/* Success Message */}
        {isCompleted && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-900 mb-2">Agreement Completed</h3>
            <p className="text-green-700">
              This MSA has been fully executed and signed by both parties.
            </p>
          </div>
        )}
      </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <SignatureCanvas
          onSave={handleSign}
          onClose={() => setShowSignatureModal(false)}
          title="Sign MSA"
        />
      )}
    </div>
  )
}

export default MSASign

