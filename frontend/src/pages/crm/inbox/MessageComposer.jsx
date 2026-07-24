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
