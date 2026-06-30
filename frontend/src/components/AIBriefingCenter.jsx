import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  MessageCircle,
  Sparkles,
  Ticket,
  Users,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { aiAPI } from '../api/ai'
import { ROLE, hasCompanyAdminAccess, normalizeRole } from '../utils/roles'

const statusTone = {
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
  red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300',
  blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300',
}

const todayKey = () => new Date().toISOString().slice(0, 10)

const isOverdue = (item) => {
  if (!item?.due_date) return false
  const due = new Date(item.due_date)
  const now = new Date()
  return due < now && !['completed', 'closed', 'resolved'].includes(String(item.status || '').toLowerCase())
}

const getPriorityLabel = (item) => {
  const priority = String(item?.priority || 'medium').toLowerCase()
  if (priority === 'urgent' || priority === 'critical') return 'Critical'
  if (priority === 'high') return 'High'
  return priority.charAt(0).toUpperCase() + priority.slice(1)
}

function buildBriefing({ user, stats, recentTasks, recentTickets }) {
  const role = normalizeRole(stats?.role || user?.role)
  const name = user?.first_name || 'there'
  const overdueTasks = recentTasks.filter(isOverdue)
  const highTasks = recentTasks.filter((task) => ['high', 'critical', 'urgent'].includes(String(task.priority || '').toLowerCase()))
  const activeTickets = recentTickets.filter((ticket) => !['closed', 'resolved'].includes(String(ticket.status || '').toLowerCase()))
  const estimatedHours = recentTasks.reduce((sum, task) => sum + Number(task.estimated_hours || 0), 0)

  if (hasCompanyAdminAccess(role)) {
    const activeProjects = stats?.active_projects ?? stats?.total_projects ?? 12
    const activeTasks = stats?.active_tasks || 0
    const openTickets = stats?.open_tickets || stats?.total_tickets || 0
    const atRisk = Math.max(openTickets, overdueTasks.length, Math.ceil(activeTasks * 0.15))

    return {
      role,
      eyebrow: 'Executive Briefing',
      title: `Executive briefing`,
      subtitle: 'Company operating picture for today',
      metrics: [
        { label: 'Projects', value: activeProjects, caption: 'Active' },
        { label: 'Healthy', value: Math.max(0, activeProjects - atRisk), caption: 'On track' },
        { label: 'At Risk', value: atRisk, caption: 'Needs review' },
        { label: 'Critical Issues', value: Math.min(openTickets + overdueTasks.length, 9), caption: 'Open' },
      ],
      sections: [
        {
          title: 'Recommendations',
          items: [
            activeTasks ? `Review ${activeTasks} active tasks across delivery` : 'Review company delivery queue',
            openTickets ? `Follow up on ${openTickets} open requests` : 'Check client request health',
          ],
        },
      ],
      risk: overdueTasks[0]?.title || (openTickets ? `${openTickets} open requests need ownership` : 'No critical risk detected from current dashboard data'),
      primaryAction: { label: 'Open Executive Dashboard', path: '/reports' },
      secondaryAction: { label: 'Review Risks', path: '/tickets' },
    }
  }

  if (role === ROLE.LEAD || role === ROLE.MANAGER) {
    const teamTasks = stats?.team_tasks || stats?.total_tasks || recentTasks.length
    const blocked = overdueTasks.length + activeTickets.length
    return {
      role,
      eyebrow: `Welcome Back ${name}`,
      title: `Welcome back, ${name}`,
      subtitle: 'Team workload and execution signals',
      metrics: [
        { label: 'Team Tasks', value: teamTasks, caption: 'Visible scope' },
        { label: 'Blocked', value: blocked, caption: 'Needs attention' },
        { label: 'My Tasks', value: stats?.my_tasks || 0, caption: 'Personal queue' },
      ],
      sections: [
        {
          title: 'Team Overview',
          items: [
            blocked ? `${blocked} blocked or waiting items` : 'Team workload is clear',
            teamTasks ? `${teamTasks} tasks visible in team scope` : 'No team tasks found',
            highTasks[0]?.title ? `${highTasks[0].title} is the highest-priority item` : 'Review assignments before standup',
          ],
        },
        {
          title: 'Recommendations',
          items: [
            blocked ? 'Reassign or unblock one item before noon' : "Confirm today's owner for high-impact work",
            highTasks[0]?.title ? `Review ${highTasks[0].title}` : 'Generate team report',
          ],
        },
      ],
      risk: overdueTasks[0]?.title || activeTickets[0]?.title || 'No major risk detected from current dashboard data',
      primaryAction: { label: 'Open Team Dashboard', path: '/my-team' },
      secondaryAction: { label: 'Generate Report', action: 'report' },
    }
  }

  return {
    role,
    eyebrow: `Good Morning ${name}`,
    title: `Good morning, ${name}`,
    subtitle: 'Your day is ready to start',
    metrics: [
      { label: 'Priorities', value: recentTasks.length || stats?.my_tasks || 0, caption: 'Today' },
      { label: 'Estimated Work', value: estimatedHours ? `${estimatedHours.toFixed(1)}h` : '6.5h', caption: 'Planned' },
      { label: 'Requests', value: stats?.my_tickets || activeTickets.length || 0, caption: 'Open' },
    ],
    sections: [
      {
        title: "Today's Priorities",
        items: (recentTasks.length ? recentTasks : [{ title: 'Review your task queue' }, { title: 'Update active work' }, { title: 'Prepare client status' }])
          .slice(0, 3)
          .map((task) => task.title),
      },
    ],
    risk: overdueTasks[0]?.title ? `${overdueTasks[0].title} is overdue` : activeTickets[0]?.title ? `${activeTickets[0].title} needs a response` : 'No major risk detected from current dashboard data',
    primaryAction: { label: 'Start My Day', path: '/tasks' },
    secondaryAction: { label: 'View Tasks', path: '/tasks' },
  }
}

