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
  BarChart3,
  DollarSign,
  HelpCircle,
  LayoutDashboard,
  Filter,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  TrendingUp,
  Award,
  Target,
  Activity,
  MessageSquare,
  Zap,
  Users,
  Building2,
  Mail,
  Phone,
  MapPin,
  Star,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Copy,
  Download,
  Eye,
  Edit,
  Trash,
  Settings,
  Menu,
  X
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { aiAPI } from '../api/ai'
import { useAuthStore } from '../store/authStore'
import { Badge, Button, PageHeader, inputClassName } from '../components/ui'

// ============================================================
// STAT CARD COMPONENT
// ============================================================
const StatCard = ({ label, value, icon: Icon, color = 'indigo', subtitle }) => {
  const colors = {
    indigo: 'from-indigo-500 to-purple-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    rose: 'from-rose-500 to-pink-500',
    blue: 'from-blue-500 to-cyan-500',
    teal: 'from-teal-500 to-cyan-500',
  }

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`rounded-lg bg-gradient-to-r ${colors[color]} p-2 text-white shadow-lg transition-transform group-hover:scale-110`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
    </div>
  )
}

// ============================================================
// SECTION HEADER COMPONENT
// ============================================================
const SectionHeader = ({ icon: Icon, title, description, action }) => (
  <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
          <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      {action}
    </div>
  </div>
)

