import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { MessageSquare } from 'lucide-react'

import { metaInboxApi } from '../../../api/metaInbox'
import { MetaLogo } from '../../../config/visualAssets'
import { CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, inputClassName } from '../../../components/ui'
import { useAuthStore } from '../../../store/authStore'
import { ConversationList } from './ConversationList'
import { ConversationThread } from './ConversationThread'
import { AIDraftPanel } from './AIDraftPanel'
import { IdentityLinkPanel } from './IdentityLinkPanel'
import { MessageComposer } from './MessageComposer'

const CHANNELS = [
  ['', 'All channels'],
  ['whatsapp', 'WhatsApp'],
  ['instagram', 'Instagram'],
  ['messenger', 'Messenger'],
]

const STATUSES = [
  ['', 'All statuses'],
  ['open', 'Open'],
  ['pending', 'Pending'],
  ['closed', 'Closed'],
]

const unwrap = (value) => value?.data || value || { items: [] }

export default function MetaInbox() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState({ channel: '', status: 'open', assignedTo: '', priority: '', unread: false, linked: false })
  const [management, setManagement] = useState({ assigned_to: '', priority: 'normal', tags: '', note: '' })
  const companyId = user?.role === 'super_admin' ? user?.company_id : undefined
  const queryFilters = useMemo(() => ({
    companyId,
    channel: filters.channel,
    status: filters.status,
    assigned_to: filters.assignedTo,
    priority: filters.priority,
    unread: filters.unread || undefined,
    linked: filters.linked || undefined,
  }), [companyId, filters])

  const conversationsQuery = useQuery(
    ['meta-inbox-conversations', queryFilters],
    () => metaInboxApi.getConversations(queryFilters),
  )
  const channelStatusQuery = useQuery(
    ['meta-inbox-channel-status', companyId],
    () => metaInboxApi.getChannelStatus({ companyId }),
  )
  const conversations = unwrap(conversationsQuery.data).items || []
  const channelStatuses = unwrap(channelStatusQuery.data).items || []
  const [selectedId, setSelectedId] = useState(null)
  const selectedConversation = conversations.find((item) => item.id === selectedId)

  useEffect(() => {
    if (!selectedId && conversations.length) setSelectedId(conversations[0].id)
  }, [conversations, selectedId])

  useEffect(() => {
    if (!selectedConversation) return
    setManagement({
      assigned_to: selectedConversation.assigned_to || '',
      priority: selectedConversation.priority || 'normal',
      tags: (selectedConversation.tags || []).join(', '),
      note: '',
    })
  }, [selectedConversation])

  const messagesQuery = useQuery(
    ['meta-inbox-messages', selectedId, companyId],
    () => metaInboxApi.getMessages(selectedId, { companyId }),
    { enabled: Boolean(selectedId) },
  )
  const messages = unwrap(messagesQuery.data).items || []
  const updateMutation = useMutation(
    () => metaInboxApi.updateConversation(selectedId, {
      assigned_to: management.assigned_to,
      priority: management.priority,
      tags: management.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      note: management.note,
    }, { companyId }),
    {
      onSuccess: () => queryClient.invalidateQueries(['meta-inbox-conversations']),
    },
  )

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM Omnichannel"
        title="Meta Inbox"
        description="One governed inbox for WhatsApp, Instagram, and Messenger conversations. Sending stays disabled until human approval workflow lands."
        actions={<div className="flex items-center gap-2"><MetaLogo className="h-5 w-5" /><Badge label="No auto-send" colorKey="warning" /></div>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CRMStatCard icon={MessageSquare} label="Conversations" value={String(conversations.length)} helper="Tenant-scoped Meta threads." tone="blue" />
        <CRMStatCard icon={MessageSquare} label="Unread" value={String(conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0))} helper="Needs team response." tone="amber" />
        <CRMStatCard icon={MessageSquare} label="Linked CRM" value={String(conversations.filter((item) => item.linked_lead_id || item.linked_contact_id).length)} helper="Lead/contact traceability." tone="emerald" />
      </div>

      <CRMSection title="Channel status" description="Outage indicators use stored connection health. Secrets never shown.">
        <div className="grid gap-3 md:grid-cols-3">
          {channelStatuses.length ? channelStatuses.map((connection) => (
            <article key={connection.id} className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{connection.display_name || connection.provider_asset_id}</p>
                  <p className="mt-1 text-xs capitalize text-gray-500 dark:text-gray-400">{connection.channel}</p>
                </div>
                <Badge label={connection.status || 'unknown'} colorKey={connection.status === 'active' ? 'active' : 'warning'} />
              </div>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{connection.health_reason || 'No outage reported.'}</p>
            </article>
          )) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No channel health records yet.</p>
          )}
        </div>
      </CRMSection>

      <CRMSection
        title="Unified Meta conversations"
        description="Filter by channel, owner, status, priority, unread, and CRM linkage."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="meta-inbox-channel">Channel</label>
            <select
              id="meta-inbox-channel"
              aria-label="Channel"
              className={inputClassName}
              value={filters.channel}
              onChange={(event) => setFilters((current) => ({ ...current, channel: event.target.value }))}
            >
              {CHANNELS.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}
            </select>
            <label className="sr-only" htmlFor="meta-inbox-status">Status</label>
            <select
              id="meta-inbox-status"
              aria-label="Status"
              className={inputClassName}
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              {STATUSES.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}
            </select>
            <label className="sr-only" htmlFor="meta-inbox-owner">Owner filter</label>
            <input
              id="meta-inbox-owner"
              aria-label="Owner filter"
              className={inputClassName}
              placeholder="Owner ID"
              value={filters.assignedTo}
              onChange={(event) => setFilters((current) => ({ ...current, assignedTo: event.target.value }))}
            />
            <label className="sr-only" htmlFor="meta-inbox-priority">Priority filter</label>
            <select
              id="meta-inbox-priority"
              aria-label="Priority filter"
              className={inputClassName}
              value={filters.priority}
              onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}
            >
              <option value="">All priorities</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={filters.unread} onChange={(event) => setFilters((current) => ({ ...current, unread: event.target.checked }))} />
              Unread
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={filters.linked} onChange={(event) => setFilters((current) => ({ ...current, linked: event.target.checked }))} />
              Linked
            </label>
          </div>
        )}
      >
        <div className="grid gap-6 xl:grid-cols-[minmax(280px,380px)_1fr]">
          <ConversationList conversations={conversations} selectedId={selectedId} onSelect={setSelectedId} />
          <div className="space-y-4 rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <ConversationThread messages={messages} isLoading={messagesQuery.isLoading} />
            <section className="rounded-2xl border border-surface-border/80 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Inbox management</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Assignment, priority, tags, and notes only. No provider send.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Owner
                  <input className={inputClassName} value={management.assigned_to} onChange={(event) => setManagement((current) => ({ ...current, assigned_to: event.target.value }))} />
                </label>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Priority
                  <select className={inputClassName} value={management.priority} onChange={(event) => setManagement((current) => ({ ...current, priority: event.target.value }))}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Tags
                  <input className={inputClassName} value={management.tags} onChange={(event) => setManagement((current) => ({ ...current, tags: event.target.value }))} placeholder="vip, billing" />
                </label>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Internal note
                  <input className={inputClassName} value={management.note} onChange={(event) => setManagement((current) => ({ ...current, note: event.target.value }))} placeholder="Private team note" />
                </label>
              </div>
              <Button className="mt-4" variant="secondary" size="sm" disabled={!selectedId || updateMutation.isLoading} onClick={() => updateMutation.mutate()}>
                Save inbox fields
              </Button>
            </section>
            <IdentityLinkPanel conversation={selectedConversation} companyId={companyId} />
            <AIDraftPanel conversation={selectedConversation} companyId={companyId} />
            <MessageComposer
              channel={selectedConversation?.channel}
              conversationId={selectedId}
              companyId={companyId}
              onMessageSent={() => {
                queryClient.invalidateQueries(['meta-inbox-messages', selectedId, companyId])
                queryClient.invalidateQueries(['meta-inbox-conversations'])
              }}
            />
          </div>
        </div>
      </CRMSection>
    </CRMPage>
  )
}
