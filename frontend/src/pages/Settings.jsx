import { useEffect, useMemo, useRef, useState } from 'react'
import { 
  Bell, 
  Inbox, 
  Lock, 
  Mail, 
  Shield, 
  User,
  Settings as SettingsIcon,
  Key,
  BellRing,
  MailCheck,
  UserCog,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Save,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../api/auth'
import { timeService } from '@/services/timeService'
import { aiAPI } from '../api/ai'
import toast from 'react-hot-toast'
import { Badge, Button, FormField, inputClassName } from '../components/ui'

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
// TAB BUTTON COMPONENT
// ============================================================
const TabButton = ({ id, label, icon: Icon, active, onClick }) => (
  <button
    onClick={() => onClick(id)}
    className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-all ${
      active 
        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg' 
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
)

// ============================================================
// READ ONLY FIELD COMPONENT
// ============================================================
const ReadOnly = ({ label, value }) => (
  <div className="space-y-1">
    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
    <input 
      value={value || ''} 
      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white cursor-not-allowed opacity-75" 
      disabled 
    />
  </div>
)

// ============================================================
// PASSWORD FIELD COMPONENT
// ============================================================
const PasswordField = ({ label, name, required, minLength, value, onChange, placeholder }) => {
  const [show, setShow] = useState(false)
  
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          name={name}
          required={required}
          minLength={minLength}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 pr-10 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// TOGGLE SWITCH COMPONENT
// ============================================================
const ToggleSwitch = ({ id, checked, onChange, label }) => (
  <div className="flex items-center gap-3">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
    <label htmlFor={`notification-${id}`} className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer capitalize">
      {label}
    </label>
  </div>
)

// ============================================================
// SETTINGS CARD COMPONENT
// ============================================================
const SettingsCard = ({ children, className = '' }) => (
  <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}>
    {children}
  </div>
)

const getInitials = (user) => `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}` || 'U'

// ============================================================
// MAIN COMPONENT
// ============================================================
const Settings = () => {
  const { user, updateUser } = useAuthStore()
  const [activeTab, setActiveTab] = useState('profile')
  const fileInputRef = useRef(null)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarVersion, setAvatarVersion] = useState(user?.avatar_version || '')
  const [avatarRemoved, setAvatarRemoved] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [savingMailSync, setSavingMailSync] = useState(false)
  const [aiMemory, setAiMemory] = useState({ enabled: true, memories: [], policy: {} })
  const [aiMemoryDraft, setAiMemoryDraft] = useState({ title: '', content: '', preference_key: 'response_detail' })
  const [loadingAiMemory, setLoadingAiMemory] = useState(false)
  const [savingAiMemory, setSavingAiMemory] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [notificationPrefs, setNotificationPrefs] = useState({
    email_notifications: user?.notification_preferences?.email_notifications ?? true,
    in_app_notifications: user?.notification_preferences?.in_app_notifications ?? true,
    task_assignment_alerts: user?.notification_preferences?.task_assignment_alerts ?? true,
    ticket_updates: user?.notification_preferences?.ticket_updates ?? true,
  })
  const [mailSync, setMailSync] = useState(() => readMailSync())
  
  // FIXED: Get API URL from import.meta.env instead of process.env
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
  
  // FIXED: Better avatar URL construction with cache busting
  const currentAvatarUrl = useMemo(() => {
    if (!user?.avatar) return null;
    
    // If avatar is already a full URL
    if (user.avatar.startsWith('http://') || user.avatar.startsWith('https://')) {
      const version = avatarVersion || user.avatar_version || timeService.nowMs();
      return `${user.avatar}${user.avatar.includes('?') ? '&' : '?'}v=${version}`;
    }
    
    // If it's a relative path
    const cleanAvatar = user.avatar.startsWith('/') ? user.avatar : `/${user.avatar}`;
    const version = avatarVersion || user.avatar_version || timeService.nowMs();
    return `${API_URL}${cleanAvatar}?v=${version}`;
  }, [user?.avatar, avatarVersion, user?.avatar_version, API_URL]);

  // FIXED: Display logic with proper fallback
  const displayedAvatar = useMemo(() => {
    if (avatarPreview) return avatarPreview;
    if (avatarRemoved) return null;
    if (imageError) return null;
    return currentAvatarUrl;
  }, [avatarPreview, avatarRemoved, currentAvatarUrl, imageError]);

  const profileChanged = Boolean(avatarFile || avatarRemoved)

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  // Reset image error when avatar changes
  useEffect(() => {
    setImageError(false)
  }, [currentAvatarUrl, avatarPreview])

  // Debug logging
  useEffect(() => {
    console.log('🔍 Debug - Avatar State:', {
      userAvatar: user?.avatar,
      currentAvatarUrl,
      displayedAvatar,
      avatarVersion,
      avatarPreview,
      avatarRemoved,
      imageError,
      API_URL
    })
  }, [user?.avatar, currentAvatarUrl, displayedAvatar, avatarVersion, avatarPreview, avatarRemoved, imageError, API_URL])

  const resetProfileDraft = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(null)
    setAvatarPreview('')
    setAvatarRemoved(false)
    setImageError(false)
  }

  const handleChangePhoto = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Use PNG, JPG, JPEG, or WEBP image')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo must be 5 MB or smaller')
      return
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setAvatarRemoved(false)
    setImageError(false)
  }

  const handleRemovePhoto = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(null)
    setAvatarPreview('')
    setAvatarRemoved(true)
    setImageError(false)
  }

  // FIXED: Improved profile save handler
  const handleSaveProfile = async () => {
    if (!profileChanged) return;
    
    try {
      setSavingProfile(true);
      
      // Handle avatar removal
      if (avatarRemoved && user?.avatar) {
        await authAPI.deleteAvatar();
        const nextVersion = String(timeService.nowMs());
        setAvatarVersion(nextVersion);
        const updatedUser = { 
          ...user, 
          avatar: null, 
          avatar_version: nextVersion 
        };
        updateUser(updatedUser);
        setAvatarRemoved(false);
        toast.success('Profile photo removed successfully');
        return;
      }
      
      // Handle avatar upload
      if (avatarFile) {
        const response = await authAPI.uploadAvatar(avatarFile);
        console.log('📤 Upload response:', response);
        
        // Handle different response formats
        let avatarUrl = response.avatar_url || response.url || response.data?.avatar_url || response.file_url;
        
        if (!avatarUrl) {
          throw new Error('No avatar URL returned from server');
        }
        
        // Ensure URL is absolute if it's relative
        if (!avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://')) {
          avatarUrl = avatarUrl.startsWith('/') ? `${API_URL}${avatarUrl}` : `${API_URL}/${avatarUrl}`;
        }
        
        const nextVersion = String(timeService.nowMs());
        setAvatarVersion(nextVersion);
        
        const updatedUser = { 
          ...user, 
          avatar: avatarUrl, 
          avatar_version: nextVersion 
        };
        updateUser(updatedUser);
        
        // Clear the preview
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarFile(null);
        setAvatarPreview('');
        setImageError(false);
        
        toast.success('Profile photo updated successfully!');
      }
      
    } catch (error) {
      console.error('❌ Profile update error:', error);
      toast.error(error.response?.data?.detail || error.message || 'Failed to save profile changes');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.target)
    const oldPassword = formData.get('old_password')
    const newPassword = formData.get('new_password')
    const confirmPassword = formData.get('confirm_password')

    if (!oldPassword) return toast.error('Current password is required')
    if (!newPassword || !confirmPassword) return toast.error('Please fill in all fields')
    if (newPassword !== confirmPassword) return toast.error('New passwords do not match')

    try {
      setChangingPassword(true)
      await authAPI.changePassword(oldPassword, newPassword)
      toast.success('Password changed successfully! 🔐')
      e.target.reset()
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleSaveNotificationPreferences = async () => {
    try {
      setSavingPreferences(true)
      await authAPI.updateNotificationPreferences(notificationPrefs)
      toast.success('Notification preferences saved successfully! 🔔')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save notification preferences')
    } finally {
      setSavingPreferences(false)
    }
  }

  const handleSaveMailSync = async (e) => {
    e.preventDefault()
    try {
      setSavingMailSync(true)
      saveMailSync(mailSync)
      toast.success('Mail sync settings saved locally! 📧')
    } finally {
      setSavingMailSync(false)
    }
  }

  const handleResetMailSync = () => {
    const next = DEFAULT_MAIL_SYNC
    setMailSync(next)
    saveMailSync(next)
    toast.success('Mail sync settings reset')
  }

  const loadAiMemory = async () => {
    try {
      setLoadingAiMemory(true)
      setAiMemory(await aiAPI.listPersonalMemory())
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load AI memory')
    } finally {
      setLoadingAiMemory(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'ai-memory') void loadAiMemory()
  }, [activeTab])

  const saveAiPreference = async (event) => {
    event.preventDefault()
    try {
      setSavingAiMemory(true)
      await aiAPI.savePersonalPreference(aiMemoryDraft)
      setAiMemoryDraft({ title: '', content: '', preference_key: 'response_detail' })
      await loadAiMemory()
      toast.success('AI memory saved')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to save AI memory')
    } finally {
      setSavingAiMemory(false)
    }
  }

  const toggleAiMemory = async (enabled) => {
    try {
      await aiAPI.updatePersonalMemorySettings(enabled)
      await loadAiMemory()
      toast.success(enabled ? 'AI memory enabled' : 'AI memory disabled')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to update AI memory')
    }
  }

  const deleteAiMemory = async (memoryId) => {
    try {
      await aiAPI.deletePersonalMemory(memoryId)
      await loadAiMemory()
      toast.success('AI memory deleted')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to delete AI memory')
    }
  }

  const clearAiMemory = async () => {
    try {
      await aiAPI.clearPersonalMemory()
      await loadAiMemory()
      toast.success('AI memory cleared')
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to clear AI memory')
    }
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'ai-memory', label: 'AI Memory', icon: Sparkles },
    ...(user?.role === 'manager' ? [] : [{ id: 'mail-sync', label: 'Mail Sync', icon: Inbox }]),
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-stone-600 via-amber-600 to-orange-600 p-4 text-white shadow-xl md:p-5">
        {/* Decorative blur circles */}
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm">
                <SettingsIcon className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold md:text-2xl">Settings</h1>
                <p className="mt-0.5 text-indigo-100">
                  Account, security, and notification preferences.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <Shield className="h-3.5 w-3.5" />
                Profile locked
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* TABS */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap gap-1">
          {tabs.map((tab) => (
            <TabButton
              key={tab.id}
              id={tab.id}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              onClick={setActiveTab}
            />
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* PROFILE TAB */}
      {/* ============================================================ */}
      {activeTab === 'profile' && (
        <SettingsCard>
          <SectionHeader 
            icon={UserCog}
            title="Profile Information"
            description="Manage your profile photo and view account details"
          />
          <div className="space-y-4 p-3">
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 dark:border-indigo-900/50 dark:from-indigo-950/20 dark:to-gray-900/30">
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                <div className="relative">
                  {displayedAvatar ? (
                    <img
                      src={displayedAvatar}
                      alt={`${user?.first_name || 'User'} profile`}
                      className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-xl shadow-indigo-500/15 dark:border-gray-800"
                      onError={() => {
                        console.error('❌ Image failed to load:', displayedAvatar);
                        setImageError(true);
                      }}
                      onLoad={() => {
                        console.log('✅ Image loaded successfully:', displayedAvatar);
                        setImageError(false);
                      }}
                    />
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-2xl font-bold text-white shadow-xl shadow-indigo-500/15 dark:border-gray-800">
                      {getInitials(user)}
                    </div>
                  )}
                  {avatarFile ? (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                      Preview
                    </span>
                  ) : null}
                  {imageError && !avatarPreview && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                      Load Error
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-bold text-gray-950 dark:text-white">
                    {user?.first_name} {user?.last_name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    Profile photo updates after Save Changes. Files accepted: PNG, JPG, JPEG, WEBP up to 5 MB.
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    className="sr-only"
                    onChange={handleChangePhoto}
                  />
                  <div className="mt-4 flex flex-wrap justify-center gap-3 sm:justify-start">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/20"
                    >
                      Change Photo
                    </button>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      disabled={!displayedAvatar && !user?.avatar}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/50 dark:bg-gray-900 dark:text-rose-300 dark:hover:bg-rose-950/20"
                    >
                      Remove Photo
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Account fields</h3>
                <Badge label="Read-only" colorKey="scheduled" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ReadOnly label="First Name" value={user?.first_name} />
                <ReadOnly label="Last Name" value={user?.last_name} />
                <ReadOnly label="Email" value={user?.email} />
                <ReadOnly label="Role" value={user?.role?.replace('_', ' ').toUpperCase()} />
                <ReadOnly label="Company" value={user?.company_name || 'Not assigned'} />
                <ReadOnly label="Account Status" value={user?.is_active ? 'Active' : 'Inactive'} />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-3 sm:flex-row sm:justify-end dark:border-gray-700">
              <button
                type="button"
                onClick={resetProfileDraft}
                disabled={!profileChanged || savingProfile}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <Button
                type="button"
                onClick={handleSaveProfile}
                disabled={!profileChanged}
                loading={savingProfile}
                className="min-h-10"
              >
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </div>
        </SettingsCard>
      )}

      {/* ============================================================ */}
      {/* SECURITY TAB */}
      {/* ============================================================ */}
      {activeTab === 'security' && (
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Change Password */}
          <SettingsCard>
            <SectionHeader 
              icon={Key}
              title="Change Password"
              description="Update your account password"
            />
            <div className="p-3">
              <form onSubmit={handleChangePassword} className="space-y-4">
                <PasswordField 
                  label="Current Password" 
                  name="old_password" 
                  required 
                  placeholder="Enter your current password"
                />
                <PasswordField 
                  label="New Password" 
                  name="new_password" 
                  required 
                  minLength={8}
                  placeholder="Enter your new password"
                />
                <PasswordField 
                  label="Confirm New Password" 
                  name="confirm_password" 
                  required 
                  minLength={8}
                  placeholder="Confirm your new password"
                />
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
                >
                  {changingPassword ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Changing...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      Change Password
                    </>
                  )}
                </button>
              </form>
            </div>
          </SettingsCard>

          {/* Two-Factor Authentication */}
          <SettingsCard>
            <SectionHeader 
              icon={ShieldCheck}
              title="Two-Factor Authentication"
              description="Add an extra layer of security"
            />
            <div className="p-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">2FA Management</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Two-factor management remains available through the existing account flow.
                    </p>
                    <button className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                      <Shield className="h-4 w-4" />
                      Configure 2FA
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </SettingsCard>
        </div>
      )}

      {/* ============================================================ */}
      {/* NOTIFICATIONS TAB */}
      {/* ============================================================ */}
      {activeTab === 'notifications' && (
        <SettingsCard>
          <SectionHeader 
            icon={BellRing}
            title="Notification Preferences"
            description="Choose what notifications you want to receive"
            action={
              <button
                onClick={handleSaveNotificationPreferences}
                disabled={savingPreferences}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
              >
                {savingPreferences ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Preferences
                  </>
                )}
              </button>
            }
          />
          <div className="p-3">
            <div className="space-y-3">
              {Object.entries(notificationPrefs).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0 last:pb-0 dark:border-gray-700">
                  <ToggleSwitch
                    id={key}
                    checked={value}
                    onChange={(newValue) => setNotificationPrefs((current) => ({ ...current, [key]: newValue }))}
                    label={key.replaceAll('_', ' ')}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div className="flex items-start gap-2">
                <MailCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Email notifications are sent to your registered email address.
                </p>
              </div>
            </div>
          </div>
        </SettingsCard>
      )}

      {activeTab === 'ai-memory' && (
        <SettingsCard>
          <SectionHeader
            icon={Sparkles}
            title="AI Memory"
            description="Control saved professional preferences used by SynTask AI"
            action={
              <button
                type="button"
                onClick={() => toggleAiMemory(!aiMemory.enabled)}
                className={`inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition ${aiMemory.enabled ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-600 hover:bg-gray-700'}`}
              >
                {aiMemory.enabled ? 'Disable Memory' : 'Enable Memory'}
              </button>
            }
          />
          <div className="space-y-4 p-3">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
              Conversation memory is short-lived session context. Saved personal memory is user-controlled preference data such as language, response detail, tone, and report layout. It cannot change permissions, facts, approvals, or safety policy.
            </div>

            <form onSubmit={saveAiPreference} className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40 md:grid-cols-[0.8fr_0.8fr_1.4fr_auto]">
              <label className="space-y-1">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Preference</span>
                <select
                  className={inputClassName}
                  value={aiMemoryDraft.preference_key}
                  onChange={(event) => setAiMemoryDraft((current) => ({ ...current, preference_key: event.target.value }))}
                  disabled={!aiMemory.enabled || savingAiMemory}
                >
                  <option value="response_detail">Response detail</option>
                  <option value="language">Language</option>
                  <option value="draft_tone">Draft tone</option>
                  <option value="report_layout">Report layout</option>
                </select>
              </label>
              <FormField label="Title">
                <input
                  className={inputClassName}
                  value={aiMemoryDraft.title}
                  onChange={(event) => setAiMemoryDraft((current) => ({ ...current, title: event.target.value }))}
                  disabled={!aiMemory.enabled || savingAiMemory}
                  placeholder="Concise replies"
                />
              </FormField>
              <FormField label="Memory">
                <input
                  className={inputClassName}
                  value={aiMemoryDraft.content}
                  onChange={(event) => setAiMemoryDraft((current) => ({ ...current, content: event.target.value }))}
                  disabled={!aiMemory.enabled || savingAiMemory}
                  placeholder="Use short summaries with action bullets"
                />
              </FormField>
              <Button type="submit" loading={savingAiMemory} disabled={!aiMemory.enabled || !aiMemoryDraft.title.trim() || !aiMemoryDraft.content.trim()} className="self-end">
                <Save className="h-4 w-4" />
                Save
              </Button>
            </form>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Remembered preferences</h3>
              <button type="button" onClick={clearAiMemory} disabled={!aiMemory.memories?.length} className="min-h-10 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-300">
                Clear All
              </button>
            </div>

            {loadingAiMemory ? (
              <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">Loading AI memory...</div>
            ) : aiMemory.memories?.length ? (
              <div className="space-y-3">
                {aiMemory.memories.map((memory) => (
                  <div key={memory.memory_id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900 dark:text-white">{memory.title}</p>
                        <Badge label={memory.preference_key || memory.memory_type} colorKey="scheduled" />
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{memory.content}</p>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Source: {memory.source_type}</p>
                    </div>
                    <button type="button" onClick={() => deleteAiMemory(memory.memory_id)} className="min-h-10 rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-300">
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
                No saved AI preferences.
              </div>
            )}
          </div>
        </SettingsCard>
      )}

      {/* ============================================================ */}
      {/* MAIL SYNC TAB */}
      {/* ============================================================ */}
      {activeTab === 'mail-sync' && user?.role !== 'manager' && (
        <SettingsCard>
          <SectionHeader 
            icon={Mail}
            title="Mail Sync Settings"
            description="Configure IMAP settings for email synchronization"
          />
          <div className="p-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Local Storage Only</p>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    Store your HR mailbox values here for later changes. These values are saved in your browser and should be copied into backend `.env` for the live IMAP sync.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveMailSync} className="mt-3 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">IMAP Enabled</label>
                  <select
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    value={mailSync.enabled ? 'true' : 'false'}
                    onChange={(e) => setMailSync((current) => ({ ...current, enabled: e.target.value === 'true' }))}
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">IMAP Host</label>
                  <input 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white" 
                    value={mailSync.host} 
                    onChange={(e) => setMailSync((current) => ({ ...current, host: e.target.value }))} 
                    placeholder="imap.gmail.com" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">IMAP Port</label>
                  <input 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white" 
                    value={mailSync.port} 
                    onChange={(e) => setMailSync((current) => ({ ...current, port: e.target.value }))} 
                    placeholder="993" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Use SSL</label>
                  <select
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    value={mailSync.ssl ? 'true' : 'false'}
                    onChange={(e) => setMailSync((current) => ({ ...current, ssl: e.target.value === 'true' }))}
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">IMAP Username</label>
                  <input 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white" 
                    value={mailSync.username} 
                    onChange={(e) => setMailSync((current) => ({ ...current, username: e.target.value }))} 
                    placeholder="hr@company.com" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">IMAP Password</label>
                  <PasswordField
                    name="imap_password"
                    value={mailSync.password}
                    onChange={(e) => setMailSync((current) => ({ ...current, password: e.target.value }))}
                    placeholder="App password"
                    label=""
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Mailbox Folder</label>
                  <input 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white" 
                    value={mailSync.folder} 
                    onChange={(e) => setMailSync((current) => ({ ...current, folder: e.target.value }))} 
                    placeholder="INBOX" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Target Company Email</label>
                  <input 
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white" 
                    value={mailSync.targetCompanyEmail} 
                    onChange={(e) => setMailSync((current) => ({ ...current, targetCompanyEmail: e.target.value }))} 
                    placeholder="careers@company.com" 
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingMailSync}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
                >
                  {savingMailSync ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Mail Sync
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleResetMailSync}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reset
                </button>
              </div>
            </form>
          </div>
        </SettingsCard>
      )}
    </div>
  )
}

const MAIL_SYNC_STORAGE_KEY = 'sytask-mail-sync'

const DEFAULT_MAIL_SYNC = {
  enabled: true,
  host: 'imap.gmail.com',
  port: '993',
  ssl: true,
  username: '',
  password: '',
  folder: 'INBOX',
  targetCompanyEmail: '',
}

function readMailSync() {
  if (typeof window === 'undefined') return DEFAULT_MAIL_SYNC
  try {
    const raw = window.localStorage.getItem(MAIL_SYNC_STORAGE_KEY)
    if (!raw) return DEFAULT_MAIL_SYNC
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_MAIL_SYNC, ...parsed }
  } catch {
    return DEFAULT_MAIL_SYNC
  }
}

function saveMailSync(value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(MAIL_SYNC_STORAGE_KEY, JSON.stringify(value))
}

export default Settings