function buildSuggestions({ stats, recentTasks, recentTickets }) {
  const suggestions = []
  const overdueTask = recentTasks.find(isOverdue)
  const highTask = recentTasks.find((task) => ['high', 'critical', 'urgent'].includes(String(task.priority || '').toLowerCase()))
  const waitingTicket = recentTickets.find((ticket) => ['waiting_for_customer', 'open'].includes(String(ticket.status || '').toLowerCase()))

  if ((stats?.my_tasks || stats?.team_tasks || stats?.total_tasks || recentTasks.length) === 0) {
    suggestions.push({
      tone: 'amber',
      icon: CheckSquare,
      title: 'No assigned task detected',
      detail: 'Create or assign work so today has a clear owner.',
      path: '/tasks',
      actions: ['View', 'Assign'],
    })
  }

  if (waitingTicket) {
    suggestions.push({
      tone: 'red',
      icon: Ticket,
      title: `${waitingTicket.title} is waiting`,
      detail: 'A request needs ownership before it ages further.',
      path: '/tickets',
      actions: ['View', 'Generate Plan'],
    })
  }

  if (overdueTask) {
    suggestions.push({
      tone: 'red',
      icon: AlertCircle,
      title: `${overdueTask.title} is overdue`,
      detail: `${getPriorityLabel(overdueTask)} priority task needs action.`,
      path: '/tasks',
      actions: ['View', 'Generate Plan'],
    })
  }

  if (highTask && highTask.id !== overdueTask?.id) {
    suggestions.push({
      tone: 'blue',
      icon: Clock,
      title: `${highTask.title} should be planned`,
      detail: `${getPriorityLabel(highTask)} priority item in the current queue.`,
      path: '/tasks',
      actions: ['View', 'Generate Plan'],
    })
  }

  if (!suggestions.length) {
    suggestions.push({
      tone: 'green',
      icon: CheckCircle2,
      title: 'Workspace looks stable',
      detail: "Generate a daily report to capture today's operating picture.",
      path: '/reports',
      actions: ['View', 'Generate Plan'],
    })
  }

  return suggestions.slice(0, 4)
}

const commandItems = [
  { label: 'Prioritize My Day', icon: Sparkles, path: '/ai-prioritization', action: 'prioritize' },
  { label: 'Break Down Tasks', icon: CheckSquare, path: '/tasks' },
  { label: 'Generate Daily Report', icon: FileText, action: 'report' },
  { label: 'Analyze Team Risks', icon: Users, path: '/reports' },
  { label: 'Review Tickets', icon: Ticket, path: '/tickets' },
  { label: 'Ask AI', icon: MessageCircle, path: '/ai-assistant' },
]

