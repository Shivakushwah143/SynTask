import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  ArrowRight,
  Bot,
  CheckSquare,
  Clock3,
  FileText,
  Link2,
  Send,
  Sparkles,
  Ticket,
  User,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { aiAPI } from '../api/ai'
import { useAuthStore } from '../store/authStore'
import { Badge, Button, PageHeader } from '../components/ui'

export default function AIChat() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const firstName = user?.first_name || 'there'

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Good morning, ${firstName}. Ask about your work, and I will answer with verified context, sources, and next actions.`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [suggestedActions, setSuggestedActions] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    if (!user?.id) return
    setConversationId(localStorage.getItem(`ai-chat-conversation:${user.id}`) || '')
  }, [user?.id])

  const actionCards = useMemo(() => {
    if (suggestedActions.length) {
      return suggestedActions.map((action, index) => ({
        key: `${action.label}-${index}`,
        icon: Sparkles,
        label: action.label,
        detail: action.type ? `Suggested ${action.type} action from verified context.` : 'Suggested follow-up based on workspace context.',
        path: action.payload?.path || '',
      }))
    }

    return [
      { key: 'prioritize', icon: CheckSquare, label: 'Prioritize my day', detail: 'Rank assigned work and blockers.', path: '/ai-prioritization' },
      { key: 'review-tickets', icon: Ticket, label: 'Review tickets', detail: 'Inspect requests that need attention.', path: '/tickets' },
      { key: 'daily-report', icon: FileText, label: 'Generate daily report', detail: 'Summarize progress and risks.', path: '/reports' },
      { key: 'open-hub', icon: Bot, label: 'Open AI Hub', detail: 'Visit the command center for AI employees.', path: '/ai-hub' },
    ]
  }, [suggestedActions])

  const handleSend = async (event) => {
    event.preventDefault()
    const message = input.trim()
    if (!message || loading) return

    const nextMessages = [...messages, { role: 'user', content: message }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const response = await aiAPI.chat({
        message,
        history: nextMessages.slice(0, -1),
        conversation_id: conversationId || undefined,
      })

      setMessages((current) => [
        ...current,
        { role: 'assistant', content: response.message },
      ])
      setSuggestedActions(Array.isArray(response.suggested_actions) ? response.suggested_actions : [])
      setLastUpdated(response.generated_at || new Date().toISOString())
      if (response.conversation_id) {
        setConversationId(response.conversation_id)
        if (user?.id) {
          localStorage.setItem(`ai-chat-conversation:${user.id}`, response.conversation_id)
        }
      }
    } catch (chatError) {
      setError(chatError.response?.data?.detail || chatError.message || 'Failed to generate assistant response')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Chat"
        description="A verified workspace assistant that answers with sources, suggestions, and next steps."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge label="Verified context" colorKey="active" />
            <Badge label="Human approved" colorKey="scheduled" />
          </div>
        )}
      />

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="card flex min-h-[72vh] flex-col overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Conversation</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Responses remain calm, direct, and grounded in workspace context.</p>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6">
            {messages.map((message, index) => (
              <MessageBubble key={`${message.role}-${index}-${message.content.slice(0, 12)}`} message={message} />
            ))}
          </div>

          <form onSubmit={handleSend} className="border-t border-gray-200 p-4 dark:border-gray-800">
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about projects, tasks, meetings, or knowledge..."
                className="min-h-[60px] flex-1 resize-none rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-100 dark:focus:ring-primary-900/40"
              />
              <Button type="submit" loading={loading} className="self-end">
                <Send className="h-4 w-4" />
                Send
              </Button>
            </div>
          </form>
        </section>

        <aside className="space-y-6">
          <section className="card p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Response status</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">The assistant only speaks when it has verified context.</p>
              </div>
            </div>

            <dl className="mt-5 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <StatRow label="Messages" value={messages.length} />
              <StatRow label="Conversation" value={conversationId ? 'Persisted' : 'New'} />
              <StatRow label="Last updated" value={lastUpdated ? format(new Date(lastUpdated), 'MMM d, HH:mm') : '-'} />
            </dl>
          </section>

          <section className="card p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                <Link2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Suggested actions</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Follow-up navigation based on the latest response.</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {actionCards.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => navigate(action.path)}
                    className="group w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary-300 hover:bg-primary-50 dark:border-gray-800 dark:bg-gray-950/40 dark:hover:border-primary-800 dark:hover:bg-primary-950/20"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary-600 shadow-sm dark:bg-gray-900 dark:text-primary-300">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{action.label}</div>
                        <div className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">{action.detail}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400 transition group-hover:text-primary-600 dark:group-hover:text-primary-300" />
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[90%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${isUser ? 'bg-primary-600 text-white' : 'border border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-100'}`}>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] opacity-80">
          {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          {isUser ? 'You' : 'SynTask AI'}
        </div>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className="font-semibold text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  )
}
