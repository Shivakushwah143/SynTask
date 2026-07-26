export function ConversationThread({ messages, isLoading }) {
  if (isLoading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading messages…</p>
  }

  if (!messages.length) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Select a conversation to inspect messages.</p>
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <article key={message.id} className="rounded-2xl border border-surface-border/80 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {message.direction} · {message.channel}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {message.provider_message_id}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{message.text || 'No text body stored.'}</p>
        </article>
      ))}
    </div>
  )
}
