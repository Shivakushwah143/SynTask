import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { LayoutTemplate, Plus, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { extractErrorMessage } from '../api/axios'
import { contentProductionApi } from '../api/contentProduction'
import { Button, FormField, Modal } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { hasCapability } from '../utils/rbac'

const CONTENT_TYPES = ['reel', 'static_post', 'carousel', 'story', 'blog', 'youtube', 'email_campaign', 'shoot_day', 'custom']
const PLATFORMS = ['Instagram', 'YouTube', 'LinkedIn', 'Facebook', 'Twitter/X', 'Pinterest', 'Email', 'Blog', 'Other']

const EMPTY_FORM = {
  name: '',
  description: '',
  content_type: 'custom',
  platform: 'Instagram',
  default_objective: '',
  default_target_audience: '',
  default_key_message: '',
  default_tone: '',
  default_cta: '',
}

function formatLabel(value) {
  return (value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function ContentTemplates() {
  const queryClient = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const can = (capability) => hasCapability(user, capability)
  const canManage = can('content.manage_templates')

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const { data, isLoading } = useQuery(
    ['content-templates'],
    () => contentProductionApi.getTemplates(),
    { staleTime: 60 * 1000 }
  )
  const templates = data?.data?.templates || []

  const saveMutation = useMutation(
    (payload) => (editing ? contentProductionApi.updateTemplate(editing.id, payload) : contentProductionApi.createTemplate(payload)),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['content-templates'])
        toast.success(editing ? 'Template updated' : 'Template created')
        setShowModal(false)
      },
      onError: (err) => toast.error(extractErrorMessage(err?.response?.data?.detail) || 'Failed to save template'),
    }
  )

  const deleteMutation = useMutation(
    (templateId) => contentProductionApi.deleteTemplate(templateId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['content-templates'])
        toast.success('Template deactivated')
      },
      onError: (err) => toast.error(extractErrorMessage(err?.response?.data?.detail) || 'Failed to delete template'),
    }
  )

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  const openEdit = (template) => {
    setEditing(template)
    setForm({
      name: template.name || '',
      description: template.description || '',
      content_type: template.content_type || 'custom',
      platform: template.platform || '',
      default_objective: template.default_objective || '',
      default_target_audience: template.default_target_audience || '',
      default_key_message: template.default_key_message || '',
      default_tone: template.default_tone || '',
      default_cta: template.default_cta || '',
    })
    setShowModal(true)
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('Template name is required')
      return
    }
    saveMutation.mutate(form)
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-pink-600 via-rose-600 to-fuchsia-600 p-3.5 text-white shadow-xl md:p-4">
        <div className="relative z-10 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm">
              <LayoutTemplate className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold md:text-2xl">Content Templates</h1>
              <p className="mt-0.5 text-xs text-pink-100">Reusable content structures — type, platform, brief defaults, and required assets</p>
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 self-start rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/30 md:self-center"
            >
              <Plus className="h-3.5 w-3.5" />
              New Template
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface-muted dark:bg-[var(--color-app-surface-muted)]" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-border bg-surface p-12 text-center dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]">
          <LayoutTemplate className="mx-auto h-12 w-12 text-pink-300 dark:text-pink-800" />
          <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No templates yet</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Templates pre-fill content type, platform, and brief defaults when creating content.
          </p>
          {canManage && (
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Template
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-surface-border bg-surface p-4 shadow-sm transition hover:border-primary-300 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">{t.name}</p>
                  {t.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{t.description}</p>
                  )}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      title="Edit template"
                      className="rounded p-1.5 text-gray-400 transition hover:bg-surface-muted hover:text-primary-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (window.confirm(`Deactivate template "${t.name}"?`)) deleteMutation.mutate(t.id) }}
                      title="Deactivate template"
                      className="rounded p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.content_type && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {formatLabel(t.content_type)}
                  </span>
                )}
                {t.platform && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {t.platform}
                  </span>
                )}
                {t.default_tone && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                    {t.default_tone}
                  </span>
                )}
              </div>
              {(t.default_assets_required || []).length > 0 && (
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                  Assets: {t.default_assets_required.join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Template' : 'New Template'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Name" required>
              <input
                type="text"
                className="input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Monthly Reel Brief"
                required
              />
            </FormField>
            <FormField label="Content Type">
              <select
                className="input"
                value={form.content_type}
                onChange={(e) => setForm((p) => ({ ...p, content_type: e.target.value }))}
              >
                {CONTENT_TYPES.map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}
              </select>
            </FormField>
            <FormField label="Platform">
              <select
                className="input"
                value={form.platform}
                onChange={(e) => setForm((p) => ({ ...p, platform: e.target.value }))}
              >
                <option value="">Any platform</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
            <FormField label="Default Tone">
              <input
                type="text"
                className="input"
                value={form.default_tone}
                onChange={(e) => setForm((p) => ({ ...p, default_tone: e.target.value }))}
                placeholder="e.g. Playful, professional…"
              />
            </FormField>
          </div>
          <FormField label="Description">
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="What is this template for?"
            />
          </FormField>
          <FormField label="Default Objective">
            <input
              type="text"
              className="input"
              value={form.default_objective}
              onChange={(e) => setForm((p) => ({ ...p, default_objective: e.target.value }))}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Default Target Audience">
              <input
                type="text"
                className="input"
                value={form.default_target_audience}
                onChange={(e) => setForm((p) => ({ ...p, default_target_audience: e.target.value }))}
              />
            </FormField>
            <FormField label="Default CTA">
              <input
                type="text"
                className="input"
                value={form.default_cta}
                onChange={(e) => setForm((p) => ({ ...p, default_cta: e.target.value }))}
              />
            </FormField>
          </div>
          <FormField label="Default Key Message">
            <textarea
              className="input"
              rows={2}
              value={form.default_key_message}
              onChange={(e) => setForm((p) => ({ ...p, default_key_message: e.target.value }))}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" disabled={saveMutation.isLoading}>
              {saveMutation.isLoading ? 'Saving…' : editing ? 'Save Changes' : 'Create Template'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
