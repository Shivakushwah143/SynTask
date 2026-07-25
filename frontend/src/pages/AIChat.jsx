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
  Database,
  FileText,
  HeartPulse,
  Info,
  Link2,
  MessagesSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Ticket,
  User,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { aiAPI } from '../api/ai'
import { useAuthStore } from '../store/authStore'
import { Badge, Button, PageHeader } from '../components/ui'
import { timeService } from '@/services/timeService'

const unifiedWorkspaceEnabled = import.meta.env.VITE_UNIFIED_AI_ASSISTANT_ENABLED === 'true'

const formatAgentName = (agent = {}) => {
  const id = agent.agent_id || agent.id || agent.name || 'Legacy assistant'
  return id
    .replace(/@v?\d+(\.\d+)*/gi, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const formatRoutingReason = (value) => {
  if (!value) return 'Legacy route or not provided'
  return String(value).replace(/[_-]+/g, ' ')
}

const normalizeList = (value) => {
  if (!value) return []
  return Array.isArray(value) ? value.filter(Boolean) : [value]
}

const normalizeAssistantMessage = (response) => {
  const answer = response.answer || {}
  const citations = normalizeList(response.citations || response.sources || response.references)
  const warnings = normalizeList(answer.warnings || response.warnings)
  const missingData = normalizeList(answer.missing_data || response.missing_data || response.missing_or_conflicting_data)
  const proposedActions = normalizeList(response.proposed_actions || response.suggested_actions || response.actions)
  const memory = response.memory || {}
  const agent = response.agent || {}

  return {
    role: 'assistant',
    content: response.message || answer.summary || 'I could not generate a response.',
    sections: normalizeList(answer.sections),
    facts: normalizeList(answer.facts),
    agent,
    routingReason: agent.routing_reason || response.routing_reason,
    confidence: answer.confidence ?? response.confidence,
    warnings,
    citations,
    missingData,
    proposedActions,
    memory,
    usage: response.usage || {},
    proposalOnly: Boolean(response.proposal_only || proposedActions.length > 0),
    createdAt: timeService.now(),
  }
}

export default function AIChat() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const firstName = user?.first_name || 'there'

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastPrompt, setLastPrompt] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [suggestedActions, setSuggestedActions] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [latestAssistant, setLatestAssistant] = useState(null)

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
    setLastPrompt(message)

    try {
      const response = await aiAPI.chat({
        message,
        history: nextMessages.slice(0, -1),
        conversation_id: conversationId || undefined,
        session_id: sessionId || undefined,
        workspace: { page: 'ai-assistant' },
      })
      const assistantMessage = normalizeAssistantMessage(response)

      setMessages((current) => [
        ...current,
        assistantMessage,
      ])
      setLatestAssistant(assistantMessage)
      setSuggestedActions(assistantMessage.proposedActions)
      setLastUpdated(response.generated_at || timeService.toUtcISOString(timeService.now()))
      if (response.conversation_id) {
        setConversationId(response.conversation_id)
        if (user?.id) {
          localStorage.setItem(`ai-chat-conversation:${user.id}`, response.conversation_id)
        }
      }
      if (response.session_id) setSessionId(response.session_id)
    } catch (chatError) {
      const detail = chatError.response?.data?.detail || chatError.message || 'Failed to generate assistant response'
      setError(detail)
      if (chatError.response?.status === 503) {
        setLatestAssistant({
          role: 'assistant',
          content: 'Unified AI workspace is disabled or unavailable.',
          warnings: [detail],
          citations: [],
          missingData: ['Agent Platform or Project Agent feature gate is not enabled.'],
          proposedActions: [],
          memory: {},
          agent: {},
          routingReason: 'disabled_feature',
          proposalOnly: false,
          createdAt: timeService.now(),
        })
      }
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

      {!unifiedWorkspaceEnabled ? (
        <StateBanner
          tone="warning"
          title="Unified workspace rollout disabled"
          description="This screen still works through the legacy chat path until VITE_UNIFIED_AI_ASSISTANT_ENABLED=true."
        />
      ) : null}

      {error ? (
        <StateBanner
          tone="error"
          title="Assistant request failed"
          description={error}
          action={lastPrompt ? (
            <Button type="button" variant="secondary" onClick={() => sendMessage(lastPrompt)} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          ) : null}
        />
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
                  {loading ? <LoadingResponse /> : null}
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
                disabled={loading}
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
              <StatRow label="Session" value={sessionId ? 'Active' : 'Not started'} />
              <StatRow label="Last updated" value={lastUpdated ? format(timeService.instant(lastUpdated), 'MMM d, HH:mm') : '-'} />
            </dl>
          </section>

          <WorkspaceInspector latest={latestAssistant} unifiedEnabled={unifiedWorkspaceEnabled} loading={loading} />

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
        {!isUser ? <AssistantDetails message={message} /> : null}
      </div>
    </div>
  )
}

function AssistantDetails({ message }) {
  const hasDetails = message.sections?.length || message.facts?.length || message.warnings?.length || message.citations?.length || message.missingData?.length || message.proposedActions?.length
  if (!hasDetails) return null

  return (
    <div className="mt-4 space-y-3 border-t border-gray-200 pt-3 dark:border-gray-800">
      {message.sections?.length ? <DetailList title="Sections" items={message.sections} /> : null}
      {message.facts?.length ? <DetailList title="Facts" items={message.facts} /> : null}
      {message.warnings?.length ? <DetailList title="Warnings" items={message.warnings} tone="warning" /> : null}
      {message.missingData?.length ? <DetailList title="Missing or conflicting data" items={message.missingData} tone="warning" /> : null}
      {message.citations?.length ? <CitationList citations={message.citations} /> : null}
      {message.proposedActions?.length ? <DetailList title="Proposal-only actions" items={message.proposedActions} tone="proposal" /> : null}
    </div>
  )
}

function DetailList({ title, items, tone = 'default' }) {
  const toneClass = tone === 'warning'
    ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100'
    : tone === 'proposal'
      ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100'
      : 'border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-950/60 dark:text-gray-200'

  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{title}</div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className={`rounded-xl border px-3 py-2 ${toneClass}`}>
            {renderDetailItem(item)}
          </div>
        ))}
      </div>
    </div>
  )
}

