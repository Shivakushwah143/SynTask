import { useState } from 'react'
import { 
  Bell, 
  Inbox, 
  Lock, 
  Mail, 
  Shield, 
  User,
  LayoutDashboard,
  Settings as SettingsIcon,
  Key,
  BellRing,
  MailCheck,
  UserCog,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Save,
  Eye,
  EyeOff,
  Copy,
  Check,
  X,
  ArrowRight,
  Crown,
  Star,
  Sparkles,
  Zap,
  Clock,
  Calendar,
  Database,
  Server,
  Globe,
  Smartphone
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../api/auth'
import toast from 'react-hot-toast'
import { Badge, Button, FormField, PageHeader, PasswordInput, inputClassName } from '../components/ui'

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
// TAB BUTTON COMPONENT
// ============================================================
const TabButton = ({ id, label, icon: Icon, active, onClick }) => (
  <button
    onClick={() => onClick(id)}
    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
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

// ============================================================
// MAIN COMPONENT
// ============================================================
const Settings = () => {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('profile')
  const [changingPassword, setChangingPassword] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [savingMailSync, setSavingMailSync] = useState(false)
  const [notificationPrefs, setNotificationPrefs] = useState({
    email_notifications: user?.notification_preferences?.email_notifications ?? true,
    in_app_notifications: user?.notification_preferences?.in_app_notifications ?? true,
    task_assignment_alerts: user?.notification_preferences?.task_assignment_alerts ?? true,
    ticket_updates: user?.notification_preferences?.ticket_updates ?? true,
  })
  const [mailSync, setMailSync] = useState(() => readMailSync())

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

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    ...(user?.role === 'manager' ? [] : [{ id: 'mail-sync', label: 'Mail Sync', icon: Inbox }]),
  ]

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
                <SettingsIcon className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Settings</h1>
                <p className="mt-1 text-indigo-100">
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
      <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
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
            description="View your account details"
          />
          <div className="p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <ReadOnly label="First Name" value={user?.first_name} />
              <ReadOnly label="Last Name" value={user?.last_name} />
              <ReadOnly label="Email" value={user?.email} />
              <ReadOnly label="Role" value={user?.role?.replace('_', ' ').toUpperCase()} />
              <ReadOnly label="Company" value={user?.company_name || 'Not assigned'} />
              <ReadOnly label="Account Status" value={user?.is_active ? 'Active' : 'Inactive'} />
            </div>
          </div>
        </SettingsCard>
      )}

      {/* ============================================================ */}
      {/* SECURITY TAB */}
      {/* ============================================================ */}
      {activeTab === 'security' && (
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Change Password */}
          <SettingsCard>
            <SectionHeader 
              icon={Key}
              title="Change Password"
              description="Update your account password"
            />
            <div className="p-4">
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
            <div className="p-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
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
          <div className="p-4">
            <div className="space-y-4">
              {Object.entries(notificationPrefs).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0 last:pb-0 dark:border-gray-700">
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
          <div className="p-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
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

            <form onSubmit={handleSaveMailSync} className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
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