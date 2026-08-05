import { useEffect, useState } from 'react'
import { Mail, MessageCircle, MoreHorizontal, Phone } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { inputClassName } from '../ui'

// Record Contact Attempt — the working action behind the Acquire -> Qualify
// first-contact requirement. Choosing a method and saving persists a real
// contact activity and backfills the lead's contact timestamps (the backend
// auto-fills first_contact_at from last_contacted_at).
const CONTACT_METHODS = [
  { value: 'call', label: 'Call', icon: Phone },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'other', label: 'Other', icon: MoreHorizontal },
]

export function ContactAttemptDialog({ open, lead, onClose, onRecord, saving = false }) {
  const [method, setMethod] = useState('call')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open) {
      setMethod('call')
      setNotes('')
    }
  }, [open])

  if (!open) return null

  const leadName = lead?.company_name || lead?.prospect_name || 'this lead'

  const handleSubmit = () => {
    if (saving) return
    onRecord?.(method, notes.trim())
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="sm"
      title="Record contact attempt"
      description={`Record the first contact attempt for ${leadName}.`}
      zIndexClass="z-[80]"
      footer={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={saving}
            loading={saving}
            loadingText="Saving"
          >
            <Phone className="h-4 w-4" />
            Record contact
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
            Contact method
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {CONTACT_METHODS.map((option) => {
              const active = method === option.value
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMethod(option.value)}
                  aria-pressed={active}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-950/40 dark:text-primary-200'
                      : 'border-surface-border/80 bg-white text-gray-600 hover:bg-surface-muted dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
            Notes <span className="font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">(optional)</span>
          </span>
          <textarea
            className={`${inputClassName} min-h-24`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What was discussed? Any next steps?"
          />
        </label>

        <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
          Saving records a real call/email activity on this lead and unlocks the move to Qualify. No fake contact history is created.
        </p>
      </div>
    </Modal>
  )
}
