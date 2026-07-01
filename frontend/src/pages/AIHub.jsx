import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Bot, CheckSquare, Clock3, FileText, Sparkles, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiAPI } from '../api/ai'
import { Button, EmptyState, PageHeader } from '../components/ui'

const AIHub = () => {
  const navigate = useNavigate()
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (window.location.hash === '#breakdown') {
      document.getElementById('breakdown')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const featureCards = useMemo(
    () => [
      {
        title: 'AI Assistant',
        description: 'Ask work questions with conversational memory and tone-aware responses.',
        icon: Bot,
        path: '/ai-assistant',
        accent: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200',
      },
      {
        title: 'Prioritize My Day',
        description: 'Rank tasks by urgency, blockers, and due dates.',
        icon: Sparkles,
        path: '/ai-prioritization',
        accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200',
      },
      {
        title: 'Break Down Tasks',
        description: 'Split large work into steps with time estimates.',
        icon: CheckSquare,
        path: '#breakdown',
        accent: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200',
      },
      {
        title: 'Daily Report',
        description: 'Generate a role-aware operating summary for the day.',
        icon: FileText,
        path: '/reports',
        accent: 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-200',
      },
      {
        title: 'Creative Director',
        description: 'Review uploaded creative assets for brand, UX, and accessibility issues.',
        icon: Wand2,
        path: '/creative-director',
        accent: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-200',
      },
    ],
    [],
  )

  const handleBreakdown = async (event) => {
    event.preventDefault()
    const title = taskTitle.trim()
    if (!title || loading) return

    try {
      setLoading(true)
      setError('')
      const data = await aiAPI.generateBreakdown({
        task_title: title,
        task_description: taskDescription.trim() || undefined,
      })
      setResult(data)
      toast.success('Task breakdown generated')
    } catch (breakdownError) {
      console.error('Failed to generate breakdown', breakdownError)
      setError(breakdownError.response?.data?.detail || breakdownError.message || 'Failed to generate breakdown')
      toast.error(breakdownError.response?.data?.detail || 'Failed to generate breakdown')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="AI Hub"
        description="All SynTask AI features in one place: chat, prioritization, breakdowns, and reports."
        actions={<Button onClick={() => navigate('/ai-assistant')}><Bot className="h-4 w-4" />Open Assistant</Button>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {featureCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.title} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${card.accent}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-gray-100">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{card.description}</p>
              <button
                type="button"
                onClick={() => {
                  if (card.path === '#breakdown') {
                    document.getElementById('breakdown')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    return
                  }
                  navigate(card.path)
                }}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-500 dark:text-primary-300"
              >
                Open
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>

      <div id="breakdown" className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={handleBreakdown} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Break Down Tasks</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Generate an actionable plan from a free-form task request.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Task title</span>
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Fix login bug"
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-100 dark:focus:ring-primary-900/40"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Task description</span>
              <textarea
                value={taskDescription}
                onChange={(event) => setTaskDescription(event.target.value)}
                placeholder="Add context, blockers, or expected output..."
                className="min-h-[140px] w-full resize-none rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-100 dark:focus:ring-primary-900/40"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-200">
                {error}
              </div>
            ) : null}

            <Button type="submit" loading={loading} className="w-full">
              <Sparkles className="h-4 w-4" />
              Generate breakdown
            </Button>
          </div>
        </form>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Generated steps</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Estimated minutes, dependencies, and execution order.</p>
            </div>
          </div>

          <div className="mt-5">
            {result?.steps?.length ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-600">Task</div>
                  <div className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{result.task_title}</div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{result.source === 'fallback' ? 'Fallback plan' : 'AI generated plan'} • {result.provider} / {result.model}</div>
                </div>

                {result.steps.map((step, index) => (
                  <div key={`${step.title}-${index}`} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Step {index + 1}</div>
                        <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">{step.title}</div>
                      </div>
                      <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-950/40 dark:text-primary-200">
                        {step.estimated_minutes} min
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{step.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">{step.status}</span>
                      {step.dependencies?.length ? (
                        step.dependencies.map((dep) => (
                          <span key={dep} className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
                            {dep}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">No dependencies</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={AlertTriangle}
                title="No breakdown yet"
                description="Enter a task title to generate a step-by-step plan."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AIHub