function CitationList({ citations }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Citations and source references</div>
      <div className="space-y-2">
        {citations.map((citation, index) => (
          <div key={`citation-${index}`} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100">
            <div className="font-semibold">{citation.title || citation.source || citation.document_id || `Source ${index + 1}`}</div>
            {citation.reference || citation.url || citation.record_id ? (
              <div className="mt-1 break-words text-xs opacity-80">{citation.reference || citation.url || citation.record_id}</div>
            ) : null}
            {citation.snippet ? <div className="mt-1 text-xs opacity-80">{citation.snippet}</div> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkspaceInspector({ latest, unifiedEnabled, loading }) {
  const confidence = typeof latest?.confidence === 'number' ? `${Math.round(latest.confidence * 100)}%` : 'Not provided'
  const memorySaved = latest?.memory?.saved
  const memoryCount = latest?.memory?.candidate_ids?.length || latest?.memory?.memories?.length || 0

  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Workspace routing</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Visible governance for latest response.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <InspectorItem icon={Bot} label="Selected agent" value={loading ? 'Selecting...' : formatAgentName(latest?.agent)} />
        <InspectorItem icon={Info} label="Routing reason" value={loading ? 'Checking context...' : formatRoutingReason(latest?.routingReason)} />
        <InspectorItem icon={BarChart3} label="Confidence" value={confidence} />
        <InspectorItem icon={Database} label="Memory status" value={memorySaved ? 'Saved' : memoryCount ? `${memoryCount} candidate(s)` : 'No saved memory'} />
        <InspectorItem icon={FileText} label="Proposal-only status" value={latest?.proposalOnly ? 'Proposal only, approval required' : 'No proposed mutation'} />
      </div>

      {!unifiedEnabled ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
          Legacy route active. Full M12 metadata appears after rollout flag enables unified gateway.
        </div>
      ) : null}
    </section>
  )
}

function InspectorItem({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{value || '-'}</div>
    </div>
  )
}

function LoadingResponse() {
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[90%] rounded-3xl border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950/60">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Building governed workspace answer...
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
        </div>
      </div>
    </div>
  )
}

function StateBanner({ tone, title, description, action }) {
  const toneClass = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-100'
    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100'

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${toneClass}`}>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="mt-1 text-sm opacity-90">{description}</div>
      </div>
      {action}
    </div>
  )
}

function renderDetailItem(item) {
  if (typeof item === 'string') return item
  if (item?.label || item?.title || item?.type) {
    return (
      <div>
        <div className="font-semibold">{item.label || item.title || item.type}</div>
        {item.description || item.summary || item.reason ? <div className="mt-1 text-xs opacity-80">{item.description || item.summary || item.reason}</div> : null}
      </div>
    )
  }
  return JSON.stringify(item)
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <dt>{label}</dt>
      <dd className="font-semibold text-gray-900 dark:text-gray-100">{value}</dd>
    </div>
  )
}
