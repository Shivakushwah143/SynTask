import { Badge } from '../../../components/ui'

const CHANNEL_LABELS = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
}

export function ConversationList({ conversations, selectedId, onSelect }) {
  if (!conversations.length) {
    return (
      <div className="rounded-2xl border border-dashed border-surface-border/80 bg-white p-6 text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        No Meta conversations found.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          type="button"
          onClick={() => onSelect(conversation.id)}
          className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
            selectedId === conversation.id
              ? 'border-primary-400 bg-primary-50 dark:border-primary-500 dark:bg-primary-950/30'
              : 'border-surface-border/80 bg-white hover:border-primary-200 dark:border-gray-800 dark:bg-gray-900'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge label={CHANNEL_LABELS[conversation.channel] || conversation.channel || 'Meta'} colorKey="active" />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {conversation.provider_thread_id}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {conversation.linked_lead_id ? `Lead ${conversation.linked_lead_id}` : conversation.linked_contact_id ? `Contact ${conversation.linked_contact_id}` : 'Unlinked CRM identity'}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Owner: {conversation.assigned_to || 'Unassigned'} · Priority: {conversation.priority || 'normal'}
              </p>
            </div>
            <Badge label={`${conversation.unread_count || 0} unread`} colorKey={conversation.unread_count ? 'warning' : 'draft'} />
          </div>
          {conversation.tags?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {conversation.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </button>
      ))}
    </div>
  )
}
