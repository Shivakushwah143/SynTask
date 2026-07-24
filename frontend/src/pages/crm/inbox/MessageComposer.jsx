import { useState } from 'react'
import { useMutation } from 'react-query'
import toast from 'react-hot-toast'
import { Button } from '../../../components/ui'
import { metaInboxApi } from '../../../api/metaInbox'

const RESTRICTIONS = {
  whatsapp: 'WhatsApp replies require explicit human approval and an eligible customer conversation window.',
  instagram: 'Instagram replies require explicit human approval, a user-initiated conversation within 24 hours, and Meta App Review approval.',
  messenger: 'Messenger replies require explicit human approval, a valid 24-hour page messaging window, and Meta App Review approval.',
}

export function MessageComposer({ channel, conversationId, companyId, onMessageSent }) {
  const [draft, setDraft] = useState('')
  const restriction = RESTRICTIONS[channel] || 'Meta replies require human approval.'

  const sendMutation = useMutation(
    () => metaInboxApi.sendMessage(conversationId, draft, companyId),
    {
      onSuccess: () => {
        toast.success('Message sent successfully!')
        setDraft('')
        if (onMessageSent) onMessageSent()
      },
      onError: (err) => {
        toast.error(`Failed to send message: ${err.response?.data?.detail || err.message}`)
      }
    }
  )

  const handleSend = () => {
    if (!draft.trim()) return
    sendMutation.mutate()
  }

  if (!conversationId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
        Select a conversation to reply
      </div>
    )
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
      <label className="text-sm font-semibold text-amber-900 dark:text-amber-100" htmlFor="meta-inbox-draft">
        Human-approved response
      </label>
      <textarea
        id="meta-inbox-draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="mt-2 min-h-24 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-amber-400 dark:border-amber-800 dark:bg-gray-950 dark:text-gray-100"
        placeholder="Type a response to send..."
        disabled={sendMutation.isLoading}
      />
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
        <span>
          <span>{restriction}</span>
          <span className="block font-medium text-amber-900 dark:text-amber-100">
            Outbound sending requires manual agent click approval.
          </span>
        </span>
        <Button
          type="button"
          onClick={handleSend}
          disabled={!draft.trim() || sendMutation.isLoading}
          loading={sendMutation.isLoading}
        >
          Send Reply
        </Button>
      </div>
    </section>
  )
}
const MESSENGER_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

export function getMetaComposerRestriction({
  channel,
  lastCustomerMessageAt,
  recipientOptedOut = false,
  now = new Date(),
}) {
  if (recipientOptedOut) return 'Recipient opted out.'
  if (channel === 'instagram' && !lastCustomerMessageAt) {
    return 'Instagram replies require an existing customer-initiated conversation.'
  }
  if (channel === 'messenger') {
    if (!lastCustomerMessageAt) {
      return 'Messenger replies require an existing customer-initiated conversation.'
    }
    const lastCustomerDate = new Date(lastCustomerMessageAt)
    if (now.getTime() - lastCustomerDate.getTime() > MESSENGER_REPLY_WINDOW_MS) {
      return 'Messenger replies are outside the standard customer messaging window.'
    }
  }
  return null
}

export function MessageComposer({
  channel,
  lastCustomerMessageAt = null,
  recipientOptedOut = false,
  now = new Date(),
}) {
  const restriction = getMetaComposerRestriction({
    channel,
    lastCustomerMessageAt,
    recipientOptedOut,
    now,
  })
  const disabled = Boolean(restriction)

  return (
    <section className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="meta-message-composer">
        Message
      </label>
      <textarea
        id="meta-message-composer"
        aria-label="Message"
        className="mt-2 min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
        disabled={disabled}
      />
      {restriction ? (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-200">{restriction}</p>
      ) : null}
      <button
        type="button"
        className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        disabled={disabled}
      >
        Send for approval
      </button>
    </section>
  )
}

export default MessageComposer
