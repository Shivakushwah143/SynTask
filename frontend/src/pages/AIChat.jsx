import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Bot, CheckSquare, Clock3, FileText, Send, Sparkles, Ticket, User } from 'lucide-react'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { aiAPI } from '../api/ai'
import { useAuthStore } from '../store/authStore'
import { Badge, Button, PageHeader } from '../components/ui'

const AIChat = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const firstName = user?.first_name || 'there'

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Good morning, ${firstName}. Ask me about your tasks, tickets, team, or work for today.`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [suggestedActions, setSuggestedActions] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [conversationId, setConversationId] = useState('')

  useEffect(() => {
    if (!user?.id) return
    setConversationId(localStorage.getItem(`ai-chat-conversation:${user.id}`) || '')
  }, [user?.id])

  const conversation = useMemo(() => messages, [messages])
  const actionCards = useMemo(() => {
    if (suggestedActions.length) {
      return suggestedActions.map((action, index) => ({
        key: `${action.label}-${index}`,
        icon: Sparkles,
        label: action.label,
        detail: action.type ? `Suggested ${action.type} action from verified AI context.` : 'Suggested follow-up from verified AI context.',
        path: action.payload?.path || '',
      }))
    }

    return [
      {
        key: 'prioritize-day',
        icon: CheckSquare,
        label: 'Prioritize my day',
        detail: 'Generate a ranked plan from your assigned tasks and current requests.',
        path: '/ai-prioritization',
      },
      {
        key: 'review-tickets',
        icon: Ticket,
        label: 'Review waiting tickets',
        detail: 'Check requests that may need a response, owner, or escalation.',
        path: '/tickets',
      },
      {
        key: 'daily-report',
        icon: FileText,
        label: 'Generate daily report',
        detail: 'Capture completed work, blockers, and tomorrow priorities.',
        path: '/reports',
      },
      {
        key: 'risk-scan',
        icon: AlertTriangle,
        label: 'Scan for risks',
        detail: 'Look for overdue work, blocked tasks, and delivery pressure.',
        path: '/dashboard',
      },
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
        {
          role: 'assistant',
          content: response.message,
        },
      ])
      setSuggestedActions(Array.isArray(response.suggested_actions) ? response.suggested_actions : [])
      setLastUpdated(response.generated_at)
      if (response.conversation_id) {
        setConversationId(response.conversation_id)
        if (user?.id) {
          localStorage.setItem(`ai-chat-conversation:${user.id}`, response.conversation_id)
        }
      }
    } catch (chatError) {
      console.error('Failed to generate AI chat response', chatError)
      setError(chatError.response?.data?.detail || chatError.message || 'Failed to generate assistant response')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="AI Assistant"
        description="Ask SynTask anything about your verified work context. The assistant responds as your role-aware copilot."
        actions={
          <div className="flex items-center gap-2">
            <Badge label="Role aware" colorKey="active" />
            <Badge label="JSON validated" colorKey="info" />
          </div>
        }
      />

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Conversation</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {user?.first_name ? `Personalized for ${user.first_name} ${user.last_name || ''}` : 'Personalized for your role'}
                </p>
              </div>
            </div>
          </div>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-6">
            {conversation.map((item, index) => (
              <div
                key={`${item.role}-${index}-${item.content.slice(0, 16)}`}
                className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
                    item.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : 'border border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-100'
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] opacity-80">
                    {item.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {item.role === 'user' ? 'You' : 'SynTask AI'}
                  </div>
                  <p className="whitespace-pre-wrap">{item.content}</p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} className="border-t border-gray-200 p-4 dark:border-gray-800">
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about your work, team, tickets, or priorities..."
                className="min-h-[56px] flex-1 resize-none rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-100 dark:focus:ring-primary-900/40"
              />
              <Button type="submit" loading={loading} className="self-end">
                <Send className="h-4 w-4" />
                Send
              </Button>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-gray-500">Status</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">Verified assistant</div>
              </div>
            </div>

            <dl className="mt-5 space-y-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-center justify-between">
                <dt>Messages</dt>
                <dd className="font-semibold text-gray-900 dark:text-gray-100">{conversation.length}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Last updated</dt>
                <dd className="font-semibold text-gray-900 dark:text-gray-100">
                  {lastUpdated ? format(new Date(lastUpdated), 'MMM d, HH:mm') : '-'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Suggested actions</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              The assistant can suggest follow-up navigation based on verified context.
            </p>

            <div className="mt-4 space-y-3">
              {actionCards.map((action) => {
                const Icon = action.icon
                return (
                  <div key={action.key} className="group rounded-2xl border border-gray-200 bg-gray-50 p-4 transition hover:border-primary-300 hover:bg-primary-50 dark:border-gray-800 dark:bg-gray-950/40 dark:hover:border-primary-800 dark:hover:bg-primary-950/20">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary-600 shadow-sm dark:bg-gray-900 dark:text-primary-300">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{action.label}</div>
                        <div className="mt-1 text-sm leading-5 text-gray-600 dark:text-gray-300">{action.detail}</div>
                      </div>
                      {action.path ? (
                        <button
                          type="button"
                          onClick={() => navigate(action.path)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition group-hover:bg-white group-hover:text-primary-600 dark:group-hover:bg-gray-900 dark:group-hover:text-primary-300"
                          aria-label={`Open ${action.label}`}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AIChat
