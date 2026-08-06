import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Briefcase,
  CalendarClock,
  Clipboard,
  ClipboardList,
  FileText,
  HeartPulse,
  Lightbulb,
  Loader2,
  Maximize2,
  MessagesSquare,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { aiAPI } from '../../api/ai'
import { useAuthStore } from '../../store/authStore'
import { timeService } from '@/services/timeService'

const QUICK_ACTIONS = [
  { key: 'summary', label: "Today's Summary", icon: Sparkles, prompt: "Give me today's verified workspace summary with tasks, blockers, projects, and next actions." },
  { key: 'blockers', label: 'Blockers', icon: AlertTriangle, prompt: 'Show my current blockers and what needs attention first.' },
  { key: 'hr', label: 'HR', icon: HeartPulse, prompt: 'Summarize HR items that need my attention, including leave and team context.' },
  { key: 'crm', label: 'CRM', icon: Briefcase, prompt: 'Show CRM follow-ups, leads, and customer actions that need attention.' },
  { key: 'meetings', label: 'Meetings', icon: CalendarClock, prompt: 'Summarize upcoming meetings and preparation items.' },
  { key: 'reports', label: 'Reports', icon: FileText, prompt: 'Generate a concise report summary with verified sources and risks.' },
  { key: 'team-performance', label: 'Team Performance', icon: BarChart3, prompt: 'Show team performance insights with verified metrics, limitations, and safe recommendations.' },
]

const PLACEHOLDER_PROMPTS = [
  'Ask for today’s summary...',
  'Show current project blockers...',
  'Draft a verified status report...',
  'What CRM follow-ups need attention?',
  'Summarize team performance safely...',
]

const QUICK_TIPS = [
  { label: 'Use short, specific questions', icon: Target },
  { label: 'Ask about trends or comparisons', icon: BarChart3 },
  { label: 'Request summaries for quick insights', icon: Sparkles },
]

const buildHistory = (messages) =>
  messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))

