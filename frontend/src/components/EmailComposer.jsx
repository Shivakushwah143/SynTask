import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { AlertCircle, Eye, Mail, Paperclip, Send, Sparkles, X, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { notificationsEmailApi } from '../api/notificationsEmail'
import { Badge, Button, Modal, inputClassName } from './ui'

const emptyRecipient = { email: '', name: '' }
const emptyState = {
  to: [{ ...emptyRecipient }],
  cc: [],
  bcc: [],
  subject: '',
  html: '',
  text: '',
  template_id: '',
  template_name: '',
  template_variables: {},
  related_entity_type: '',
  related_entity_id: '',
  related_module: '',
  attachments: [],
}

const normalizeRecipients = (items = []) => items.map((item) => ({
  email: item?.email || '',
  name: item?.name || '',
}))

const countRecipients = (items) => items.filter((item) => item?.email?.trim()).length

export function EmailComposer({ isOpen, onClose, initialData = {}, onSend }) {
  const [form, setForm] = useState(emptyState)
  const [preview, setPreview] = useState(null)
  const [activeTab, setActiveTab] = useState('write')
  const [loadingState, setLoadingState] = useState('idle')
  const [error, setError] = useState('')
  const [showCcBcc, setShowCcBcc] = useState(false)
  const { data: templatesResponse } = useQuery('notification-email-templates', notificationsEmailApi.templates, { enabled: isOpen })
  const templates = useMemo(() => templatesResponse?.data || templatesResponse || [], [templatesResponse])

  useEffect(() => {
    if (!isOpen) return
    setForm({
      ...emptyState,
      ...initialData,
      to: normalizeRecipients(initialData.to?.length ? initialData.to : [{ ...emptyRecipient }]),
      cc: normalizeRecipients(initialData.cc || []),
      bcc: normalizeRecipients(initialData.bcc || []),
    })
    setPreview(null)
    setError('')
    setLoadingState('idle')
    setActiveTab('write')
    setShowCcBcc(false)
  }, [initialData, isOpen])

  const updateRecipient = (group, index, field, value) => {
    setForm((current) => {
      const next = [...current[group]]
      next[index] = { ...next[index], [field]: value }
      return { ...current, [group]: next }
    })
  }

  const addRecipient = (group) => {
    setForm((current) => ({ ...current, [group]: [...current[group], { ...emptyRecipient }] }))
  }

  const removeRecipient = (group, index) => {
    setForm((current) => {
      const next = current[group].filter((_, itemIndex) => itemIndex !== index)
      return { ...current, [group]: next.length ? next : group === 'to' ? [{ ...emptyRecipient }] : [] }
    })
  }

  const applyTemplate = (templateId) => {
    const template = templates.find((item) => item.id === templateId)
    if (!template) return
    setForm((current) => ({
      ...current,
      template_id: template.id,
      template_name: template.name,
      subject: template.subject || current.subject,
      html: template.body_html || template.preview_html || current.html,
      text: template.body_text || current.text,
    }))
  }

  const validate = () => {
    const primary = form.to.find((item) => item.email?.trim())
    if (!primary?.email) return 'Add at least one recipient.'
    if (!form.subject.trim()) return 'Subject is required.'
    if (!form.html.trim() && !form.text.trim()) return 'Email body is required.'
    return ''
  }

  const previewEmail = async () => {
    setError('')
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      toast.error(validationError)
      return
    }
    try {
      setLoadingState('previewing')
      const response = await notificationsEmailApi.preview(form)
      const data = response?.data || response
      setPreview(data)
      setActiveTab('preview')
      toast.success('Preview updated')
    } catch (err) {
      const message = err?.response?.data?.detail || 'Unable to generate preview'
      setError(message)
      toast.error(message)
    } finally {
      setLoadingState('idle')
    }
  }

  const sendEmail = async () => {
    setError('')
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      toast.error(validationError)
      return
    }
    try {
      setLoadingState('sending')
      const response = await notificationsEmailApi.send(form)
      await onSend?.(response?.data || response, form)
      toast.success('Email sent')
      onClose?.()
    } catch (err) {
      const message = err?.response?.data?.detail || 'Email send failed'
      setError(message)
      toast.error(message)
    } finally {
      setLoadingState('idle')
    }
  }

  const summary = {
    to: countRecipients(form.to),
    cc: countRecipients(form.cc),
    bcc: countRecipients(form.bcc),
  }

  const currentPreview = preview || {
    subject: form.subject,
    html: form.html,
    text: form.text,
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Email Composer"
      description="Compose, preview, and send without leaving the current record."
      size="xl"
      bodyClassName="!p-4 sm:!p-5"
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-500 dark:text-gray-400">Ctrl/Cmd + Enter to send. Esc closes the composer.</div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={previewEmail} loading={loadingState === 'previewing'} loadingText="Previewing">
              <Eye className="h-4 w-4" />
              Preview
            </Button>
            <Button type="button" variant="primary" onClick={sendEmail} loading={loadingState === 'sending'} loadingText="Sending" disabled={loadingState === 'previewing'}>
              <Send className="h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      )}
    >
      <div className="flex h-full flex-col gap-4 bg-gradient-to-br from-emerald-50/70 via-white to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-900">
        <div className="rounded-3xl border border-emerald-100 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Compose email</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Draft, preview, and send through the Notification API.</p>
              </div>
            </div>
            <Badge label={loadingState === 'sending' ? 'Sending' : loadingState === 'previewing' ? 'Previewing' : 'Draft'} colorKey={loadingState === 'sending' ? 'critical' : 'draft'} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setActiveTab('write')} className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === 'write' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'}`}>Write</button>
            <button type="button" onClick={() => setActiveTab('preview')} className={`rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === 'preview' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'}`}>Preview</button>
            <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
              <Badge label={`To ${summary.to}`} colorKey="draft" />
              <Badge label={`CC ${summary.cc}`} colorKey="draft" />
              <Badge label={`BCC ${summary.bcc}`} colorKey="draft" />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-surface-border/80 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Templates</span>
            <select className={`${inputClassName} ml-auto max-w-xs`} value={form.template_id} onChange={(event) => applyTemplate(event.target.value)}>
              <option value="">Choose template</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {templates.slice(0, 5).map((template) => (
              <button
                type="button"
                key={template.id}
                onClick={() => applyTemplate(template.id)}
                className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          <RecipientBlock label="To" group="to" form={form} onAdd={addRecipient} onRemove={removeRecipient} onChange={updateRecipient} required />

          <div className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setShowCcBcc((current) => !current)}>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <ChevronDown className={`h-4 w-4 transition-transform ${showCcBcc ? 'rotate-180' : ''}`} />
                CC and BCC
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">{showCcBcc ? 'Hide' : 'Show'}</span>
            </button>
            {showCcBcc ? (
              <div className="mt-4 space-y-4">
                <RecipientBlock label="CC" group="cc" form={form} onAdd={addRecipient} onRemove={removeRecipient} onChange={updateRecipient} />
                <RecipientBlock label="BCC" group="bcc" form={form} onAdd={addRecipient} onRemove={removeRecipient} onChange={updateRecipient} />
              </div>
            ) : null}
          </div>

          <label className="block rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Subject</span>
            <input className={inputClassName} value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Subject line" />
          </label>

          {activeTab === 'write' ? (
            <label className="block rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <Mail className="h-4 w-4 text-emerald-600" />
                Email body
              </div>
              <textarea className={`${inputClassName} min-h-72 border-emerald-100 bg-white/80 font-[inherit] leading-6 dark:border-gray-800 dark:bg-gray-950`} value={form.html} onChange={(event) => setForm((current) => ({ ...current, html: event.target.value }))} placeholder="Write your message..." />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">This area is styled like a message draft, not a dashboard widget.</p>
            </label>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-surface-border/80 bg-[#fffdf7] shadow-sm dark:border-gray-800 dark:bg-gray-950">
              <div className="border-b border-emerald-100/80 bg-white/80 px-5 py-4 dark:border-gray-800 dark:bg-gray-900/80">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <Eye className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{currentPreview.subject || 'Preview'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Rendered through the Notification API</p>
                  </div>
                </div>
              </div>
              <div className="px-5 py-5">
                <div className="mx-auto max-w-3xl rounded-2xl border border-emerald-100 bg-white p-6 shadow-[0_10px_30px_-18px_rgba(16,185,129,0.35)] dark:border-gray-800 dark:bg-gray-900">
                  <div className="mb-5 border-b border-gray-200 pb-4 dark:border-gray-800">
                    <div className="grid gap-1 text-sm text-gray-700 dark:text-gray-300">
                      <div><span className="font-semibold text-gray-900 dark:text-gray-100">To:</span> {form.to.filter((item) => item.email).map((item) => item.email).join(', ') || '-'}</div>
                      {summary.cc ? <div><span className="font-semibold text-gray-900 dark:text-gray-100">CC:</span> {form.cc.filter((item) => item.email).map((item) => item.email).join(', ')}</div> : null}
                    </div>
                  </div>
                  <div className="space-y-4 text-sm leading-7 text-gray-800 dark:text-gray-200" dangerouslySetInnerHTML={{ __html: currentPreview.html || '<p>No preview available yet.</p>' }} />
                </div>
              </div>
            </div>
          )}

          <label className="block rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Plain text fallback</span>
            <textarea className={`${inputClassName} min-h-28`} value={form.text} onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))} placeholder="Plain text version of the email" />
          </label>

          <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-200">
              <Paperclip className="h-4 w-4" />
              Attachments
            </div>
            <p className="mt-2 text-sm text-emerald-700/80 dark:text-emerald-200/70">Attachment support is ready in the payload. The upload UI can be added without changing the send flow.</p>
          </div>

          {error ? (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{error}</div>
            </div>
          ) : null}
        </div>

      </div>
    </Modal>
  )
}

function RecipientBlock({ label, group, form, onAdd, onRemove, onChange, required = false }) {
  return (
    <div className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {label}
          {required ? ' *' : ''}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={() => onAdd(group)}>
          Add
        </Button>
      </div>
      <div className="space-y-3">
        {form[group].map((recipient, index) => (
          <div key={`${group}-${index}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input className={inputClassName} value={recipient.email} onChange={(event) => onChange(group, index, 'email', event.target.value)} placeholder="email@example.com" />
            <input className={inputClassName} value={recipient.name} onChange={(event) => onChange(group, index, 'name', event.target.value)} placeholder="Name" />
            <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(group, index)}>Remove</Button>
          </div>
        ))}
      </div>
    </div>
  )
}
