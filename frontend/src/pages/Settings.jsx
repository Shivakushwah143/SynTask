import { useState } from 'react'
import { Bell, Lock, Shield, User } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../api/auth'
import toast from 'react-hot-toast'
import { Badge, Button, FormField, PageHeader, inputClassName } from '../components/ui'

const Settings = () => {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('profile')
  const [changingPassword, setChangingPassword] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [notificationPrefs, setNotificationPrefs] = useState({
    email_notifications: user?.notification_preferences?.email_notifications ?? true,
    in_app_notifications: user?.notification_preferences?.in_app_notifications ?? true,
    task_assignment_alerts: user?.notification_preferences?.task_assignment_alerts ?? true,
    ticket_updates: user?.notification_preferences?.ticket_updates ?? true,
  })

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
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
              <label key={key} className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" className="rounded border-gray-300" checked={value} onChange={(e) => setNotificationPrefs((current) => ({ ...current, [key]: e.target.checked }))} />
                <span className="capitalize">{key.replaceAll('_', ' ')}</span>
              </label>
            ))}
          </div>
          <Button className="mt-4" onClick={handleSaveNotificationPreferences} loading={savingPreferences}>Save Preferences</Button>
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

export default Settings
