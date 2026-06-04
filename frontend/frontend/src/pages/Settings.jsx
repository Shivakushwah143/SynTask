import { useState, useRef } from 'react'
import { User, Lock, Bell, Shield, Download, X, Camera, Trash2 } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../api/auth'
import toast from 'react-hot-toast'

const Settings = () => {
  const { user, updateUser } = useAuthStore()
  const [activeTab, setActiveTab] = useState('profile')
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user?.two_factor_enabled || false)

  const [changingPassword, setChangingPassword] = useState(false)
  const [show2FAModal, setShow2FAModal] = useState(false)
  const [twoFAPassword, setTwoFAPassword] = useState('')
  const [loading2FA, setLoading2FA] = useState(false)
  const [qrCodeData, setQrCodeData] = useState(null)
  const [secretKey, setSecretKey] = useState(null)
  
  // Notification preferences state
  const [notificationPrefs, setNotificationPrefs] = useState({
    email_notifications: user?.notification_preferences?.email_notifications ?? true,
    in_app_notifications: user?.notification_preferences?.in_app_notifications ?? true,
    task_assignment_alerts: user?.notification_preferences?.task_assignment_alerts ?? true,
    ticket_updates: user?.notification_preferences?.ticket_updates ?? true,
  })
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const fileInputRef = useRef(null)

  const handleChangePassword = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    
    const oldPassword = formData.get('old_password')
    const newPassword = formData.get('new_password')
    
    if (!oldPassword || !newPassword) {
      toast.error('Please fill in all fields')
      return
    }
    
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters long')
      return
    }
    
    try {
      setChangingPassword(true)
      await authAPI.changePassword(oldPassword, newPassword)
      toast.success('Password changed successfully')
      e.target.reset()
    } catch (error) {
      console.error('Change password error:', error)
      toast.error(error.response?.data?.detail || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleToggle2FA = () => {
    if (twoFactorEnabled) {
      // Disable 2FA
      setShow2FAModal(true)
    } else {
      // Enable 2FA
      setShow2FAModal(true)
    }
  }

  const handleEnable2FA = async (e) => {
    e.preventDefault()
    if (!twoFAPassword) {
      toast.error('Please enter your password')
      return
    }

    try {
      setLoading2FA(true)
      const response = await authAPI.enable2FA(twoFAPassword)
      setQrCodeData(response.qr_code)
      setSecretKey(response.secret)
      toast.success('2FA enabled! Please scan the QR code with your authenticator app.')
      setTwoFactorEnabled(true)
      updateUser({ ...user, two_factor_enabled: true })
    } catch (error) {
      console.error('Enable 2FA error:', error)
      toast.error(error.response?.data?.detail || 'Failed to enable 2FA')
    } finally {
      setLoading2FA(false)
    }
  }

  const handleDisable2FA = async (e) => {
    e.preventDefault()
    if (!twoFAPassword) {
      toast.error('Please enter your password')
      return
    }

    if (!confirm('Are you sure you want to disable 2FA? This will reduce your account security.')) {
      return
    }

    try {
      setLoading2FA(true)
      await authAPI.disable2FA(twoFAPassword)
      toast.success('2FA disabled successfully')
      setTwoFactorEnabled(false)
      updateUser({ ...user, two_factor_enabled: false })
      setShow2FAModal(false)
      setTwoFAPassword('')
      setQrCodeData(null)
      setSecretKey(null)
    } catch (error) {
      console.error('Disable 2FA error:', error)
      toast.error(error.response?.data?.detail || 'Failed to disable 2FA')
    } finally {
      setLoading2FA(false)
    }
  }

  const close2FAModal = () => {
    setShow2FAModal(false)
    setTwoFAPassword('')
    setQrCodeData(null)
    setSecretKey(null)
  }

  const handleSaveNotificationPreferences = async () => {
    try {
      setSavingPreferences(true)
      const response = await authAPI.updateNotificationPreferences(notificationPrefs)
      toast.success(response.message || 'Notification preferences saved successfully')
      
      // Update user in store
      updateUser({
        ...user,
        notification_preferences: response.preferences || notificationPrefs
      })
    } catch (error) {
      console.error('Save notification preferences error:', error)
      toast.error(error.response?.data?.detail || 'Failed to save notification preferences')
    } finally {
      setSavingPreferences(false)
    }
  }

  const handleAvatarSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file')
        return
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB')
        return
      }
      
      // Show preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result)
      }
      reader.readAsDataURL(file)
      
      // Upload avatar
      handleAvatarUpload(file)
    }
  }

  const handleAvatarUpload = async (file) => {
    try {
      setUploadingAvatar(true)
      const response = await authAPI.uploadAvatar(file)
      toast.success('Avatar uploaded successfully')
      
      // Update user in store
      updateUser({
        ...user,
        avatar: response.avatar_url
      })
      
      // Clear preview
      setAvatarPreview(null)
      
      // Refresh user data
      const userData = await authAPI.getMe()
      updateUser(userData)
    } catch (error) {
      console.error('Upload avatar error:', error)
      toast.error(error.response?.data?.detail || 'Failed to upload avatar')
      setAvatarPreview(null)
    } finally {
      setUploadingAvatar(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDeleteAvatar = async () => {
    if (!confirm('Are you sure you want to delete your avatar?')) {
      return
    }
    
    try {
      setUploadingAvatar(true)
      await authAPI.deleteAvatar()
      toast.success('Avatar deleted successfully')
      
      // Update user in store
      updateUser({
        ...user,
        avatar: null
      })
      
      // Refresh user data
      const userData = await authAPI.getMe()
      updateUser(userData)
    } catch (error) {
      console.error('Delete avatar error:', error)
      toast.error(error.response?.data?.detail || 'Failed to delete avatar')
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Get avatar URL
  const getAvatarUrl = () => {
    if (avatarPreview) return avatarPreview
    if (user?.avatar) {
      // If avatar is a full URL, return as is, otherwise prepend API URL
      if (user.avatar.startsWith('http')) {
        return user.avatar
      }
      const apiUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000'
      return `${apiUrl}${user.avatar}`
    }
    return null
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 text-xs mt-0.5">Manage your account settings</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'profile', label: 'Profile', icon: User },
            { id: 'security', label: 'Security', icon: Lock },
            { id: 'notifications', label: 'Notifications', icon: Bell },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-5 w-5 mr-2" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h3>
          
          {/* Avatar Section */}
          <div className="mb-6 pb-6 border-b border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Profile Photo
            </label>
            <div className="flex items-center space-x-4">
              <div className="relative">
                {getAvatarUrl() ? (
                  <img
                    src={getAvatarUrl()}
                    alt="Profile"
                    className="h-20 w-20 rounded-full object-cover border-2 border-gray-200"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-primary-100 flex items-center justify-center border-2 border-gray-200">
                    <span className="text-primary-600 font-semibold text-xl">
                      {user?.first_name?.[0]}{user?.last_name?.[0]}
                    </span>
                  </div>
                )}
                {uploadingAvatar && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </div>
                )}
              </div>
              <div className="flex flex-col space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="btn btn-secondary text-sm px-4 py-2 flex items-center space-x-2"
                >
                  <Camera className="h-4 w-4" />
                  <span>{user?.avatar ? 'Change Photo' : 'Upload Photo'}</span>
                </button>
                {user?.avatar && (
                  <button
                    type="button"
                    onClick={handleDeleteAvatar}
                    disabled={uploadingAvatar}
                    className="btn btn-secondary text-sm px-4 py-2 flex items-center space-x-2 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Remove Photo</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              JPG, PNG or GIF. Max size 5MB.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  defaultValue={user?.first_name}
                  className="input"
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  defaultValue={user?.last_name}
                  className="input"
                  disabled
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                defaultValue={user?.email}
                className="input"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <input
                type="text"
                defaultValue={user?.role?.replace('_', ' ').toUpperCase()}
                className="input"
                disabled
              />
            </div>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Change Password */}
          <div className="card">
            <div className="flex items-center mb-4">
              <Lock className="h-5 w-5 text-primary-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Password *
                </label>
                <input
                  type="password"
                  name="old_password"
                  required
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password *
                </label>
                <input
                  type="password"
                  name="new_password"
                  required
                  minLength={8}
                  className="input"
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={changingPassword}
              >
                {changingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </div>

          {/* Two-Factor Authentication */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <Shield className="h-5 w-5 text-primary-600 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900">Two-Factor Authentication</h3>
              </div>
              <span className={`badge ${twoFactorEnabled ? 'badge-success' : 'badge-secondary'}`}>
                {twoFactorEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="text-gray-600 text-sm mb-4">
              Add an extra layer of security to your account by enabling two-factor authentication.
            </p>
            <button 
              onClick={handleToggle2FA}
              className="btn btn-primary"
              disabled={loading2FA}
            >
              {loading2FA ? 'Processing...' : (twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA')}
            </button>
          </div>
        </div>
      )}

      {/* 2FA Modal */}
      {show2FAModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {twoFactorEnabled ? 'Disable Two-Factor Authentication' : 'Enable Two-Factor Authentication'}
              </h2>
              <button
                onClick={close2FAModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {qrCodeData ? (
              // Show QR Code after enabling
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 mb-2">
                    <strong>Success!</strong> 2FA has been enabled. Please follow these steps:
                  </p>
                  <ol className="text-sm text-blue-800 list-decimal list-inside space-y-1">
                    <li>Open your authenticator app (Google Authenticator, Authy, etc.)</li>
                    <li>Scan the QR code below</li>
                    <li>Enter the 6-digit code from your app when logging in</li>
                  </ol>
                </div>
                
                <div className="flex justify-center">
                  <img 
                    src={qrCodeData} 
                    alt="QR Code for 2FA" 
                    className="border-2 border-gray-200 rounded-lg"
                  />
                </div>

                {secretKey && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Secret Key (manual entry):</p>
                    <p className="text-sm font-mono text-gray-900 break-all">{secretKey}</p>
                  </div>
                )}

                <button
                  onClick={close2FAModal}
                  className="btn btn-primary w-full"
                >
                  Done
                </button>
              </div>
            ) : (
              // Show password form
              <form onSubmit={twoFactorEnabled ? handleDisable2FA : handleEnable2FA} className="space-y-4">
                <p className="text-gray-600 text-sm mb-4">
                  {twoFactorEnabled 
                    ? 'Enter your password to disable two-factor authentication.'
                    : 'Enter your password to enable two-factor authentication. You will need to scan a QR code with an authenticator app.'}
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={twoFAPassword}
                    onChange={(e) => setTwoFAPassword(e.target.value)}
                    required
                    className="input"
                    placeholder="Enter your password"
                  />
                </div>
                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    disabled={loading2FA}
                    className="btn btn-primary flex-1"
                  >
                    {loading2FA ? 'Processing...' : (twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA')}
                  </button>
                  <button
                    type="button"
                    onClick={close2FAModal}
                    disabled={loading2FA}
                    className="btn btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="card">
          <div className="flex items-center mb-4">
            <Bell className="h-5 w-5 text-primary-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Notification Preferences</h3>
          </div>
          <p className="text-gray-600 text-sm mb-4">
            Configure how you receive notifications for tasks, tickets, and updates.
          </p>
          <div className="space-y-3">
            <label className="flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="rounded" 
                checked={notificationPrefs.email_notifications}
                onChange={(e) => setNotificationPrefs({
                  ...notificationPrefs,
                  email_notifications: e.target.checked
                })}
              />
              <span className="ml-2 text-sm text-gray-700">Email notifications</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="rounded" 
                checked={notificationPrefs.in_app_notifications}
                onChange={(e) => setNotificationPrefs({
                  ...notificationPrefs,
                  in_app_notifications: e.target.checked
                })}
              />
              <span className="ml-2 text-sm text-gray-700">In-app notifications</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="rounded" 
                checked={notificationPrefs.task_assignment_alerts}
                onChange={(e) => setNotificationPrefs({
                  ...notificationPrefs,
                  task_assignment_alerts: e.target.checked
                })}
              />
              <span className="ml-2 text-sm text-gray-700">Task assignment alerts</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="rounded" 
                checked={notificationPrefs.ticket_updates}
                onChange={(e) => setNotificationPrefs({
                  ...notificationPrefs,
                  ticket_updates: e.target.checked
                })}
              />
              <span className="ml-2 text-sm text-gray-700">Ticket updates</span>
            </label>
          </div>
          <button 
            onClick={handleSaveNotificationPreferences}
            disabled={savingPreferences}
            className="btn btn-primary mt-4"
          >
            {savingPreferences ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      )}
    </div>
  )
}

export default Settings
