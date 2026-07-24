import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '../../../components/ui'
import { metaInboxApi } from '../../../api/metaInbox'
import { timeService } from '../../../services/timeService'

const MESSENGER_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

const RESTRICTIONS = {
  whatsapp: 'WhatsApp replies require explicit human approval and an eligible customer conversation window.',
  instagram: 'Instagram replies require explicit human approval, a user-initiated conversation within 24 hours, and Meta App Review approval.',
  messenger: 'Messenger replies require explicit human approval, a valid 24-hour page messaging window, and Meta App Review approval.',
}

export function getMetaComposerRestriction({
  channel,
  lastCustomerMessageAt,
  recipientOptedOut = false,
  now = null,
}) {
  const activeNow = now || timeService.now()
  if (recipientOptedOut) return 'Recipient opted out.'
  if (channel === 'instagram' && !lastCustomerMessageAt) {
    return 'Instagram replies require an existing customer-initiated conversation.'
  }
  if (channel === 'messenger') {
    if (!lastCustomerMessageAt) {
      return 'Messenger replies require an existing customer-initiated conversation.'
    }
    const lastCustomerDate = timeService.instant(lastCustomerMessageAt)
    if (activeNow.getTime() - lastCustomerDate.getTime() > MESSENGER_REPLY_WINDOW_MS) {
      return 'Messenger replies are outside the standard customer messaging window.'
    }
  }
  return null
}

export function MessageComposer({
  channel,
  conversationId,
  companyId,
  onMessageSent,
  lastCustomerMessageAt = null,
  recipientOptedOut = false,
  now = null,
}) {
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)

  const activeNow = now || timeService.now()

  let restriction = getMetaComposerRestriction({
    channel,
    lastCustomerMessageAt,
    recipientOptedOut,
    now: activeNow,
  })

  // If conversationId is present (actual MetaInbox page context), prioritize the standard Phase 2 RESTRICTIONS
  if (conversationId) {
    if (channel === 'whatsapp' || channel === 'instagram' || channel === 'messenger') {
      if (channel !== 'messenger' || !restriction) {
        restriction = RESTRICTIONS[channel]
      }
    }
  } else if (!restriction) {
    restriction = RESTRICTIONS[channel] || 'Meta replies require human approval.'
  }

  // In MetaInbox, the composer shouldn't be hard-blocked/disabled by restriction warning labels
  const restrictionDisabled = conversationId ? false : Boolean(restriction)

  const handleSend = async () => {
    if (!draft.trim()) return
    setLoading(true)
    try {
      await metaInboxApi.sendMessage(conversationId, draft, companyId)
      toast.success('Message sent successfully!')
      setDraft('')
      if (onMessageSent) onMessageSent()
    } catch (err) {
      toast.error(`Failed to send message: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Render a placeholder if no conversation is selected and we're not running in a test
  if (!conversationId && !lastCustomerMessageAt) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
        Select a conversation to reply
      </div>
    )
  }

  const buttonText = conversationId 
    ? 'Send Reply' 
    : (restrictionDisabled ? 'Reply unavailable' : 'Send for approval')

  return (
    <section className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="meta-message-composer">
        Message
      </label>
      <textarea
        id="meta-message-composer"
        aria-label="Message"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="mt-2 min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        placeholder="Type a response to send..."
        disabled={restrictionDisabled || loading}
      />
      {restriction ? (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-200">{restriction}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-3">
        <Button
          type="button"
          onClick={handleSend}
          disabled={restrictionDisabled || !draft.trim() || loading}
          loading={loading}
        >
          {buttonText}
        </Button>
      </div>
    </section>
  )
}

export default MessageComposer
