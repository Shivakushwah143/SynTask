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
    id: 'email-draft-agent',
    title: 'Email Draft Agent',
    description: 'Creates editable internal or external drafts. Sending is unavailable.',
    status: 'draft-only',
    path: null,
    icon: Mail,
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

export default function AIHub() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [refreshing, setRefreshing] = useState(false)
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

  const buildLocalDraftFallback = () => {
    const recipient = emailDraftForm.recipient_name || '[recipient]'
    const cta = emailDraftForm.call_to_action ? `\n\n${emailDraftForm.call_to_action}` : ''
    const detail = emailDraftForm.detail_level === 'short' ? '' : '\n\nI wanted to share this update and confirm the next step.'
    return {
      subject: emailDraftForm.purpose.slice(0, 90) || 'Draft email',
      body: `Hi ${recipient},\n\n${emailDraftForm.purpose}${detail}${cta}\n\nBest,`,
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
      const fallback = buildLocalDraftFallback()
      setEmailDraftRun(response)
      setDraftSubject(response?.sanitized_result?.subject || fallback.subject)
      setDraftBody(response?.sanitized_result?.body || fallback.body)
      toast.success('Draft run created')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Email Draft Agent unavailable')
    } finally {
      setEmailDraftSubmitting(false)
    }
  }

  const copyDraft = async () => {
    await navigator.clipboard.writeText(`Subject: ${draftSubject}\n\n${draftBody}`)
    toast.success('Draft copied')
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
        description: 'Working alongside your team'
      },
      { 
        label: 'Recent Actions', 
        value: logs.length,
        icon: Activity,
        description: 'Last 24 hours'
      },
      { 
        label: 'Success Rate', 
        value: logs.length > 0 ? `${Math.round((successful / logs.length) * 100)}%` : '—',
        icon: TrendingUp,
        description: 'AI task completion'
      },
      { 
        label: 'Pending Tasks', 
        value: pending,
        icon: Clock3,
        description: 'In progress'
      },
    ]
  }, [logs])

  return (
    <div className="space-y-8 p-4">
      <PageHeader
        title="AI Hub"
        description="Your command center for AI employees, approvals, and verified recommendations."
        actions={(
          <div className="flex flex-wrap items-center gap-3">
            <Badge label="AI-first" colorKey="active" />
            <Button variant="secondary" size="sm" onClick={handleRefresh} loading={refreshing}>
              <Clock3 className="h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={() => navigate('/ai-assistant')}>
              <MessageSquareText className="h-4 w-4" />
              Open AI Chat
            </Button>
          </div>
        )}
      />

      {/* Metrics Grid - More visual cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="card p-5 bg-surface dark:bg-black/80 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                  {metric.label}
                </p>
                <p className="mt-2 text-3xl font-semibold text-text-primary dark:text-text-primary">
                  {metric.value}
                </p>
                <p className="mt-1 text-xs text-text-muted dark:text-text-secondary">
                  {metric.description}
                </p>
              </div>
              <div className="rounded-xl bg-primary-50 p-2 dark:bg-primary-950/40">
                <metric.icon className="h-5 w-5 text-primary-600 dark:text-primary-300" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* AI Employees - Full width on mobile, 2 cols on large */}
        <div className="lg:col-span-2">
          <div className="card p-6 bg-surface dark:bg-black/85">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary dark:text-text-primary">
                  AI Employees
                </h2>
                <p className="text-sm text-text-muted dark:text-text-secondary">
                  Specialized AI teammates at your service
                </p>
              </div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
              {EMPLOYEES.map((employee) => {
                const Icon = employee.icon
                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => employee.path ? navigate(employee.path) : document.getElementById('email-draft-agent')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="group relative rounded-2xl border border-border bg-surface p-5 text-left transition-all hover:-translate-y-1 hover:border-primary-300 hover:bg-surface-muted hover:shadow-lg dark:border-border dark:bg-black/40 dark:hover:bg-white/5"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-text-primary dark:text-text-primary truncate">
                            {employee.title}
                          </h3>
                          <Badge 
                            label={employee.status} 
                            colorKey={employee.status === 'active' ? 'active' : 'scheduled'} 
                          />
                        </div>
                        <p className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary line-clamp-2">
                          {employee.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-primary-600 dark:text-primary-300 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Open workspace</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Quick Actions - 1 col on large */}
        <div className="lg:col-span-1">
          <div className="card p-6 bg-surface dark:bg-black/85 h-full">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary dark:text-text-primary">
                  Quick Actions
                </h2>
                <p className="text-sm text-text-muted dark:text-text-secondary">
                  High-value workflows
                </p>
              </div>
            </div>
            
            <div className="space-y-3">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => navigate(action.path)}
                    className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:bg-surface-muted hover:shadow-lg dark:border-border dark:bg-black/40 dark:hover:bg-white/5"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text-primary dark:text-text-primary">
                        {action.label}
                      </div>
                      <div className="text-xs text-text-muted dark:text-text-secondary truncate">
                        Click to open
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-text-muted transition-transform group-hover:translate-x-1" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div id="email-draft-agent" className="card p-6 bg-surface dark:bg-black/85">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary dark:text-text-primary">Email Draft Agent</h2>
                <p className="text-sm text-text-muted dark:text-text-secondary">Draft only. This email has not been sent.</p>
              </div>
            </div>
          </div>
          <Badge label="No Send button" colorKey="scheduled" />
        </div>

        <form onSubmit={handleGenerateEmailDraft} className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Email type">
                <select className={inputClassName} value={emailDraftForm.draft_type} onChange={(event) => updateEmailDraftForm('draft_type', event.target.value)}>
                  {EMAIL_DRAFT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </FormField>
              <FormField label="Recipient type">
                <select className={inputClassName} value={emailDraftForm.internal_or_external} onChange={(event) => updateEmailDraftForm('internal_or_external', event.target.value)}>
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </FormField>
              <FormField label="Recipient name">
                <input className={inputClassName} value={emailDraftForm.recipient_name} onChange={(event) => updateEmailDraftForm('recipient_name', event.target.value)} />
              </FormField>
              <FormField label="Recipient email">
                <input type="email" className={inputClassName} value={emailDraftForm.recipient_email} onChange={(event) => updateEmailDraftForm('recipient_email', event.target.value)} />
              </FormField>
              <FormField label="Tone">
                <select className={inputClassName} value={emailDraftForm.tone} onChange={(event) => updateEmailDraftForm('tone', event.target.value)}>
                  {['professional', 'friendly', 'concise', 'formal', 'warm', 'neutral'].map((tone) => <option key={tone} value={tone}>{tone}</option>)}
                </select>
              </FormField>
              <FormField label="Detail">
                <select className={inputClassName} value={emailDraftForm.detail_level} onChange={(event) => updateEmailDraftForm('detail_level', event.target.value)}>
                  {['short', 'standard', 'detailed'].map((detail) => <option key={detail} value={detail}>{detail}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Purpose" required>
              <textarea rows={3} className={inputClassName} value={emailDraftForm.purpose} onChange={(event) => updateEmailDraftForm('purpose', event.target.value)} />
            </FormField>
            <FormField label="Additional instructions">
              <textarea rows={3} className={inputClassName} value={emailDraftForm.user_instructions} onChange={(event) => updateEmailDraftForm('user_instructions', event.target.value)} />
            </FormField>
            <FormField label="Call to action">
              <input className={inputClassName} value={emailDraftForm.call_to_action} onChange={(event) => updateEmailDraftForm('call_to_action', event.target.value)} />
            </FormField>
            <FormField label="Attachment names">
              <input className={inputClassName} value={emailDraftForm.attachment_names} onChange={(event) => updateEmailDraftForm('attachment_names', event.target.value)} placeholder="proposal.pdf, report.xlsx" />
            </FormField>
            <Button type="submit" loading={emailDraftSubmitting} loadingText="Generating">
              <Mail className="h-4 w-4" />
              Generate Draft
            </Button>
          </section>

          <section className="space-y-4">
            {emailDraftForm.internal_or_external === 'external' ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                External recipient: Review facts, sensitive information, recipients and attachments before sending outside SynTask.
              </div>
            ) : null}
            {emailDraftWarnings.sensitive_data?.length ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                Sensitive information warning: {emailDraftWarnings.sensitive_data.join(', ')}. Review before using this draft outside SynTask.
              </div>
            ) : null}
            {emailDraftWarnings.missing_recipient ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                Missing recipient: no recipient email was verified or guessed.
              </div>
            ) : null}
            {emailDraftWarnings.attachment_reminders?.length ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                {emailDraftWarnings.attachment_reminders.join(' ')}
              </div>
            ) : null}
            {emailDraftForm.attachment_names.trim() ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                Attachment names are reminders only. No attachment was uploaded or added.
              </div>
            ) : null}
            <FormField label="Subject">
              <input className={inputClassName} value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)} placeholder="Generated subject appears here" />
            </FormField>
            <FormField label="Body">
              <textarea rows={11} className={inputClassName} value={draftBody} onChange={(event) => setDraftBody(event.target.value)} placeholder="Generated editable body appears here" />
            </FormField>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={copyDraft} disabled={!draftSubject && !draftBody}>
                <Copy className="h-4 w-4" />
                Copy Draft
              </Button>
              <Button type="submit" variant="secondary" loading={emailDraftSubmitting} loadingText="Regenerating">
                Regenerate
              </Button>
              {emailDraftRun ? <Badge label={emailDraftRun.state || 'draft'} colorKey={emailDraftRun.state || 'scheduled'} /> : null}
            </div>
            <p className="text-xs text-text-muted dark:text-text-secondary">No Send, schedule, CC/BCC, connector, or attachment action is available here.</p>
          </section>
        </form>
      </div>

      {/* Recommendations Section - Full width */}
      <div className="card p-6 bg-surface dark:bg-black/85">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
            <Lightbulb className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary dark:text-text-primary">
              AI Recommendations
            </h2>
            <p className="text-sm text-text-muted dark:text-text-secondary">
              Smart suggestions based on your recent activity
            </p>
          </div>
        </div>
        
        <div className="grid gap-3 md:grid-cols-4">
          {['Review pending approvals', 'Analyze campaign performance', 'Optimize content strategy', 'Generate weekly report'].map((suggestion) => (
            <div
              key={suggestion}
              className="rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary-300 hover:bg-surface-muted dark:border-border dark:bg-black/40 dark:hover:bg-white/5 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
                  <Sparkles className="h-4 w-4" />
                </div>
                <span className="text-sm text-text-primary dark:text-text-primary">{suggestion}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
