import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Briefcase,
  CalendarClock,
  CheckSquare,
  Clock3,
  FileText,
  HeartPulse,
  Link2,
  MessagesSquare,
  Send,
  Sparkles,
  Ticket,
  User,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { aiAPI } from '../api/ai'
import { useAuthStore } from '../store/authStore'
import { Badge, Button, PageHeader } from '../components/ui'
import { timeService } from '@/services/timeService'

export default function AIChat() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const firstName = user?.first_name || 'there'

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [suggestedActions, setSuggestedActions] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    if (!user?.id) return
    setConversationId(localStorage.getItem(`ai-chat-conversation:${user.id}`) || '')
  }, [user?.id])

  const welcomeGreeting = useMemo(() => {
    const hour = timeService.now().getHours()
    if (hour < 12) return 'Good Morning'
    if (hour < 17) return 'Good Afternoon'
    return 'Good Evening'
  }, [])

  const quickActions = useMemo(() => [
    { key: 'summary', icon: Sparkles, label: "Today's Summary", prompt: "Give me today's verified workspace summary with tasks, blockers, projects, and next actions." },
    { key: 'blockers', icon: AlertTriangle, label: 'Blockers', prompt: 'Show my current blockers and what needs attention first.' },
    { key: 'hr', icon: HeartPulse, label: 'HR', prompt: 'Summarize HR items that need my attention, including leave and team context.' },
    { key: 'crm', icon: Briefcase, label: 'CRM', prompt: 'Show CRM follow-ups, leads, and customer actions that need attention.' },
    { key: 'meetings', icon: CalendarClock, label: 'Meetings', prompt: 'Summarize upcoming meetings and preparation items.' },
    { key: 'reports', icon: FileText, label: 'Reports', prompt: 'Generate a concise report summary with verified sources and risks.' },
    { key: 'team-performance', icon: BarChart3, label: 'Team Performance', prompt: 'Show team performance insights with verified metrics, limitations, and safe recommendations.' },
  ], [])

  const placeholderPrompts = useMemo(() => [
    'Ask for today’s summary...',
    'Show current project blockers...',
    'Draft a verified status report...',
    'What CRM follow-ups need attention?',
    'Summarize team performance safely...',
  ], [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % placeholderPrompts.length)
    }, 3500)
    return () => window.clearInterval(interval)
  }, [placeholderPrompts.length])

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

  const sendMessage = async (rawMessage) => {
    const message = rawMessage.trim()
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
      setLastUpdated(response.generated_at || timeService.toUtcISOString(timeService.now()))
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

  const handleSend = async (event) => {
    event.preventDefault()
    await sendMessage(input)
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

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <AnimatePresence mode="wait">
              {messages.length === 0 ? (
                <WelcomeExperience
                  firstName={firstName}
                  greeting={welcomeGreeting}
                  quickActions={quickActions}
                  loading={loading}
                  onPrompt={sendMessage}
                />
              ) : (
                <motion.div
                  key="messages"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="space-y-4"
                >
                  {messages.map((message, index) => (
                    <MessageBubble key={`${message.role}-${index}-${message.content.slice(0, 12)}`} message={message} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <form onSubmit={handleSend} className="border-t border-gray-200 p-4 dark:border-gray-800">
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={placeholderPrompts[placeholderIndex]}
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
              <StatRow label="Last updated" value={lastUpdated ? format(timeService.instant(lastUpdated), 'MMM d, HH:mm') : '-'} />
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

function WelcomeExperience({ firstName, greeting, quickActions, loading, onPrompt }) {
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -8 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex min-h-[52vh] flex-col items-center justify-center text-center"
    >
      <div className="relative">
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 rounded-[2rem] bg-primary-500/20 blur-xl"
          animate={{ opacity: [0.35, 0.75, 0.35], scale: [0.92, 1.08, 0.92] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-[2rem] border border-primary-200 bg-white text-primary-600 shadow-xl shadow-primary-500/10 dark:border-primary-800 dark:bg-gray-950 dark:text-primary-300">
          <Sparkles className="h-8 w-8" aria-hidden="true" />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.24 }}
        className="mt-6 max-w-3xl"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary-600 dark:text-primary-300">
          SynTask AI
        </p>
        <h3 className="mt-3 text-3xl font-semibold tracking-tight text-gray-950 dark:text-gray-50 sm:text-4xl">
          {greeting}, {firstName}
        </h3>
        <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-gray-600 dark:text-gray-300">
          I&apos;m SynTask AI. I can help you manage tasks, CRM, HR, projects, and reports.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16, duration: 0.24 }}
        className="mt-8 grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {quickActions.map((action, index) => {
          const Icon = action.icon
          return (
            <motion.button
              key={action.key}
              type="button"
              disabled={loading}
              onClick={() => onPrompt(action.prompt)}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.035, duration: 0.2 }}
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="group rounded-2xl border border-gray-200 bg-white/80 p-4 text-left shadow-sm transition hover:border-primary-300 hover:bg-primary-50/70 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-950/60 dark:hover:border-primary-800 dark:hover:bg-primary-950/20"
              aria-label={`Ask SynTask AI about ${action.label}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition group-hover:bg-white dark:bg-primary-950/40 dark:text-primary-300 dark:group-hover:bg-gray-900">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-gray-950 dark:text-gray-50">{action.label}</div>
                  <div className="mt-1 line-clamp-2 text-sm leading-5 text-gray-500 dark:text-gray-400">
                    {action.prompt}
                  </div>
                </div>
              </div>
            </motion.button>
          )
        })}
      </motion.div>

      <div className="mt-6 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <MessagesSquare className="h-4 w-4" aria-hidden="true" />
        Answers stay grounded in your verified SynTask context.
      </div>
    </motion.div>
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
