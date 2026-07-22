import { useEffect, useRef, useState } from 'react'
import {
  BarChart3,
  Bot,
  Clipboard,
  ClipboardList,
  Lightbulb,
  Loader2,
  Maximize2,
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
import { timeService } from '@/services/timeService'

const STARTER_PROMPTS = [
  { label: 'What did HR do yesterday?', icon: Sparkles },
  { label: 'Summarize today\'s blockers', icon: ClipboardList },
  { label: 'Which employees need follow-up?', icon: UserRound },
  { label: 'What should I review first today?', icon: ClipboardList },
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
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I can help with HR insights, tasks, CRM updates, blockers, and more. What would you like to know?',
      createdAt: timeService.now(),
    },
  ])
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState(null)
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef(null)

  const canSend = input.trim().length > 0 && !isSending

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => messagesEndRef.current?.scrollIntoView({ block: 'end' }), 0)
    return () => clearTimeout(timer)
  }, [isOpen, messages])

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

  const handleStarterPrompt = (prompt) => {
    setInput(prompt.label)
    void sendMessage(prompt.label)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-labelledby="ai-assistant-title">
      <div className="flex h-[min(92vh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-orange-100/80 bg-[#fffdf9] shadow-[0_28px_80px_rgba(36,28,20,0.34)] dark:border-[#5a4635] dark:bg-[rgb(29_24_19)]">
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
          <section>
            <h3 className="text-base font-semibold text-text-primary dark:text-[var(--color-app-text)]">Suggested questions</h3>
            <div className="mt-4 flex flex-wrap gap-3">
              {STARTER_PROMPTS.map((prompt) => {
                const Icon = prompt.icon
                return (
                  <button
                    key={prompt.label}
                    type="button"
                    onClick={() => handleStarterPrompt(prompt)}
                    disabled={isSending}
                    className="inline-flex min-h-14 items-center gap-3 rounded-xl border border-orange-100 bg-white px-5 text-base font-semibold text-text-secondary shadow-sm transition hover:border-orange-200 hover:bg-orange-50 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#5a4635] dark:bg-black/25 dark:text-gray-200 dark:hover:bg-white/5"
                  >
                    <Icon className="h-5 w-5 text-orange-600 dark:text-orange-300" />
                    {prompt.label}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="mt-8 space-y-6">
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
          </section>
        </main>

        <footer className="border-t border-orange-100/80 bg-[#fffaf3] px-7 py-5 dark:border-[#5a4635] dark:bg-black/20">
          <form
            className="rounded-2xl border border-orange-300 bg-white p-4 shadow-sm dark:border-orange-900 dark:bg-black/25"
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
                rows={2}
                className="min-h-[58px] w-full resize-none border-0 bg-transparent text-base leading-7 text-text-primary outline-none placeholder:text-text-secondary disabled:opacity-70 dark:text-[var(--color-app-text)] dark:placeholder:text-[var(--color-app-text-secondary)]"
                placeholder="Ask about HR, tasks, CRM, blockers, or what needs attention next..."
                disabled={isSending}
              />
            </label>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {[Paperclip, Sparkles, Lightbulb].map((Icon, index) => (
                  <button key={index} type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-orange-100 bg-white text-text-secondary transition hover:bg-orange-50 hover:text-orange-600 dark:border-[#5a4635] dark:bg-black/30 dark:text-gray-200 dark:hover:bg-white/5" aria-label="Composer tool">
                    <Icon className="h-5 w-5" />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-text-muted dark:text-[var(--color-app-text-muted)]">{input.length} / 2000</span>
                <button type="submit" disabled={!canSend} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 px-6 text-base font-semibold text-white shadow-sm transition hover:from-orange-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  Send
                </button>
              </div>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2 font-semibold text-text-primary dark:text-[var(--color-app-text)]">
              <Lightbulb className="h-5 w-5 text-orange-600" />
              Quick tips
            </span>
            {QUICK_TIPS.map((tip) => {
              const Icon = tip.icon
              return (
                <span key={tip.label} className="inline-flex items-center gap-2 rounded-xl border border-orange-100 bg-white px-4 py-2 font-medium text-text-secondary dark:border-[#5a4635] dark:bg-black/25 dark:text-gray-200">
                  <Icon className="h-4 w-4 text-orange-600 dark:text-orange-300" />
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

function formatMessageTime(value) {
  return timeService.formatTime(value || timeService.now())
}
