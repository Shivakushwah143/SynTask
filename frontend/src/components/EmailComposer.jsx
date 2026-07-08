import { useEffect, useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { Mail, Paperclip, Eye, Send, X } from 'lucide-react'
import { notificationsEmailApi } from '../api/notificationsEmail'
import { Button, Modal, inputClassName } from './ui'

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

export function EmailComposer({ isOpen, onClose, initialData = {}, onSend }) {
  const [form, setForm] = useState(emptyState)
  const [preview, setPreview] = useState(null)
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
      html: template.body_html || current.html,
    }))
  }

  const previewEmail = async () => {
    const response = await notificationsEmailApi.preview(form)
    setPreview(response?.data || response)
  }

  const sendEmail = async () => {
    const response = await notificationsEmailApi.send(form)
    await onSend?.(response?.data || response, form)
    onClose?.()
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Email Composer" size="xl">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-surface-border/80 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
          <Mail className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Reusable notification composer</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select className={inputClassName} value={form.template_id} onChange={(event) => applyTemplate(event.target.value)}>
              <option value="">Template selector</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </div>
        </div>

        <RecipientBlock label="To" group="to" form={form} onAdd={addRecipient} onRemove={removeRecipient} onChange={updateRecipient} required />
        <RecipientBlock label="CC" group="cc" form={form} onAdd={addRecipient} onRemove={removeRecipient} onChange={updateRecipient} />
        <RecipientBlock label="BCC" group="bcc" form={form} onAdd={addRecipient} onRemove={removeRecipient} onChange={updateRecipient} />

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Subject</span>
          <input className={inputClassName} value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Rich text body</span>
          <textarea className={`${inputClassName} min-h-44`} value={form.html} onChange={(event) => setForm((current) => ({ ...current, html: event.target.value }))} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">Plain text body</span>
          <textarea className={`${inputClassName} min-h-28`} value={form.text} onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))} />
        </label>

        <div className="rounded-2xl border border-dashed border-surface-border p-4 dark:border-gray-800">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <Paperclip className="h-4 w-4" />
            Attachments
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Attachment support is wired in the API payload and can be extended later.</p>
        </div>

        {preview ? (
          <div className="rounded-2xl border border-surface-border/80 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              <Eye className="h-4 w-4" />
              Preview
            </div>
            <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{preview.subject}</p>
            <div className="mt-3 rounded-xl bg-white p-3 text-sm leading-6 text-gray-700 dark:bg-gray-900 dark:text-gray-300" dangerouslySetInnerHTML={{ __html: preview.html || '' }} />
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={previewEmail}>
            <Eye className="h-4 w-4" />
            Preview
          </Button>
          <Button type="button" variant="primary" onClick={sendEmail}>
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function RecipientBlock({ label, group, form, onAdd, onRemove, onChange, required = false }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {label}
          {required ? ' *' : ''}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={() => onAdd(group)}>
          Add
        </Button>
      </div>
      {form[group].map((recipient, index) => (
        <div key={`${group}-${index}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input className={inputClassName} value={recipient.email} onChange={(event) => onChange(group, index, 'email', event.target.value)} placeholder="email@example.com" />
          <input className={inputClassName} value={recipient.name} onChange={(event) => onChange(group, index, 'name', event.target.value)} placeholder="Name" />
          <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(group, index)}>Remove</Button>
        </div>
      ))}
    </div>
  )
}
