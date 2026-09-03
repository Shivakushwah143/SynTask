import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Building2,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronsUpDown,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Gauge,
  HeartPulse,
  LayoutGrid,
  Paperclip,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { aiAPI, streamExecutiveChat } from '../api/ai'
import AnswerBlocks, { friendlyToolLabel } from '../components/ai/AnswerBlocks'
import MarkdownText from '../components/ai/MarkdownText'
import { Badge, Button, PageHeader } from '../components/ui'
import { useAuthStore } from '../store/authStore'

// ---------------------------------------------------------------------------
// Static content — capability chips, empty-state examples, quick actions
// ---------------------------------------------------------------------------

const CAPABILITIES = [
  { key: 'employees', label: 'Employees', icon: Users, prompt: 'How many active employees do we have and how is the team structured?' },
  { key: 'tasks', label: 'Tasks', icon: CheckSquare, prompt: 'Which tasks need attention right now?' },
  { key: 'projects', label: 'Projects', icon: LayoutGrid, prompt: 'Give me a status snapshot of active projects.' },
  { key: 'clients', label: 'Clients', icon: Building2, prompt: 'Give me a snapshot of our clients and their health.' },
  { key: 'sales', label: 'Sales', icon: TrendingUp, prompt: 'How is sales performing this month?' },
  { key: 'hr', label: 'HR', icon: HeartPulse, prompt: 'What is happening with HR — attendance or hiring issues?' },
  { key: 'attendance', label: 'Attendance', icon: UserCheck, prompt: 'Who is absent today?' },
  { key: 'leave', label: 'Leave', icon: CalendarClock, prompt: 'Are there pending leave requests that need approval?' },
  { key: 'payroll', label: 'Payroll', icon: Wallet, prompt: 'Is payroll ready this cycle? Summarize the status.' },
  { key: 'finance', label: 'Finance', icon: CircleDollarSign, prompt: 'Which invoices are overdue and how much is receivable?' },
  { key: 'recruitment', label: 'Recruitment', icon: ClipboardList, prompt: 'What open roles and pending interviews do we have?' },
  { key: 'meetings', label: 'Meetings', icon: CalendarClock, prompt: 'What meetings are scheduled in the coming days?' },
]

const EMPTY_STATE_EXAMPLES = [
  {
    key: 'attention',
    icon: AlertTriangle,
    label: 'What needs my attention today?',
    detail: 'Prioritized brief of issues across the company.',
    prompt: 'What needs my attention today? Give me a prioritized executive brief.',
  },
  {
    key: 'client-risk',
    icon: Building2,
    label: 'Which clients are at risk?',
    detail: 'Projects slipping, overdue work, and account health.',
    prompt: 'Which clients are at risk and why?',
  },
  {
    key: 'workload',
    icon: Gauge,
    label: 'Who has the highest workload?',
    detail: 'Task load and overdue pressure per person.',
    prompt: 'Who has the highest workload right now?',
  },
  {
    key: 'sales',
    icon: TrendingUp,
    label: 'How is sales performing?',
    detail: 'Pipeline, won deals, and follow-up risks.',
    prompt: 'How is sales performing this month?',
  },
]

const ANSWER_ACTIONS = [
  { key: 'view-clients', label: 'View clients', kind: 'navigate', path: '/clients', icon: Building2 },
  { key: 'show-risks', label: 'Show risks', kind: 'prompt', prompt: 'What are the biggest risks across the company right now?' },
  { key: 'overdue', label: 'Check overdue tasks', kind: 'prompt', prompt: 'Which tasks are overdue and who owns them?' },
  { key: 'compare', label: 'Compare teams', kind: 'prompt', prompt: 'Compare workload across teams and flag any imbalances.' },
]

const FOLLOW_UP_CHIPS = [
  { key: 'why', label: 'Why?', prompt: 'Why is that the case? Explain the drivers.' },
  { key: 'deeper', label: 'Go deeper', prompt: 'Explain that in more detail.' },
  { key: 'priority', label: 'What first?', prompt: 'What should I prioritize first?' },
]

// Backend stream phases → operational status copy.
const PHASE_LABELS = {
  accepted: 'Understanding your request…',
  routing: 'Understanding your request…',
  tools: 'Checking company data…',
  analyzing: 'Analyzing relevant records…',
  answer: 'Preparing executive summary…',
}

