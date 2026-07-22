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