// ============================================================
// MESSAGE BUBBLE COMPONENT
// ============================================================
const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user'
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
        isUser 
          ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' 
          : 'border border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-100'
      }`}>
        <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] opacity-80">
          {isUser ? (
            <>
              <User className="h-3 w-3" />
              You
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" />
              Marketing Support
            </>
          )}
        </div>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}

// ============================================================
// STAT ROW COMPONENT
// ============================================================
const StatRow = ({ label, value }) => (
  <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-700">
    <dt className="text-sm text-gray-600 dark:text-gray-400">{label}</dt>
    <dd className="text-sm font-semibold text-gray-900 dark:text-white">{value}</dd>
  </div>
)

// ============================================================
// ACTION CARD COMPONENT
// ============================================================
const ActionCard = ({ action, onClick }) => {
  const Icon = action.icon
  
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg transition-transform group-hover:scale-110">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 dark:text-white">{action.label}</div>
          <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{action.detail}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1 dark:text-gray-500" />
      </div>
    </button>
  )
}

// ============================================================
// QUICK QUESTION BUTTON
// ============================================================
const QuickQuestionButton = ({ question, onClick }) => {
  const Icon = question.icon
  
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-indigo-200 hover:bg-indigo-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm text-gray-700 dark:text-gray-300">{question.label}</span>
    </button>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function MarketingChat() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const firstName = user?.first_name || 'there'

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Good morning, ${firstName}! 👋 I'm your Digital Marketing Support Assistant. I can help you with campaign status, invoices, subscriptions, support tickets, and marketing services. How can I assist you today?`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [suggestedActions, setSuggestedActions] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    // Set initial suggested actions for marketing
    setSuggestedActions([
      { label: 'View Campaigns', type: 'navigate', payload: { path: '/projects' } },
      { label: 'Check Invoices', type: 'navigate', payload: { path: '/invoices' } },
      { label: 'View Subscription', type: 'navigate', payload: { path: '/subscriptions' } },
      { label: 'Create Support Ticket', type: 'navigate', payload: { path: '/tickets' } },
    ])
  }, [])

  const actionCards = useMemo(() => {
    if (suggestedActions.length) {
      return suggestedActions.map((action, index) => ({
        key: `${action.label}-${index}`,
        icon: getActionIcon(action.type),
        label: action.label,
        detail: action.type ? `Quick action: ${action.type}` : 'Suggested follow-up',
        path: action.payload?.path || '',
      }))
    }

    return [
      { key: 'campaigns', icon: BarChart3, label: 'View Campaigns', detail: 'Check your marketing campaigns', path: '/projects' },
      { key: 'invoices', icon: DollarSign, label: 'Check Invoices', detail: 'View billing and invoices', path: '/invoices' },
      { key: 'subscription', icon: FileText, label: 'Subscription Details', detail: 'View your plan and features', path: '/subscriptions' },
      { key: 'support', icon: Ticket, label: 'Create Support Ticket', detail: 'Get help with issues', path: '/tickets' },
    ]
  }, [suggestedActions])

  // Calculate stats
  const stats = {
    totalMessages: messages.length,
    userMessages: messages.filter(m => m.role === 'user').length,
    assistantMessages: messages.filter(m => m.role === 'assistant').length,
    suggestions: actionCards.length,
  }

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
      const response = await aiAPI.marketingChat({
        message,
        history: nextMessages.slice(0, -1),
      })

      setMessages((current) => [
        ...current,
        { role: 'assistant', content: response.message },
      ])
      setSuggestedActions(Array.isArray(response.suggested_actions) ? response.suggested_actions : [])
      setLastUpdated(response.generated_at || new Date().toISOString())
    } catch (chatError) {
      setError(chatError.response?.data?.detail || chatError.message || 'Failed to generate assistant response')
    } finally {
      setLoading(false)
    }
  }

  const quickQuestions = [
    { label: 'What is my campaign status?', icon: BarChart3 },
    { label: 'Show me my recent invoices', icon: DollarSign },
    { label: 'What is my subscription plan?', icon: FileText },
    { label: 'How do I create a support ticket?', icon: Ticket },
  ]

  const handleQuickQuestion = (question) => {
    setInput(question)
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
        {/* Decorative blur circles */}
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-white/5 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-white/20 p-2.5 backdrop-blur-sm">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Marketing Support</h1>
                <p className="mt-1 text-indigo-100">
                  Your Digital Marketing Customer Success Assistant
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Online
              </span>
              <Badge label="Campaigns" colorKey="active" className="bg-white/20 text-white" />
              <Badge label="Billing" colorKey="scheduled" className="bg-white/20 text-white" />
              <Badge label="Support" colorKey="pending" className="bg-white/20 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* STAT CARDS - 4 Cards with Gradients */}
      {/* ============================================================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Total Messages" 
          value={stats.totalMessages} 
          icon={MessageSquare} 
          color="indigo"
          subtitle="All conversations"
        />
        <StatCard 
          label="Your Messages" 
          value={stats.userMessages} 
          icon={User} 
          color="blue"
          subtitle="Questions asked"
        />
        <StatCard 
          label="Assistant Responses" 
          value={stats.assistantMessages} 
          icon={Sparkles} 
          color="emerald"
          subtitle="AI replies"
        />
        <StatCard 
          label="Suggestions" 
          value={stats.suggestions} 
          icon={Zap} 
          color="amber"
          subtitle="Available actions"
        />
      </div>

      {/* ============================================================ */}
      {/* ERROR BANNER */}
      {/* ============================================================ */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          {error}
        </div>
      )}

      {/* ============================================================ */}
      {/* MAIN GRID - Chat & Sidebar */}
      {/* ============================================================ */}
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        {/* Chat Section */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 flex flex-col min-h-[72vh]">
          <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-bold text-gray-900 dark:text-white">Digital Marketing Support</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ask about campaigns, invoices, subscriptions, and more.</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 max-h-[500px]">
            {messages.map((message, index) => (
              <MessageBubble key={`${message.role}-${index}-${message.content.slice(0, 12)}`} message={message} />
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500"></div>
                    <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500 animation-delay-200"></div>
                    <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500 animation-delay-400"></div>
                    <span className="ml-1">Marketing Support is typing...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="border-t border-gray-200 p-4 dark:border-gray-700">
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about campaigns, invoices, subscriptions, or support..."
                className="min-h-[60px] flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend(e)
                  }
                }}
              />
              <button 
                type="submit" 
                disabled={loading || !input.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 self-end"
              >
                {loading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Response Status */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <SectionHeader 
              icon={Clock3}
              title="Response Status"
              description="The assistant only speaks when it has verified context."
            />
            <div className="p-4">
              <dl className="space-y-3">
                <StatRow label="Messages" value={messages.length} />
                <StatRow label="Last updated" value={lastUpdated ? format(new Date(lastUpdated), 'MMM d, HH:mm') : '-'} />
                <StatRow label="Status" value={
                  <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Online
                  </span>
                } />
              </dl>
            </div>
          </div>

          {/* Suggested Actions */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <SectionHeader 
              icon={Link2}
              title="Suggested Actions"
              description="Follow-up navigation based on the latest response."
            />
            <div className="p-4">
              <div className="space-y-3">
                {actionCards.map((action) => (
                  <ActionCard 
                    key={action.key}
                    action={action}
                    onClick={() => navigate(action.path)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Quick Questions */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <SectionHeader 
              icon={HelpCircle}
              title="Quick Questions"
              description="Common questions to get started."
            />
            <div className="p-4">
              <div className="space-y-2">
                {quickQuestions.map((question, index) => (
                  <QuickQuestionButton 
                    key={index}
                    question={question}
                    onClick={() => handleQuickQuestion(question.label)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// HELPERS
// ============================================================
function getActionIcon(type) {
  switch (type) {
    case 'navigate':
      return ArrowRight
    case 'action':
      return CheckSquare
    case 'info':
      return HelpCircle
    default:
      return Sparkles
  }
}