const CHIP_COLLAPSE_LIMIT = 6

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ExecutiveAssistant() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamPhase, setStreamPhase] = useState('accepted')
  const [error, setError] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [chipsExpanded, setChipsExpanded] = useState(false)
  const [showAttachmentNote, setShowAttachmentNote] = useState(false)

  const streamCancelRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!user?.id) return
    setConversationId(localStorage.getItem(`exec-chat-conversation:${user.id}`) || '')
  }, [user?.id])

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isStreaming, scrollToBottom])

  const stopStreaming = useCallback(() => {
    streamCancelRef.current?.()
    streamCancelRef.current = null
  }, [])

  const sendMessage = useCallback(async (rawMessage) => {
    const message = (rawMessage || '').trim()
    if (!message || isStreaming) return

    setError('')
    setInput('')
    setIsStreaming(true)
    setStreamPhase('accepted')

    const assistantId = `assistant-${Date.now()}`
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', content: message },
      { id: assistantId, role: 'assistant', content: '', blocks: [], tools: [], status: 'streaming', phase: 'accepted', usage: {} },
    ])

    const updateStreamingMessage = (updater) => {
      setMessages((current) => current.map((item) => (item.id === assistantId ? updater(item) : item)))
    }

    const cancel = streamExecutiveChat(
      {
        message,
        conversation_id: conversationId || undefined,
        session_id: sessionId || undefined,
      },
      {
        onStatus: (event) => {
          const phase = event.phase || 'tools'
          updateStreamingMessage((item) => ({ ...item, phase }))
          setStreamPhase(phase)
        },
        onToken: (text) => {
          updateStreamingMessage((item) => ({ ...item, content: item.content + text }))
        },
        onDone: (data) => {
          const tools = (data?.tool_calls_summary || []).map((summary) => ({
            label: friendlyToolLabel(summary?.tool),
            durationMs: summary?.duration_ms,
            hasError: Boolean(summary?.has_error),
          }))
          updateStreamingMessage((item) => ({
            ...item,
            content: item.content.trim() || data?.answer || 'I could not generate a response.',
            blocks: Array.isArray(data?.answer_blocks) ? data.answer_blocks : [],
            tools,
            usage: data?.usage || {},
            status: 'complete',
          }))
          if (data?.conversation_id) {
            setConversationId(data.conversation_id)
            if (user?.id) localStorage.setItem(`exec-chat-conversation:${user.id}`, data.conversation_id)
          }
          if (data?.session_id) setSessionId(data.session_id)
          setIsStreaming(false)
        },
        onError: (err) => {
          const detail = err?.message || 'The request failed on the server.'
          updateStreamingMessage((item) => ({
            ...item,
            content: item.content || 'I could not complete that request.',
            status: 'error',
          }))
          setError(detail)
          setIsStreaming(false)
        },
      },
    )
    streamCancelRef.current = cancel
  }, [conversationId, isStreaming, scrollToBottom, sessionId, user?.id])

  const firePrompt = useCallback((item) => {
    if (!item) return
    void sendMessage(item.prompt || item.label)
  }, [sendMessage])

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage(input)
    }
  }

  const handleAnswerAction = (action) => {
    if (action.kind === 'navigate' && action.path) navigate(action.path)
    else void sendMessage(action.prompt)
  }

  const statusBadge = () => {
    if (isStreaming) return <Badge label="Investigating live" colorKey="in_progress" />
    if (error) return <Badge label="Error" colorKey="critical" />
    return <Badge label="Live company data" colorKey="active" />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Executive Operations Agent"
        description="Company-wide intelligence across SynTask — ask anything about how the business is running."
        actions={<div className="flex flex-wrap items-center gap-2">{statusBadge()}</div>}
      />

      {error ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-red-800 dark:text-red-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <div className="font-semibold">Executive Agent request failed</div>
              <div className="mt-0.5 text-sm opacity-90">{error}</div>
              {/disabled|not enabled|EXECUTIVE_AGENT_ENABLED/i.test(error) ? (
                <div className="mt-0.5 text-xs opacity-80">The Executive Operations Agent is not enabled for this workspace.</div>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={() => setError('')} className="shrink-0 text-red-400 hover:text-red-600" aria-label="Dismiss error">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <CapabilitiesCard
        expanded={chipsExpanded}
        onToggle={() => setChipsExpanded((value) => !value)}
        disabled={isStreaming}
        onPick={firePrompt}
      />

      <section className="card flex min-h-[480px] flex-col overflow-hidden lg:h-[calc(100vh-22rem)]">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6" data-testid="exec-chat-scroll">
          {messages.length === 0 ? (
            <EmptyStateExperience firstName={user?.first_name || 'there'} onPrompt={firePrompt} busy={isStreaming} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  onAction={handleAnswerAction}
                  onFollowUp={firePrompt}
                />
              ))}
            </div>
          )}
        </div>

        <Composer
          value={input}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          onSend={() => void sendMessage(input)}
          disabled={isStreaming}
          onStop={stopStreaming}
          attachmentNote={showAttachmentNote}
          onAttachmentClick={() => {
            setShowAttachmentNote(true)
            window.setTimeout(() => setShowAttachmentNote(false), 2200)
          }}
        />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Capability chips — compact, scrollable, collapsible
// ---------------------------------------------------------------------------

function CapabilitiesCard({ expanded, onToggle, disabled, onPick }) {
  const visible = expanded ? CAPABILITIES : CAPABILITIES.slice(0, CHIP_COLLAPSE_LIMIT)
  return (
    <section className="card p-3.5">
      <div className="flex items-center gap-2 px-1 pb-2.5">
        <LayoutGrid className="h-4 w-4 text-primary-500 dark:text-primary-300" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Capabilities</span>
        <span className="hidden text-xs text-gray-400 dark:text-gray-500 sm:inline">— tap to ask across SynTask</span>
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
          {expanded ? 'Collapse' : 'All capabilities'}
        </button>
      </div>
      <div className={expanded ? 'flex flex-wrap gap-2' : 'flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]'}>
        {visible.map((capability) => {
          const Icon = capability.icon
          return (
            <button
              key={capability.key}
              type="button"
              disabled={disabled}
              onClick={() => onPick(capability)}
              className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900/50 dark:text-gray-300 dark:hover:border-primary-800 dark:hover:bg-primary-950/30 dark:hover:text-primary-200"
              title={capability.prompt}
            >
              <Icon className="h-3.5 w-3.5 text-gray-400 transition group-hover:text-primary-500 dark:text-gray-500" aria-hidden="true" />
              {capability.label}
            </button>
          )
        })}
        {!expanded ? (
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:border-primary-300 hover:text-primary-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-primary-800"
          >
            +{CAPABILITIES.length - CHIP_COLLAPSE_LIMIT} more
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Empty state — sells the agent instead of showing a blank chat
// ---------------------------------------------------------------------------

function EmptyStateExperience({ firstName, onPrompt, busy }) {
  return (
    <div className="mx-auto flex min-h-[420px] max-w-3xl flex-col items-center justify-center px-2 py-8 text-center">
      <div className="relative">
        <div aria-hidden="true" className="absolute inset-0 rounded-[1.75rem] bg-primary-500/15 blur-2xl" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.75rem] border border-primary-200 bg-white text-primary-600 shadow-lg shadow-primary-500/10 dark:border-primary-800 dark:bg-gray-950 dark:text-primary-300">
          <Bot className="h-7 w-7" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-primary-600 dark:text-primary-300">
        Executive Operations Agent
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-gray-50 sm:text-3xl">
        What would you like to know about your company, {firstName}?
      </h3>
      <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">
        Ask across employees, tasks, projects, clients, sales, HR, finance and more — every answer is grounded in live SynTask data.
      </p>

      <div className="mt-7 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
        {EMPTY_STATE_EXAMPLES.map((example) => {
          const Icon = example.icon
          return (
            <button
              key={example.key}
              type="button"
              disabled={busy}
              onClick={() => onPrompt(example)}
              className="group rounded-2xl border border-gray-200 bg-white/70 p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-gray-900/40 dark:hover:border-primary-800"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-300">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-gray-50">{example.label}</span>
                  <span className="mt-0.5 block text-xs leading-4 text-gray-500 dark:text-gray-400">{example.detail}</span>
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-gray-400 dark:text-gray-500">
        <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" /> Company-scoped</span>
        <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-primary-500" aria-hidden="true" /> Structured briefs</span>
        <span className="inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" /> No invented numbers</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------

function Composer({ value, onChange, onKeyDown, onSend, disabled, onStop, attachmentNote, onAttachmentClick }) {
  return (
    <div className="border-t border-gray-200 px-4 py-3.5 dark:border-gray-800 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <form
          onSubmit={(event) => { event.preventDefault(); onSend() }}
          className="rounded-2xl border border-gray-300 bg-white shadow-sm transition focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100 dark:border-gray-700 dark:bg-gray-950/70 dark:focus-within:ring-primary-900/40"
        >
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            onInput={(event) => {
              const node = event.currentTarget
              node.style.height = 'auto'
              node.style.height = `${Math.min(node.scrollHeight, 176)}px`
            }}
            rows={1}
            placeholder="Ask anything about your company…"
            aria-label="Ask the Executive Operations Agent"
            disabled={disabled}
            className="block max-h-44 min-h-[58px] w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-6 text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
            <div className="relative">
              <button
                type="button"
                disabled={disabled}
                onClick={onAttachmentClick}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                aria-label="Attach a file"
                title="Attach a file"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              {attachmentNote ? (
                <span className="absolute bottom-11 left-0 z-10 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-md dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  File attachments are not supported yet.
                </span>
              ) : null}
            </div>
            {disabled ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-gray-700 dark:bg-gray-200 dark:text-gray-900 dark:hover:bg-white"
              >
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                Stop
              </button>
            ) : (
              <Button type="submit" disabled={!value.trim()} className="h-9 px-4">
                <Send className="h-4 w-4" />
                Send
              </Button>
            )}
          </div>
        </form>
        <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-gray-400 dark:text-gray-500">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Responses are grounded in live SynTask data. Enter to send · Shift+Enter for a new line.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Message rows
// ---------------------------------------------------------------------------

function MessageRow({ message, onAction, onFollowUp }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-br-md bg-primary-600 px-4 py-2.5 text-[15px] leading-6 text-white shadow-sm sm:max-w-[75%]">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    )
  }
  return (
    <AssistantCard message={message} onAction={onAction} onFollowUp={onFollowUp} />
  )
}

function AssistantCard({ message, onAction, onFollowUp }) {
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const streaming = message.status === 'streaming'
  const complete = message.status === 'complete'
  const errored = message.status === 'error'

  const phaseKey = (message.phase || 'accepted').toLowerCase()
  const phaseLabel = PHASE_LABELS[phaseKey] || PHASE_LABELS.tools
  const path = message.usage?.path || message.path

  const badge = errored ? <Badge label="Needs retry" colorKey="critical" pill className="ml-auto" />
    : streaming ? <Badge label="Investigating live" colorKey="in_progress" pill className="ml-auto" />
      : <Badge label={path === 'FAST_FACT' ? 'Instant answer' : 'Company analysis'} colorKey={path === 'FAST_FACT' ? 'active' : 'in_progress'} pill className="ml-auto" />

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/80 shadow-sm dark:border-gray-800 dark:bg-gray-950/60 sm:max-w-[94%]" data-testid="assistant-card">
        <div className="flex items-center gap-2.5 border-b border-gray-200/80 px-4 py-2.5 dark:border-gray-800/70">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Executive Agent</span>
          {badge}
        </div>

        <div className="px-4 py-3.5 sm:px-5">
          {streaming ? (
            <div className="space-y-3">
              <StreamStatusRow phaseKey={phaseKey} phaseLabel={phaseLabel} />
              {message.content ? <MarkdownText content={message.content} /> : <StreamingDots />}
            </div>
          ) : (
            <MarkdownText content={message.content} />
          )}

          {complete && message.blocks?.length ? (
            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-800/70">
              <AnswerBlocks blocks={message.blocks} />
            </div>
          ) : null}

          {complete && !errored ? (
            <div className="mt-3.5 space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Next:</span>
                {ANSWER_ACTIONS.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={() => onAction(action)}
                    className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-primary-800 dark:hover:bg-primary-950/30 dark:hover:text-primary-200"
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Follow up:</span>
                {FOLLOW_UP_CHIPS.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => onFollowUp(chip)}
                    className="text-xs font-medium text-primary-600 underline decoration-primary-300 decoration-dotted underline-offset-4 transition hover:text-primary-700 dark:text-primary-300 dark:hover:text-primary-200"
                  >
                    “{chip.label}”
                  </button>
                ))}
              </div>

              {message.tools?.length ? (
                <div className="rounded-xl border border-gray-200 bg-white/70 dark:border-gray-800 dark:bg-gray-900/40">
                  <button
                    type="button"
                    onClick={() => setSourcesOpen((value) => !value)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left"
                    aria-expanded={sourcesOpen}
                  >
                    <FileText className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Sources checked</span>
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {message.tools.length}
                    </span>
                    <ChevronDown className={`ml-auto h-3.5 w-3.5 text-gray-400 transition-transform ${sourcesOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>
                  {sourcesOpen ? (
                    <ul className="border-t border-gray-100 px-3 py-2 dark:border-gray-800/70" data-testid="sources-list">
                      {message.tools.map((tool, index) => (
                        <li key={`tool-${index}`} className="flex items-center justify-between gap-3 py-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="inline-flex items-center gap-1.5">
                            <ShieldCheck className={`h-3 w-3 ${tool.hasError ? 'text-red-400' : 'text-emerald-500'}`} aria-hidden="true" />
                            {tool.label}
                          </span>
                          {tool.durationMs != null ? (
                            <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">{Math.round(tool.durationMs)} ms</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function StreamStatusRow({ phaseKey, phaseLabel }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300" data-testid="stream-status">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-500" />
      </span>
      {phaseLabel}
      {phaseKey === 'tools' ? <span className="text-xs font-normal text-gray-400 dark:text-gray-500">(live company data)</span> : null}
    </div>
  )
}

function StreamingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2" aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600"
          style={{ animation: 'exec-pulse 1.2s ease-in-out infinite', animationDelay: `${dot * 0.18}s` }}
        />
      ))}
    </div>
  )
}
