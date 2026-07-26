import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Clock3,
  LibraryBig,
  Lightbulb,
  MessageSquareText,
  Sparkles,
  Wand2,
  Activity,
  Zap,
  Users,
  TrendingUp,
  Copy,
  Mail,
  LayoutDashboard,
  Filter,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  PieChart,
  Target,
  Award,
  User,
  Building2,
  Calendar,
  FileText,
  Send,
  Edit3,
  Eye,
  Download,
  Upload,
  Settings,
  HelpCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { aiAPI } from '../api/ai'
import { agentsAPI } from '../api/agents'
import { Button, PageHeader, Badge, FormField, inputClassName } from '../components/ui'

const QUICK_ACTIONS = [
  { label: 'Open AI Chat', path: '/ai-assistant', icon: MessageSquareText, color: 'blue' },
  { label: 'Creative Director', path: '/creative-director', icon: Wand2, color: 'purple' },
  { label: 'Marketing Strategist', path: '/ai-prioritization', icon: Sparkles, color: 'green' },
  { label: 'Review reports', path: '/reports', icon: LibraryBig, color: 'orange' },
]

const EMPLOYEES = [
  {
    id: 'creative-director',
    title: 'Creative Director',
    description: 'Reviews assets, compares versions, and surfaces approval risks.',
    status: 'active',
    path: '/creative-director',
    icon: Wand2,
  },
  {
    id: 'marketing-strategist',
    title: 'Marketing Strategist',
    description: 'Prioritizes campaign actions and flags delivery pressure.',
    status: 'active',
    path: '/ai-prioritization',
    icon: Sparkles,
  },
  {
    id: 'workspace-assistant',
    title: 'Workspace Assistant',
    description: 'Answers questions using verified project, task, and conversation context.',
    status: 'listening',
    path: '/ai-assistant',
    icon: MessageSquareText,
  },
  {
    id: 'project-agent',
    title: 'Project Agent',
    description: 'Read-only project guidance with server-selected specialists.',
    status: 'read-only',
    path: null,
    icon: LayoutDashboard,
  },
  {
    id: 'email-draft-agent',
    title: 'Email Draft Agent',
    description: 'Creates editable internal or external drafts. Sending is unavailable.',
    status: 'draft-only',
    path: null,
    icon: Mail,
  },
  {
    id: 'task-performance-agent',
    title: 'Task Performance Insights',
    description: 'Explains deterministic operational metrics for authorized leads and managers.',
    status: 'read-only',
    path: null,
    icon: TrendingUp,
  },
]

const EMAIL_DRAFT_TYPES = [
  ['general', 'General professional email'],
  ['internal_update', 'Internal update'],
  ['project_update', 'Project status update'],
  ['task_update', 'Task status update'],
  ['client_update', 'Client update'],
  ['meeting_follow_up', 'Meeting follow-up'],
  ['information_request', 'Information request'],
  ['approval_request', 'Approval request'],
  ['action_request', 'Action request'],
]

const TASK_PERFORMANCE_METRICS = [
  ['task_completion_rate', 'Completion rate'],
  ['task_on_time_completion_rate', 'On-time completion'],
  ['task_overdue_rate', 'Overdue rate'],
  ['task_cycle_time', 'Cycle time'],
  ['estimate_variance_hours', 'Estimate variance'],
  ['workload_count', 'Workload count'],
  ['workload_effort_hours', 'Workload hours'],
  ['workload_effort_story_points', 'Workload story points'],
  ['task_eod_consistency', 'Task/EOD consistency'],
]

const PROJECT_AGENT_OPERATIONS = [
  ['project_summary', 'Project summary'],
  ['decompose_scope', 'Decompose scope'],
  ['identify_risks', 'Identify risks'],
  ['execution_guidance', 'Execution guidance'],
  ['review_plan', 'Review plan'],
  ['estimate_work', 'Estimate work'],
  ['comprehensive_project_review', 'Comprehensive review'],
]

const valueOrDash = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

const safeList = (value) => (Array.isArray(value) ? value : [])