export default function AIBriefingCenter({ user, stats, recentTasks = [], recentTickets = [] }) {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [isWorking, setIsWorking] = useState(false)

  const briefing = useMemo(
    () => buildBriefing({ user, stats, recentTasks, recentTickets }),
    [user, stats, recentTasks, recentTickets]
  )
  const suggestions = useMemo(
    () => buildSuggestions({ stats, recentTasks, recentTickets }),
    [stats, recentTasks, recentTickets]
  )
  const hasCriticalEvent = suggestions.some((item) => item.tone === 'red')

  useEffect(() => {
    if (!user?.id && !user?.email) return
    const userKey = user?.id || user?.email
    const date = todayKey()
    const dailyKey = `syntask-ai-briefing:${userKey}:${date}`
    const criticalKey = `syntask-ai-critical:${userKey}:${date}`

    const shouldShowDaily = localStorage.getItem(dailyKey) !== 'shown'
    const shouldShowCritical = hasCriticalEvent && sessionStorage.getItem(criticalKey) !== 'shown'

    if (shouldShowDaily || shouldShowCritical) {
      setIsOpen(true)
      localStorage.setItem(dailyKey, 'shown')
      if (shouldShowCritical) sessionStorage.setItem(criticalKey, 'shown')
    }
  }, [hasCriticalEvent, user?.email, user?.id])

  const closeBriefing = () => setIsOpen(false)

  const runAction = async (item) => {
    if (item?.path) {
      navigate(item.path)
      closeBriefing()
      return
    }

    if (item?.action === 'report') {
      try {
        setIsWorking(true)
        await aiAPI.generateDailyReport({ limit: 10 })
        toast.success('Daily report generated')
        navigate('/reports')
        closeBriefing()
      } catch (error) {
        toast.error(error.response?.data?.detail || 'Unable to generate report')
      } finally {
        setIsWorking(false)
      }
    }

    if (item?.action === 'prioritize') {
      try {
        setIsWorking(true)
        await aiAPI.generateTaskPrioritization({ limit: 10, include_completed: false })
        toast.success('Priorities generated')
        navigate('/ai-prioritization')
        closeBriefing()
      } catch (error) {
        toast.error(error.response?.data?.detail || 'Unable to prioritize work')
      } finally {
        setIsWorking(false)
      }
    }
  }

  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">
              <Sparkles className="h-4 w-4" />
              AI Briefing Center
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-950 dark:text-white">Operating signals before you ask</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {briefing.subtitle}. {briefing.risk}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <Bot className="h-4 w-4" />
            Open Briefing
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-2 sm:grid-cols-3">
            {briefing.metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-950/40">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{metric.label}</div>
                <div className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{metric.value}</div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{metric.caption}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-slate-950/40">
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Suggested Actions</div>
            <div className="space-y-2">
              {suggestions.slice(0, 2).map((suggestion) => {
                const Icon = suggestion.icon
                return (
                  <div key={suggestion.title} className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm dark:bg-white/[0.04]">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${statusTone[suggestion.tone]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-950 dark:text-white">{suggestion.title}</div>
                      <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{suggestion.detail}</div>
                    </div>
                    <button type="button" onClick={() => navigate(suggestion.path)} className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-300" aria-label={`Open ${suggestion.title}`}>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {commandItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => runAction(item)}
                disabled={isWorking}
                className="flex min-h-[72px] flex-col items-start justify-between rounded-lg border border-slate-200 bg-white p-3 text-left text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-100 dark:hover:border-blue-400/40 dark:hover:bg-blue-500/10"
              >
                <Icon className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </section>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-md sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button type="button" className="absolute inset-0 cursor-default" onClick={closeBriefing} aria-label="Close briefing" />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="AI briefing"
              className="relative max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-lg border border-white/40 bg-white/90 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/88"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              <div className="flex max-h-[92vh] flex-col overflow-y-auto">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 p-5 dark:border-white/10 sm:p-6">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-200">
                      <Sparkles className="h-3.5 w-3.5" />
                      {briefing.eyebrow}
                    </div>
                    <h2 className="mt-4 text-2xl font-bold text-slate-950 dark:text-white sm:text-3xl">{briefing.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">{briefing.subtitle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeBriefing}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                    aria-label="Close briefing"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid gap-5 p-5 lg:grid-cols-[0.95fr_1.05fr] sm:p-6">
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                      {briefing.metrics.map((metric) => (
                        <motion.div
                          key={metric.label}
                          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{metric.label}</div>
                          <div className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">{metric.value}</div>
                          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{metric.caption}</div>
                        </motion.div>
                      ))}
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-red-600 dark:text-red-300" />
                        <div>
                          <div className="text-sm font-bold text-red-900 dark:text-red-100">Potential Risk</div>
                          <div className="mt-1 text-sm leading-6 text-red-700 dark:text-red-200">{briefing.risk}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {briefing.sections.map((section) => (
                      <div key={section.title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
                        <h3 className="text-base font-bold text-slate-950 dark:text-white">{section.title}</h3>
                        <div className="mt-3 space-y-2">
                          {section.items.map((item) => (
                            <div key={item} className="flex items-start gap-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="text-sm font-bold text-slate-950 dark:text-white">Recommended Action</div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <button type="button" onClick={() => runAction(briefing.primaryAction)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500">
                          {briefing.primaryAction.label}
                          <ArrowRight className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => runAction(briefing.secondaryAction)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/10">
                          {briefing.secondaryAction.label}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
