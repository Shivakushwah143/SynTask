import { useState } from 'react'
import { Bell, Inbox, Lock, Mail, Shield, User } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../api/auth'
import toast from 'react-hot-toast'
import { Badge, Button, FormField, PageHeader, inputClassName } from '../components/ui'

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
    if (!oldPassword || !newPassword) return toast.error('Please fill in all fields')
    try {
      setChangingPassword(true)
      await authAPI.changePassword(oldPassword, newPassword)
      toast.success('Password changed successfully')
      e.target.reset()
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleSaveNotificationPreferences = async () => {
    try {
      setSavingPreferences(true)
      await authAPI.updateNotificationPreferences(notificationPrefs)
      toast.success('Notification preferences saved successfully')
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
      toast.success('Mail sync settings saved locally')
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Account, security, and notification preferences."
        actions={<Badge label="Profile locked" colorKey="scheduled" />}
      />

      <div className="card p-2">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'profile', label: 'Profile', icon: User },
            { id: 'security', label: 'Security', icon: Lock },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'mail-sync', label: 'Mail Sync', icon: Inbox },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-label={`${tab.label} settings`}
                className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium transition ${activeTab === tab.id ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}
              >
                <Icon className="mr-2 h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {activeTab === 'profile' && (
        <section className="card p-5">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Profile Information</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <ReadOnly label="First Name" value={user?.first_name} />
            <ReadOnly label="Last Name" value={user?.last_name} />
            <ReadOnly label="Email" value={user?.email} />
            <ReadOnly label="Role" value={user?.role?.replace('_', ' ').toUpperCase()} />
          </div>
        </section>
      )}

      {activeTab === 'security' && (
        <div className="grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Change Password</h3>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-4">
              <FormField label="Current Password" required>
                <input type="password" name="old_password" required className={inputClassName} />
              </FormField>
              <FormField label="New Password" required>
                <input type="password" name="new_password" required minLength={8} className={inputClassName} />
              </FormField>
              <Button type="submit" loading={changingPassword}>Change Password</Button>
            </form>
          </section>

          <section className="card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Two-Factor Authentication</h3>
            </div>
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">Two-factor management remains available through the existing account flow.</p>
          </section>
        </div>
      )}

      {activeTab === 'notifications' && (
        <section className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Notification Preferences</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(notificationPrefs).map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`notification-${key}`}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={value}
                  onChange={(e) => setNotificationPrefs((current) => ({ ...current, [key]: e.target.checked }))}
                />
                <label htmlFor={`notification-${key}`} className="text-sm text-gray-700 dark:text-gray-300 capitalize cursor-pointer">
                  {key.replaceAll('_', ' ')}
                </label>
              </div>
            ))}
          </div>
          <Button className="mt-4" onClick={handleSaveNotificationPreferences} loading={savingPreferences}>Save Preferences</Button>
        </section>
      )}

      {activeTab === 'mail-sync' && (
        <section className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Mail Sync Settings</h3>
          </div>
          <p className="mb-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
            Store your HR mailbox values here for later changes. These values are saved in your browser and should be copied into backend `.env` for the live IMAP sync.
          </p>
          <form onSubmit={handleSaveMailSync} className="grid gap-4 md:grid-cols-2">
            <FormField label="IMAP Enabled">
              <select
                className={inputClassName}
                value={mailSync.enabled ? 'true' : 'false'}
                onChange={(e) => setMailSync((current) => ({ ...current, enabled: e.target.value === 'true' }))}
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </FormField>
            <FormField label="IMAP Host">
              <input className={inputClassName} value={mailSync.host} onChange={(e) => setMailSync((current) => ({ ...current, host: e.target.value }))} placeholder="imap.gmail.com" />
            </FormField>
            <FormField label="IMAP Port">
              <input className={inputClassName} value={mailSync.port} onChange={(e) => setMailSync((current) => ({ ...current, port: e.target.value }))} placeholder="993" />
            </FormField>
            <FormField label="Use SSL">
              <select
                className={inputClassName}
                value={mailSync.ssl ? 'true' : 'false'}
                onChange={(e) => setMailSync((current) => ({ ...current, ssl: e.target.value === 'true' }))}
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </FormField>
            <FormField label="IMAP Username">
              <input className={inputClassName} value={mailSync.username} onChange={(e) => setMailSync((current) => ({ ...current, username: e.target.value }))} placeholder="hr@company.com" />
            </FormField>
            <FormField label="IMAP Password">
              <input className={inputClassName} type="password" value={mailSync.password} onChange={(e) => setMailSync((current) => ({ ...current, password: e.target.value }))} placeholder="App password" />
            </FormField>
            <FormField label="Mailbox Folder">
              <input className={inputClassName} value={mailSync.folder} onChange={(e) => setMailSync((current) => ({ ...current, folder: e.target.value }))} placeholder="INBOX" />
            </FormField>
            <FormField label="Target Company Email">
              <input className={inputClassName} value={mailSync.targetCompanyEmail} onChange={(e) => setMailSync((current) => ({ ...current, targetCompanyEmail: e.target.value }))} placeholder="careers@company.com" />
            </FormField>
            <div className="md:col-span-2 flex flex-wrap gap-3 pt-2">
              <Button type="submit" loading={savingMailSync}>Save Mail Sync</Button>
              <Button type="button" variant="secondary" onClick={handleResetMailSync}>Reset</Button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}

function ReadOnly({ label, value }) {
  return (
    <FormField label={label}>
      <input value={value || ''} className={inputClassName} disabled />
    </FormField>
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