const ResultList = ({ title, items, renderItem }) => {
  if (!items?.length) return null
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h4>
      <div className="mt-2 space-y-2">
        {items.map((item, index) => (
          <div key={item.id || item.key || item.title || index} className="text-sm text-gray-700 dark:text-gray-300">
            {renderItem ? renderItem(item, index) : valueOrDash(item)}
          </div>
        ))}
      </div>
    </div>
  )
}

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
// AGENT CARD COMPONENT
// ============================================================
const AgentCard = ({ employee, onClick }) => {
  const Icon = employee.icon
  const statusColors = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    listening: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    'draft-only': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    'read-only': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg transition-transform group-hover:scale-110">
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {employee.title}
            </h3>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[employee.status]}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
              {employee.status}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400 line-clamp-2">
            {employee.description}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
            <span>Open workspace</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </button>
  )
}

// ============================================================
// QUICK ACTION CARD
// ============================================================
const QuickActionCard = ({ action, onClick }) => {
  const Icon = action.icon
  const colorMap = {
    blue: 'from-blue-500 to-cyan-500',
    purple: 'from-purple-500 to-pink-500',
    green: 'from-emerald-500 to-teal-500',
    orange: 'from-amber-500 to-orange-500',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r ${colorMap[action.color] || 'from-indigo-500 to-purple-500'} text-white shadow-lg transition-transform group-hover:scale-110`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">
          {action.label}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
          Click to open
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-1 dark:text-gray-500" />
    </button>
  )
}

// ============================================================
// RECOMMENDATION CARD
// ============================================================
const RecommendationCard = ({ suggestion, index }) => {
  const icons = [Sparkles, Zap, Target, Award]
  const colors = ['from-indigo-500 to-purple-500', 'from-emerald-500 to-teal-500', 'from-blue-500 to-cyan-500', 'from-amber-500 to-orange-500']
  const Icon = icons[index % icons.length]
  const color = colors[index % colors.length]

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:scale-[1.02] hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700 cursor-pointer">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r ${color} text-white shadow-lg transition-transform group-hover:scale-110`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-sm font-medium text-gray-900 dark:text-white">{suggestion}</span>
      </div>
    </div>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function AIHub() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [projectAgentSubmitting, setProjectAgentSubmitting] = useState(false)
  const [projectAgentRun, setProjectAgentRun] = useState(null)
  const [projectAgentForm, setProjectAgentForm] = useState({
    project_id: '',
    task_id: '',
    operation: 'project_summary',
    user_request: '',
    selected_task_ids: '',
    selected_milestone_ids: '',
  })
  const [emailDraftSubmitting, setEmailDraftSubmitting] = useState(false)
  const [emailDraftForm, setEmailDraftForm] = useState({
    draft_type: 'general',
    purpose: '',
    recipient_name: '',
    recipient_email: '',
    internal_or_external: 'internal',
    tone: 'professional',
    language: 'en',
    detail_level: 'standard',
    call_to_action: '',
    user_instructions: '',
    attachment_names: '',
  })
  const [emailDraftRun, setEmailDraftRun] = useState(null)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [taskPerformanceSubmitting, setTaskPerformanceSubmitting] = useState(false)
  const [taskPerformanceRun, setTaskPerformanceRun] = useState(null)
  const [taskPerformanceForm, setTaskPerformanceForm] = useState({
    insight_type: 'team_summary',
    start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
    department_id: '',
    project_id: '',
    user_id: '',
    metric_keys: ['task_completion_rate', 'task_overdue_rate', 'workload_count'],
    detail_level: 'standard',
    format: 'summary',
    user_request: '',
  })

  const loadData = useCallback(async () => {
    try {
      const response = await aiAPI.listLogs(12)
      setLogs(Array.isArray(response) ? response : [])
    } catch (error) {
      toast.error('Failed to load AI activity')
      setLogs([])
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await loadData()
    } finally {
      setRefreshing(false)
    }
  }

  const updateEmailDraftForm = (field, value) => {
    setEmailDraftForm((state) => ({ ...state, [field]: value }))
  }

  const updateProjectAgentForm = (field, value) => {
    setProjectAgentForm((state) => ({ ...state, [field]: value }))
  }

  const updateTaskPerformanceForm = (field, value) => {
    setTaskPerformanceForm((state) => ({ ...state, [field]: value }))
  }

  const toggleTaskMetric = (metricKey) => {
    setTaskPerformanceForm((state) => {
      const selected = new Set(state.metric_keys)
      if (selected.has(metricKey)) selected.delete(metricKey)
      else selected.add(metricKey)
      return { ...state, metric_keys: Array.from(selected) }
    })
  }

  const splitCsv = (value) => value.split(',').map((item) => item.trim()).filter(Boolean)

  const handleRunProjectAgent = async (event) => {
    event.preventDefault()
    if (!projectAgentForm.project_id.trim() || !projectAgentForm.user_request.trim()) {
      toast.error('Project ID and request are required')
      return
    }
    try {
      setProjectAgentSubmitting(true)
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `project-agent-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const response = await agentsAPI.createProjectRun({
        schema_version: '1.0',
        project_id: projectAgentForm.project_id,
        task_id: projectAgentForm.task_id || null,
        operation: projectAgentForm.operation,
        user_request: projectAgentForm.user_request,
        selected_record_ids: {
          task_ids: splitCsv(projectAgentForm.selected_task_ids),
          milestone_ids: splitCsv(projectAgentForm.selected_milestone_ids),
          dependency_ids: [],
          document_ids: [],
        },
        requested_focus: null,
        idempotency_key: idempotencyKey,
        session_id: `project-agent:${projectAgentForm.project_id}`,
        conversation_id: idempotencyKey,
      })
      setProjectAgentRun(response)
      toast.success('Project Agent request started')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Project Agent unavailable')
    } finally {
      setProjectAgentSubmitting(false)
    }
  }

  const handleGenerateEmailDraft = async (event) => {
    event.preventDefault()
    if (!emailDraftForm.purpose.trim()) {
      toast.error('Purpose is required')
      return
    }
    try {
      setEmailDraftSubmitting(true)
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `email-draft-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const response = await agentsAPI.createEmailDraftRun({
        schema_version: '1.0',
        draft_type: emailDraftForm.draft_type,
        purpose: emailDraftForm.purpose,
        recipient: {
          name: emailDraftForm.recipient_name || null,
          email: emailDraftForm.recipient_email || null,
        },
        internal_or_external: emailDraftForm.internal_or_external,
        related_context: {},
        user_instructions: emailDraftForm.user_instructions || null,
        tone: emailDraftForm.tone,
        language: emailDraftForm.language,
        detail_level: emailDraftForm.detail_level,
        call_to_action: emailDraftForm.call_to_action || null,
        attachment_names: emailDraftForm.attachment_names.split(',').map((item) => item.trim()).filter(Boolean),
        idempotency_key: idempotencyKey,
      })
      setEmailDraftRun(response)
      setDraftSubject(response?.sanitized_result?.subject || '')
      setDraftBody(response?.sanitized_result?.body || '')
      toast.success('Draft generated successfully! ✨')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Email Draft Agent unavailable')
    } finally {
      setEmailDraftSubmitting(false)
    }
  }

  const copyDraft = async () => {
    await navigator.clipboard.writeText(`Subject: ${draftSubject}\n\n${draftBody}`)
    toast.success('Draft copied to clipboard! 📋')
  }

  const handleRunTaskPerformance = async (event) => {
    event.preventDefault()
    if (!taskPerformanceForm.metric_keys.length) {
      toast.error('Select at least one metric')
      return
    }
    try {
      setTaskPerformanceSubmitting(true)
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `task-performance-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const response = await agentsAPI.createTaskPerformanceRun({
        schema_version: '1.0',
        insight_type: taskPerformanceForm.insight_type,
        scope: {
          department_id: taskPerformanceForm.department_id || null,
          project_id: taskPerformanceForm.project_id || null,
          user_id: taskPerformanceForm.user_id || null,
        },
        date_range: {
          start: `${taskPerformanceForm.start}T00:00:00Z`,
          end: `${taskPerformanceForm.end}T23:59:59Z`,
        },
        metric_keys: taskPerformanceForm.metric_keys,
        user_request: taskPerformanceForm.user_request || null,
        preferences: {
          language: 'en',
          detail_level: taskPerformanceForm.detail_level,
          format: taskPerformanceForm.format,
        },
        idempotency_key: idempotencyKey,
      })
      setTaskPerformanceRun(response)
      toast.success('Insights generated successfully! 📊')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Task Performance Agent unavailable')
    } finally {
      setTaskPerformanceSubmitting(false)
    }
  }

  const emailDraftWarnings = emailDraftRun?.sanitized_result?.warnings || {}

  const metrics = useMemo(() => {
    const successful = logs.filter((item) => item.status === 'success').length
    const pending = logs.filter((item) => item.status !== 'success').length
    return [
      { 
        label: 'Active AI Employees', 
        value: EMPLOYEES.length,
        icon: Users,
        color: 'indigo',
        subtitle: 'Working alongside your team'
      },
      { 
        label: 'Recent Actions', 
        value: logs.length,
        icon: Activity,
        color: 'blue',
        subtitle: 'Last 24 hours'
      },
      { 
        label: 'Success Rate', 
        value: logs.length > 0 ? `${Math.round((successful / logs.length) * 100)}%` : '—',
        icon: TrendingUp,
        color: 'emerald',
        subtitle: 'AI task completion'
      },
      { 
        label: 'Pending Tasks', 
        value: pending,
        icon: Clock3,
        color: 'amber',
        subtitle: 'In progress'
      },
    ]
  }, [logs])

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ============================================================ */}
      {/* HERO SECTION - Gradient with Glassmorphism */}
      {/* ============================================================ */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 p-6 text-white shadow-xl md:p-8">
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
                <h1 className="text-2xl font-bold md:text-3xl">AI Hub</h1>
                <p className="mt-1 text-indigo-100">
                  Your command center for AI employees, approvals, and verified recommendations.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                AI-first
              </span>
              <button 
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30 disabled:opacity-50"
              >
                {refreshing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </>
                )}
              </button>
              <button 
                onClick={() => navigate('/ai-assistant')}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30"
              >
                <MessageSquareText className="h-4 w-4" />
                Open AI Chat
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* STAT CARDS - 4 Cards with Gradients */}
      {/* ============================================================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <StatCard 
            key={metric.label} 
            label={metric.label} 
            value={metric.value} 
            icon={metric.icon} 
            color={metric.color}
            subtitle={metric.subtitle}
          />
        ))}
      </div>

      {/* ============================================================ */}
      {/* AI EMPLOYEES & QUICK ACTIONS */}
      {/* ============================================================ */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* AI Employees */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <SectionHeader 
            icon={Bot}
            title="AI Employees"
            description="Specialized AI teammates at your service"
          />
          <div className="p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {EMPLOYEES.map((employee) => (
                <AgentCard 
                  key={employee.id}
                  employee={employee}
                  onClick={() => employee.path ? navigate(employee.path) : document.getElementById(employee.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <SectionHeader 
            icon={Zap}
            title="Quick Actions"
            description="High-value workflows"
          />
          <div className="p-4">
            <div className="space-y-3">
              {QUICK_ACTIONS.map((action) => (
                <QuickActionCard 
                  key={action.label}
                  action={action}
                  onClick={() => navigate(action.path)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* PROJECT AGENT */}
      {/* ============================================================ */}
      <div id="project-agent" className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader
          icon={LayoutDashboard}
          title="Project Agent"
          description="Read-only project guidance. Specialist routing is server-selected."
          action={<Badge label="Read only" colorKey="scheduled" />}
        />
        <div className="p-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            <AlertCircle className="mr-2 inline h-4 w-4" />
            Backend authentication resolves tenant and authorization. This form cannot choose a department specialist or mutate project records.
          </div>
          <form onSubmit={handleRunProjectAgent} className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Project ID" required>
                  <input className={inputClassName} value={projectAgentForm.project_id} onChange={(event) => updateProjectAgentForm('project_id', event.target.value)} placeholder="Authorized project ID" />
                </FormField>
                <FormField label="Task ID">
                  <input className={inputClassName} value={projectAgentForm.task_id} onChange={(event) => updateProjectAgentForm('task_id', event.target.value)} placeholder="Optional authorized task ID" />
                </FormField>
                <FormField label="Operation">
                  <select className={inputClassName} value={projectAgentForm.operation} onChange={(event) => updateProjectAgentForm('operation', event.target.value)}>
                    {PROJECT_AGENT_OPERATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </FormField>
                <FormField label="Selected Task IDs">
                  <input className={inputClassName} value={projectAgentForm.selected_task_ids} onChange={(event) => updateProjectAgentForm('selected_task_ids', event.target.value)} placeholder="Optional comma-separated IDs" />
                </FormField>
                <FormField label="Selected Milestone IDs">
                  <input className={inputClassName} value={projectAgentForm.selected_milestone_ids} onChange={(event) => updateProjectAgentForm('selected_milestone_ids', event.target.value)} placeholder="Optional comma-separated IDs" />
                </FormField>
              </div>
              <FormField label="Request" required>
                <textarea rows={4} className={`${inputClassName} min-h-24`} value={projectAgentForm.user_request} onChange={(event) => updateProjectAgentForm('user_request', event.target.value)} placeholder="Ask for project summary, risk review, scope breakdown, or execution guidance..." />
              </FormField>
              <button
                type="submit"
                disabled={projectAgentSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
              >
                {projectAgentSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Running...
                  </>
                ) : (
                  <>
                    <LayoutDashboard className="h-4 w-4" />
                    Run Project Agent
                  </>
                )}
              </button>
            </section>

            <section className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Result</h3>
                  {projectAgentRun ? <Badge label={projectAgentRun.state || 'created'} colorKey={projectAgentRun.state || 'scheduled'} /> : <Badge label="Not run" colorKey="scheduled" />}
                </div>
                {projectAgentRun?.sanitized_result ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Summary</div>
                      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{projectAgentRun.sanitized_result.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge label={projectAgentRun.sanitized_result.read_only ? 'Read only' : 'Review required'} colorKey="scheduled" />
                        <Badge label={projectAgentRun.sanitized_result.approval_required ? 'Approval required' : 'Proposal only'} colorKey="scheduled" />
                        <Badge label={`confidence ${valueOrDash(projectAgentRun.sanitized_result.overall_confidence)}`} colorKey="scheduled" />
                      </div>
                    </div>
                    {projectAgentRun.sanitized_result.department_specialist ? (
                      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
                        <div className="font-semibold">Server-selected specialist</div>
                        <div className="mt-1">Pack: {valueOrDash(projectAgentRun.sanitized_result.department_specialist.pack_id)}</div>
                        <div>Specialist: {valueOrDash(projectAgentRun.sanitized_result.department_specialist.specialist_id)} @{valueOrDash(projectAgentRun.sanitized_result.department_specialist.specialist_version)}</div>
                        <div>Reason: {valueOrDash(projectAgentRun.sanitized_result.department_specialist.selection_reason)}</div>
                        {projectAgentRun.sanitized_result.department_specialist.fallback_reason ? <div>Fallback: {projectAgentRun.sanitized_result.department_specialist.fallback_reason}</div> : null}
                      </div>
                    ) : null}
                    <ResultList title="Recommendations" items={safeList(projectAgentRun.sanitized_result.recommendations)} renderItem={(item) => <><span className="font-medium">{valueOrDash(item.title)}</span><p className="text-xs text-gray-500 dark:text-gray-400">{valueOrDash(item.rationale || item.description)}</p></>} />
                    <ResultList title="Risks" items={safeList(projectAgentRun.sanitized_result.risks)} renderItem={(item) => <><span className="font-medium">{valueOrDash(item.title)}</span><p className="text-xs text-gray-500 dark:text-gray-400">{valueOrDash(item.description)}</p></>} />
                    <ResultList title="Missing Information" items={safeList(projectAgentRun.sanitized_result.missing_data)} renderItem={(item) => `${valueOrDash(item.field)}: ${valueOrDash(item.reason)}`} />
                  </div>
                ) : (
                  <p className="rounded-lg bg-white p-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-400">
                    Run metadata will appear here. Completed output appears after backend returns validated result.
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <AlertCircle className="mr-1 inline h-3 w-3" />
                No task creation, assignment, status move, deadline update, approval execution, or direct specialist invocation is available.
              </p>
            </section>
          </form>
        </div>
      </div>

      {/* ============================================================ */}
      {/* TASK PERFORMANCE INSIGHTS */}
      {/* ============================================================ */}
      <div id="task-performance-agent" className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={TrendingUp}
          title="Task Performance Insights"
          description="Read-only deterministic metrics. No employee ranking or employment decisions."
          action={<Badge label="Proposal only" colorKey="scheduled" />}
        />
        <div className="p-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertCircle className="mr-2 inline h-4 w-4" />
            Missing data lowers confidence. EOD is employee-reported. Approved leave is non-punitive. Attendance is not productivity.
          </div>

          <form onSubmit={handleRunTaskPerformance} className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Insight Type">
                  <select className={inputClassName} value={taskPerformanceForm.insight_type} onChange={(event) => updateTaskPerformanceForm('insight_type', event.target.value)}>
                    {['team_summary', 'department_summary', 'project_summary', 'individual_summary', 'completion_trends', 'overdue_trends', 'workload_distribution', 'estimate_variance', 'data_quality'].map((item) => (
                      <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={item} value={item}>{item.replaceAll('_', ' ')}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Detail Level">
                  <select className={inputClassName} value={taskPerformanceForm.detail_level} onChange={(event) => updateTaskPerformanceForm('detail_level', event.target.value)}>
                    {['concise', 'standard', 'detailed'].map((item) => <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={item} value={item}>{item}</option>)}
                  </select>
                </FormField>
                <FormField label="Start Date">
                  <input type="date" className={inputClassName} value={taskPerformanceForm.start} onChange={(event) => updateTaskPerformanceForm('start', event.target.value)} />
                </FormField>
                <FormField label="End Date">
                  <input type="date" className={inputClassName} value={taskPerformanceForm.end} onChange={(event) => updateTaskPerformanceForm('end', event.target.value)} />
                </FormField>
                <FormField label="Department ID">
                  <input className={inputClassName} value={taskPerformanceForm.department_id} onChange={(event) => updateTaskPerformanceForm('department_id', event.target.value)} placeholder="Optional" />
                </FormField>
                <FormField label="Project ID">
                  <input className={inputClassName} value={taskPerformanceForm.project_id} onChange={(event) => updateTaskPerformanceForm('project_id', event.target.value)} placeholder="Optional" />
                </FormField>
                <FormField label="User ID">
                  <input className={inputClassName} value={taskPerformanceForm.user_id} onChange={(event) => updateTaskPerformanceForm('user_id', event.target.value)} placeholder="Optional" />
                </FormField>
                <FormField label="Format">
                  <select className={inputClassName} value={taskPerformanceForm.format} onChange={(event) => updateTaskPerformanceForm('format', event.target.value)}>
                    {['summary', 'report', 'dashboard'].map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Metric Selectors">
                <div className="grid gap-2 sm:grid-cols-2">
                  {TASK_PERFORMANCE_METRICS.map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 transition hover:border-indigo-200 dark:border-gray-700 dark:text-gray-300 dark:hover:border-indigo-700">
                      <input 
                        type="checkbox" 
                        checked={taskPerformanceForm.metric_keys.includes(value)} 
                        onChange={() => toggleTaskMetric(value)} 
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </FormField>
              <FormField label="Question">
                <textarea rows={3} className={`${inputClassName} min-h-20`} value={taskPerformanceForm.user_request} onChange={(event) => updateTaskPerformanceForm('user_request', event.target.value)} placeholder="Ask a specific question about your data..." />
              </FormField>
              <button 
                type="submit" 
                disabled={taskPerformanceSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
              >
                {taskPerformanceSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Running...
                  </>
                ) : (
                  <>
                    <TrendingUp className="h-4 w-4" />
                    Run Insights
                  </>
                )}
              </button>
            </section>

            <section className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Result</h3>
                  {taskPerformanceRun ? <Badge label={taskPerformanceRun.state || 'created'} colorKey={taskPerformanceRun.state || 'scheduled'} /> : <Badge label="Not run" colorKey="scheduled" />}
                </div>
                {taskPerformanceRun?.sanitized_result ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">AI explanation</div>
                      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{taskPerformanceRun.sanitized_result.summary}</p>
                    </div>
                    <ResultList
                      title="Immutable verified metrics"
                      items={safeList(taskPerformanceRun.sanitized_result.metrics)}
                      renderItem={(metric) => (
                        <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-800">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">{metric.key} @{metric.version}</span>
                            <Badge label={metric.status} colorKey={metric.status === 'available' ? 'completed' : 'scheduled'} />
                          </div>
                          <div className="mt-1 grid gap-1 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                            <span>Value: {valueOrDash(metric.value)} {valueOrDash(metric.unit)}</span>
                            <span>Formula: {valueOrDash(metric.formula)}</span>
                            <span>Numerator: {valueOrDash(metric.numerator)}</span>
                            <span>Denominator: {valueOrDash(metric.denominator)}</span>
                            <span>Sample size: {valueOrDash(metric.sample_size)}</span>
                            <span>Confidence: {valueOrDash(metric.confidence)}</span>
                            <span>Timezone: {valueOrDash(metric.timezone)}</span>
                            <span>Missing fields: {safeList(metric.missing_fields).join(', ') || '-'}</span>
                          </div>
                        </div>
                      )}
                    />
                    <ResultList title="Employee-reported EOD context" items={safeList(taskPerformanceRun.sanitized_result.employee_reported_context)} />
                    <ResultList title="Missing and conflicting data" items={[...safeList(taskPerformanceRun.sanitized_result.data_quality?.missing_data), ...safeList(taskPerformanceRun.sanitized_result.data_quality?.conflicts)]} />
                    <ResultList title="Hypotheses" items={safeList(taskPerformanceRun.sanitized_result.insights).filter((item) => item.fact_or_hypothesis === 'hypothesis')} renderItem={(item) => <><span className="font-medium">{item.title}</span><p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p></>} />
                    <ResultList title="Proposal-only recommendations" items={safeList(taskPerformanceRun.sanitized_result.recommendations)} renderItem={(item) => <><span className="font-medium">{item.title}</span><p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p><Badge label={item.mutation_status || 'proposal_only'} colorKey="scheduled" /></>} />
                  </div>
                ) : (
                  <p className="rounded-lg bg-white p-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-400">
                    Metrics will appear after an authorized run.
                  </p>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <AlertCircle className="mr-1 inline h-3 w-3" />
                No task reassignment, deadline change, scheduling, connector alert, ranking, score, or employment-decision action is available.
              </p>
            </section>
          </form>
        </div>
      </div>

      {/* ============================================================ */}
      {/* EMAIL DRAFT AGENT */}
      {/* ============================================================ */}
      <div id="email-draft-agent" className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Mail}
          title="Email Draft Agent"
          description="Draft only. This email has not been sent."
          action={<Badge label="No Send button" colorKey="scheduled" />}
        />
        <div className="p-4">
          <form onSubmit={handleGenerateEmailDraft} className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Email Type">
                  <select className={inputClassName} value={emailDraftForm.draft_type} onChange={(event) => updateEmailDraftForm('draft_type', event.target.value)}>
                    {EMAIL_DRAFT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </FormField>
                <FormField label="Recipient Type">
                  <select className={inputClassName} value={emailDraftForm.internal_or_external} onChange={(event) => updateEmailDraftForm('internal_or_external', event.target.value)}>
                    <option value="internal">Internal</option>
                    <option value="external">External</option>
                  </select>
                </FormField>
                <FormField label="Recipient Name">
                  <input className={inputClassName} value={emailDraftForm.recipient_name} onChange={(event) => updateEmailDraftForm('recipient_name', event.target.value)} placeholder="John Doe" />
                </FormField>
                <FormField label="Recipient Email">
                  <input type="email" className={inputClassName} value={emailDraftForm.recipient_email} onChange={(event) => updateEmailDraftForm('recipient_email', event.target.value)} placeholder="john@example.com" />
                </FormField>
                <FormField label="Tone">
                  <select className={inputClassName} value={emailDraftForm.tone} onChange={(event) => updateEmailDraftForm('tone', event.target.value)}>
                    {['professional', 'friendly', 'concise', 'formal', 'warm', 'neutral'].map((tone) => <option key={tone} value={tone}>{tone}</option>)}
                  </select>
                </FormField>
                <FormField label="Detail Level">
                  <select className={inputClassName} value={emailDraftForm.detail_level} onChange={(event) => updateEmailDraftForm('detail_level', event.target.value)}>
                    {['short', 'standard', 'detailed'].map((detail) => <option key={detail} value={detail}>{detail}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Purpose" required>
                <textarea rows={3} className={`${inputClassName} min-h-20`} value={emailDraftForm.purpose} onChange={(event) => updateEmailDraftForm('purpose', event.target.value)} placeholder="What is this email about? e.g., 'Follow up on proposal submission'" />
              </FormField>
              <FormField label="Additional Instructions">
                <textarea rows={3} className={`${inputClassName} min-h-20`} value={emailDraftForm.user_instructions} onChange={(event) => updateEmailDraftForm('user_instructions', event.target.value)} placeholder="Any specific requirements or context..." />
              </FormField>
              <FormField label="Call to Action">
                <input className={inputClassName} value={emailDraftForm.call_to_action} onChange={(event) => updateEmailDraftForm('call_to_action', event.target.value)} placeholder="e.g., 'Please review and provide feedback'" />
              </FormField>
              <FormField label="Attachment Names">
                <input className={inputClassName} value={emailDraftForm.attachment_names} onChange={(event) => updateEmailDraftForm('attachment_names', event.target.value)} placeholder="proposal.pdf, report.xlsx" />
              </FormField>
              <button 
                type="submit" 
                disabled={emailDraftSubmitting}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
              >
                {emailDraftSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Generate Draft
                  </>
                )}
              </button>
            </section>

            <section className="space-y-4">
              {emailDraftForm.internal_or_external === 'external' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertCircle className="mr-2 inline h-4 w-4" />
                  External recipient: Review facts, sensitive information, recipients and attachments before sending outside SynTask.
                </div>
              ) : null}
              {emailDraftWarnings.sensitive_data?.length ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                  <AlertCircle className="mr-2 inline h-4 w-4" />
                  Sensitive information: {emailDraftWarnings.sensitive_data.join(', ')}. Review before using.
                </div>
              ) : null}
              {emailDraftWarnings.missing_recipient ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertCircle className="mr-2 inline h-4 w-4" />
                  Missing recipient: no recipient email was verified or guessed.
                </div>
              ) : null}
              {emailDraftWarnings.attachment_reminders?.length ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                  <AlertCircle className="mr-2 inline h-4 w-4" />
                  {emailDraftWarnings.attachment_reminders.join(' ')}
                </div>
              ) : null}
              {emailDraftForm.attachment_names.trim() ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                  <AlertCircle className="mr-2 inline h-4 w-4" />
                  Attachment names are reminders only. No attachment was uploaded or added.
                </div>
              ) : null}
              <FormField label="Subject">
                <input className={inputClassName} value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)} placeholder="Generated subject appears here" />
              </FormField>
              <FormField label="Body">
                <textarea rows={11} className={`${inputClassName} min-h-60 font-mono`} value={draftBody} onChange={(event) => setDraftBody(event.target.value)} placeholder="Generated editable body appears here" />
              </FormField>
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  type="button" 
                  onClick={copyDraft} 
                  disabled={!draftSubject && !draftBody}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  <Copy className="h-4 w-4" />
                  Copy Draft
                </button>
                <button 
                  type="submit" 
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </button>
                {emailDraftRun ? <Badge label={emailDraftRun.sanitized_result?.draft_status || emailDraftRun.state || 'DRAFT'} colorKey={emailDraftRun.state || 'scheduled'} /> : null}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <AlertCircle className="mr-1 inline h-3 w-3" />
                No Send, schedule, CC/BCC, connector, or attachment action is available here.
              </p>
            </section>
          </form>
        </div>
      </div>

      {/* ============================================================ */}
      {/* RECOMMENDATIONS */}
      {/* ============================================================ */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <SectionHeader 
          icon={Lightbulb}
          title="AI Recommendations"
          description="Smart suggestions based on your recent activity"
        />
        <div className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {['Review pending approvals', 'Analyze campaign performance', 'Optimize content strategy', 'Generate weekly report'].map((suggestion, index) => (
              <RecommendationCard key={suggestion} suggestion={suggestion} index={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