export function AIAssistantDialog({ isOpen, onClose }) {
  const { user } = useAuthStore()
  const firstName = user?.first_name || 'there'
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [conversationId, setConversationId] = useState(null)
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef(null)

  const canSend = input.trim().length > 0 && !isSending
  const greeting = useMemo(() => {
    const hour = timeService.now().getHours()
    if (hour < 12) return 'Good Morning'
    if (hour < 17) return 'Good Afternoon'
    return 'Good Evening'
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: 'end' }), 0)
    return () => clearTimeout(timer)
  }, [isOpen, messages])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % PLACEHOLDER_PROMPTS.length)
    }, 3500)
    return () => window.clearInterval(interval)
  }, [])

  const sendMessage = async (rawMessage) => {
    const text = rawMessage.trim()
    if (!text || isSending) return

    const userMessage = {
      id: `user-${timeService.now().getTime()}`,
      role: 'user',
      content: text,
      createdAt: timeService.now(),
    }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setIsSending(true)

    try {
      const response = await aiAPI.chat({
        conversation_id: conversationId,
        message: text,
        history: buildHistory(messages),
      })
      setConversationId(response.conversation_id || conversationId)
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${timeService.now().getTime()}`,
          role: 'assistant',
          content: response.message || 'I could not generate a response.',
          actions: response.suggested_actions || response.actions || [],
          createdAt: timeService.now(),
        },
      ])
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'AI assistant could not respond')
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${timeService.now().getTime()}`,
          role: 'assistant',
          content: 'I could not reach the assistant right now. Please try again.',
          isError: true,
          createdAt: timeService.now(),
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-assistant-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="flex h-[min(92vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-orange-100/80 bg-[#fffdf9] shadow-[0_28px_80px_rgba(36,28,20,0.34)] dark:border-[#5a4635] dark:bg-[rgb(29_24_19)]" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-orange-100/80 px-7 py-6 dark:border-[#5a4635]">
          <div className="flex min-w-0 items-center gap-4">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-200">
              <Sparkles className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h2 id="ai-assistant-title" className="truncate text-2xl font-semibold tracking-tight text-text-primary dark:text-[var(--color-app-text)]">
                AI Assistant
              </h2>
              <p className="mt-1 text-base text-text-secondary dark:text-[var(--color-app-text-secondary)]">
                Ask operational questions without leaving your dashboard.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-orange-100 bg-white text-text-secondary shadow-sm transition hover:bg-orange-50 hover:text-text-primary dark:border-[#5a4635] dark:bg-black/30 dark:text-gray-200 dark:hover:bg-white/5" aria-label="Expand assistant">
              <Maximize2 className="h-5 w-5" />
            </button>
            <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-orange-100 bg-white text-text-secondary shadow-sm transition hover:bg-orange-50 hover:text-text-primary dark:border-[#5a4635] dark:bg-black/30 dark:text-gray-200 dark:hover:bg-white/5" aria-label="Close assistant">
              <X className="h-6 w-6" />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-7 py-7">
          <AnimatePresence mode="wait">
            {messages.length === 0 ? (
              <DialogWelcomeExperience
                firstName={firstName}
                greeting={greeting}
                isSending={isSending}
                onPrompt={sendMessage}
              />
            ) : null}
          </AnimatePresence>

          <motion.section
            initial={false}
            animate={{ opacity: messages.length ? 1 : 0 }}
            className={messages.length ? 'mt-8 space-y-6' : 'hidden'}
          >
            {messages.map((message) => {
              const isUser = message.role === 'user'
              const Icon = isUser ? UserRound : Bot
              return (
                <div key={message.id} className={`flex items-start gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser ? (
                    <span className="mt-1 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 shadow-[0_10px_28px_rgba(234,88,12,0.18)] dark:bg-orange-950/60 dark:text-orange-200">
                      <Icon className="h-6 w-6" />
                    </span>
                  ) : null}
                  <div className={`flex max-w-[78%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    <div className={`rounded-2xl px-5 py-4 text-base leading-7 shadow-sm ${
                      isUser
                        ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white'
                        : message.isError
                          ? 'border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100'
                          : 'border border-orange-100 bg-white text-text-primary dark:border-[#5a4635] dark:bg-black/25 dark:text-[var(--color-app-text)]'
                    }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <div className={`mt-2 flex items-center gap-2 text-sm text-text-muted dark:text-[var(--color-app-text-muted)] ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <span>{formatMessageTime(message.createdAt)}</span>
                      {isUser ? <span className="font-semibold text-orange-600">✓✓</span> : null}
                    </div>
                    {!isUser && message.id !== 'welcome' ? (
                      <div className="mt-3 inline-flex items-center gap-1 rounded-xl border border-orange-100 bg-white p-1 shadow-sm dark:border-[#5a4635] dark:bg-black/25">
                        {[Clipboard, ThumbsUp, ThumbsDown, RefreshCw].map((ActionIcon, index) => (
                          <button key={index} type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-orange-50 hover:text-orange-600 dark:text-gray-300 dark:hover:bg-white/5" aria-label="Assistant action">
                            <ActionIcon className="h-4 w-4" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {isUser ? (
                    <span className="mt-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-text-secondary shadow-sm ring-1 ring-orange-100 dark:bg-black/25 dark:text-gray-200 dark:ring-[#5a4635]">
                      <Icon className="h-6 w-6" />
                    </span>
                  ) : null}
                </div>
              )
            })}
            {isSending ? (
              <div className="flex items-center gap-4 text-base text-text-secondary dark:text-[var(--color-app-text-secondary)]">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-200">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </span>
                Thinking...
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </motion.section>
        </main>

        <footer className="border-t border-orange-100/80 bg-[#fffaf3] px-5 py-3 dark:border-[#5a4635] dark:bg-black/20">
          <form
            className="rounded-2xl border border-orange-300 bg-white p-3 shadow-sm dark:border-orange-900 dark:bg-black/25"
            onSubmit={(event) => {
              event.preventDefault()
              if (canSend) void sendMessage(input)
            }}
          >
            <label>
              <span className="sr-only">Ask AI assistant</span>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, 2000))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    if (canSend) void sendMessage(input)
                  }
                }}
                rows={1}
                className="min-h-[46px] w-full resize-none border-0 bg-transparent text-sm leading-6 text-text-primary outline-none placeholder:text-text-secondary disabled:opacity-70 dark:text-[var(--color-app-text)] dark:placeholder:text-[var(--color-app-text-secondary)]"
                placeholder={PLACEHOLDER_PROMPTS[placeholderIndex]}
                disabled={isSending}
              />
            </label>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {[Paperclip, Sparkles, Lightbulb].map((Icon, index) => (
                  <button key={index} type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-orange-100 bg-white text-text-secondary transition hover:bg-orange-50 hover:text-orange-600 dark:border-[#5a4635] dark:bg-black/30 dark:text-gray-200 dark:hover:bg-white/5" aria-label="Composer tool">
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-text-muted dark:text-[var(--color-app-text-muted)]">{input.length} / 2000</span>
                <button type="submit" disabled={!canSend} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-orange-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </button>
              </div>
            </div>
          </form>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-text-primary dark:text-[var(--color-app-text)]">
              <Lightbulb className="h-4 w-4 text-orange-600" />
              Quick tips
            </span>
            {QUICK_TIPS.map((tip) => {
              const Icon = tip.icon
              return (
                <span key={tip.label} className="inline-flex items-center gap-1.5 rounded-lg border border-orange-100 bg-white px-3 py-1 font-medium text-text-secondary dark:border-[#5a4635] dark:bg-black/25 dark:text-gray-200">
                  <Icon className="h-3.5 w-3.5 text-orange-600 dark:text-orange-300" />
                  {tip.label}
                </span>
              )
            })}
          </div>
        </footer>
      </div>
    </div>
  )
}

function DialogWelcomeExperience({ firstName, greeting, isSending, onPrompt }) {
  return (
    <motion.section
      key="welcome"
      initial={{ opacity: 0, scale: 0.96, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, y: -8 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="flex min-h-[38vh] flex-col items-center justify-center text-center"
    >
      <div className="relative">
        <motion.div
          aria-hidden="true"
          className="absolute inset-0 rounded-2xl bg-orange-500/25 blur-xl"
          animate={{ opacity: [0.35, 0.75, 0.35], scale: [0.92, 1.08, 0.92] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-200 bg-white text-orange-600 shadow-xl shadow-orange-500/10 dark:border-orange-900 dark:bg-black/30 dark:text-orange-200">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.24 }}
        className="mt-4 max-w-3xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-600 dark:text-orange-300">
          SynTask AI
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary dark:text-[var(--color-app-text)] sm:text-3xl">
          {greeting}, {firstName}
        </h3>
        <p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-text-secondary dark:text-[var(--color-app-text-secondary)]">
          I&apos;m SynTask AI. I can help you manage tasks, CRM, HR, projects, and reports.
        </p>
      </motion.div>

      <div className="mt-5 grid w-full max-w-4xl grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {QUICK_ACTIONS.map((action, index) => {
          const Icon = action.icon
          return (
            <motion.button
              key={action.key}
              type="button"
              disabled={isSending}
              onClick={() => onPrompt(action.prompt)}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.16 + index * 0.035, duration: 0.2 }}
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="group rounded-xl border border-orange-100 bg-white/85 p-3 text-left shadow-sm transition hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#5a4635] dark:bg-black/25 dark:hover:bg-white/5"
              aria-label={`Ask SynTask AI about ${action.label}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600 transition group-hover:bg-white dark:bg-orange-950/60 dark:text-orange-200 dark:group-hover:bg-black/30">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-text-primary dark:text-[var(--color-app-text)]">{action.label}</div>
                  <div className="mt-0.5 text-xs leading-5 text-text-secondary dark:text-[var(--color-app-text-secondary)]">
                    {action.prompt}
                  </div>
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-text-secondary dark:text-[var(--color-app-text-secondary)]">
        <MessagesSquare className="h-3.5 w-3.5" aria-hidden="true" />
        Answers stay grounded in your verified SynTask context.
      </div>
    </motion.section>
  )
}

function formatMessageTime(value) {
  return timeService.formatTime(value || timeService.now())
}
