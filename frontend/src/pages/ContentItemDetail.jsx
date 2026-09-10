import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import {
  ArrowLeft, Clock, User, AlertTriangle,
  CheckCircle2, Eye, RotateCcw, Pencil,
  ChevronRight, FileText, Tag,
  Globe, History, BookOpen, Layers, Sparkles,
  Save, X, MoveRight, Send, MessageSquare, Trash2, ExternalLink,
  Wand2, RefreshCcw, ListChecks
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, formatDistanceToNow, isPast, parseISO } from 'date-fns'
import { extractErrorMessage } from '../api/axios'
import { contentProductionApi } from '../api/contentProduction'
import { Button, FormField, Modal, Skeleton } from '../components/ui'
import { useAuthStore } from '../store/authStore'
import { hasCapability } from '../utils/rbac'

const STATUS_COLORS = {
  idea: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  briefing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  script: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  production: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  internal_review: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  client_review: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  revision_required: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  ready_to_publish: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
}

const LIFECYCLE_STEPS = [
  'idea', 'briefing', 'script', 'production', 'internal_review',
  'client_review', 'revision_required', 'approved', 'ready_to_publish', 'published'
]

function formatLabel(s) {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function ContentItemDetail() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState('overview')
  const [showTransitionModal, setShowTransitionModal] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewType, setReviewType] = useState('internal') // 'internal' | 'client'
  const [showEditModal, setShowEditModal] = useState(false)
  const [transitionTarget, setTransitionTarget] = useState(null)
  const [transitionFeedback, setTransitionFeedback] = useState('')
  const [reviewDecision, setReviewDecision] = useState('approve')
  const [reviewFeedback, setReviewFeedback] = useState('')
  const [editForm, setEditForm] = useState({})
  const [commentText, setCommentText] = useState('')
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [aiAction, setAiAction] = useState(null)
  const [aiSuggestion, setAiSuggestion] = useState(null)
  const [aiPreview, setAiPreview] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)

  // Permission truth comes from the backend-resolved capability list — the UI
  // only hides actions the backend would reject anyway (defense in depth).
  const user = useAuthStore((s) => s.user)
  const can = (capability) => hasCapability(user, capability)

  // Fetch item
  const { data: itemData, isLoading } = useQuery(
    ['content-item', itemId],
    () => contentProductionApi.getItem(itemId),
    { staleTime: 30 * 1000 }
  )

  // Fetch allowed transitions
  const { data: transitionsData } = useQuery(
    ['content-transitions', itemId],
    () => contentProductionApi.getAllowedTransitions(itemId),
    { staleTime: 30 * 1000 }
  )

  // Contextual AI actions available at this stage (backend stage map is the
  // single source of truth — the UI never guesses what AI can do here).
  const { data: aiActionsData } = useQuery(
    ['content-ai-actions', itemId],
    () => contentProductionApi.getAIActions(itemId),
    { enabled: showAIPanel, staleTime: 60 * 1000 }
  )

  const item = itemData?.data?.item
  const allowedTransitions = transitionsData?.data?.allowed || []
  const publishingRecord = item?.publishing_record || null

  // Mutations
  const transitionMutation = useMutation(
    ({ status, feedback }) => contentProductionApi.transitionStatus(itemId, { status, feedback }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['content-item', itemId])
        queryClient.invalidateQueries(['content-transitions', itemId])
        queryClient.invalidateQueries(['content-workspace'])
        queryClient.invalidateQueries(['content-calendar-items'])
        toast.success('Status updated')
        setShowTransitionModal(false)
        setTransitionFeedback('')
      },
      onError: (err) => toast.error(extractErrorMessage(err?.response?.data?.detail) || 'Failed to update status'),
    }
  )

  const internalReviewMutation = useMutation(
    (payload) => contentProductionApi.internalReview(itemId, payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['content-item', itemId])
        queryClient.invalidateQueries(['content-transitions', itemId])
        queryClient.invalidateQueries(['content-workspace'])
        queryClient.invalidateQueries(['content-calendar-items'])
        toast.success('Review recorded')
        setShowReviewModal(false)
        setReviewFeedback('')
      },
      onError: (err) => toast.error(extractErrorMessage(err?.response?.data?.detail) || 'Failed to record review'),
    }
  )

  const clientReviewMutation = useMutation(
    (payload) => contentProductionApi.clientReview(itemId, payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['content-item', itemId])
        queryClient.invalidateQueries(['content-transitions', itemId])
        queryClient.invalidateQueries(['content-workspace'])
        queryClient.invalidateQueries(['content-calendar-items'])
        toast.success('Client review recorded')
        setShowReviewModal(false)
        setReviewFeedback('')
      },
      onError: (err) => toast.error(extractErrorMessage(err?.response?.data?.detail) || 'Failed to record client review'),
    }
  )

  const updateMutation = useMutation(
    (payload) => contentProductionApi.updateItem(itemId, payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['content-item', itemId])
        queryClient.invalidateQueries(['content-workspace'])
        queryClient.invalidateQueries(['content-calendar-items'])
        toast.success('Content updated')
        setShowEditModal(false)
      },
      onError: (err) => toast.error(extractErrorMessage(err?.response?.data?.detail) || 'Failed to update'),
    }
  )

  // Comments — belong to the canonical Content Item; they are discussion, not
  // review decisions (those live in the Reviews tab).
  const commentsQuery = useQuery(
    ['content-comments', itemId],
    () => contentProductionApi.getComments(itemId),
    { enabled: activeTab === 'comments', staleTime: 15 * 1000 }
  )

  const addCommentMutation = useMutation(
    (payload) => contentProductionApi.addComment(itemId, payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['content-comments', itemId])
        queryClient.invalidateQueries(['content-item', itemId])
        setCommentText('')
      },
      onError: (err) => toast.error(extractErrorMessage(err?.response?.data?.detail) || 'Failed to add comment'),
    }
  )

  const deleteCommentMutation = useMutation(
    (commentId) => contentProductionApi.deleteComment(commentId),
    {
      onSuccess: () => queryClient.invalidateQueries(['content-comments', itemId]),
      onError: (err) => toast.error(extractErrorMessage(err?.response?.data?.detail) || 'Failed to delete comment'),
    }
  )

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <p className="text-gray-500">Content item not found</p>
        <Button className="mt-4" onClick={() => navigate('/content')}>Back to Content</Button>
      </div>
    )
  }

  // AI mutations (declared after the loading guard so `item` is defined for
  // the accept path; hooks stay unconditional above).
  const aiActionMutation = useMutation(
    (action) => contentProductionApi.runAIAction(itemId, action),
    {
      onMutate: () => setAiGenerating(true),
      onSettled: () => setAiGenerating(false),
      onSuccess: (res) => {
        setAiSuggestion(res?.data || null)
        setAiPreview(res?.data?.suggestion || '')
        toast.success('AI suggestion ready — review it, then Accept, Edit, or Discard.')
      },
      onError: (err) => toast.error(extractErrorMessage(err?.response?.data?.detail) || 'AI action failed'),
    }
  )

  const acceptSuggestion = () => {
    const field = aiSuggestion?.target_field
    if (!field) {
      toast.info('This is an advisory result — copy it wherever you need it.')
      return
    }
    // Accept writes through the NORMAL update endpoint — the exact same path a
    // human edit uses. AI itself never mutates lifecycle, reviews, or publishing.
    updateMutation.mutate({ [field]: aiPreview })
  }

  const regenerateSuggestion = () => {
    if (!aiAction) return
    aiActionMutation.mutate(aiAction)
  }

  const discardSuggestion = () => {
    setAiSuggestion(null)
    setAiPreview('')
  }

  const statusClass = STATUS_COLORS[item.status] || STATUS_COLORS.idea
  const isOverdue = item.deadline && isPast(parseISO(item.deadline)) && !item.completed

  const handleTransition = () => {
    setTransitionTarget(allowedTransitions[0] || null)
    setTransitionFeedback('')
    setShowTransitionModal(true)
  }

  const handleReview = (type) => {
    setReviewType(type)
    setReviewDecision('approve')
    setReviewFeedback('')
    setShowReviewModal(true)
  }

  const handleEdit = () => {
    setEditForm({
      title: item.title || '',
      description: item.description || '',
      objective: item.objective || '',
      target_audience: item.target_audience || '',
      key_message: item.key_message || '',
      hook: item.hook || '',
      cta: item.cta || '',
      tone: item.tone || '',
      caption: item.caption || '',
      script: item.script || '',
    })
    setShowEditModal(true)
  }

  const DETAIL_TABS = [
    { key: 'overview', label: 'Overview', icon: Sparkles },
    { key: 'brief', label: 'Brief', icon: BookOpen },
    { key: 'script', label: 'Script / Copy', icon: FileText },
    { key: 'versions', label: `Versions (v${item.current_version})`, icon: Layers },
    { key: 'reviews', label: 'Reviews', icon: Eye },
    { key: 'publishing', label: 'Publishing', icon: Send },
    { key: 'comments', label: 'Comments', icon: MessageSquare },
    { key: 'history', label: 'History', icon: History },
  ]

  const aiActions = aiActionsData?.data?.actions || []

  return (
    <div className="flex h-full min-h-[calc(100vh-140px)] flex-col space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-surface-border pb-4 dark:border-gray-800">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/content')} className="mt-1 rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              {item.content_id && (
                <span className="font-mono text-sm text-gray-400">{item.content_id}</span>
              )}
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass}`}>
                {formatLabel(item.status)}
              </span>
              {isOverdue && (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  <AlertTriangle className="h-3 w-3 mr-0.5" /> Overdue
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{item.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
              {item.platform && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{item.platform}</span>}
              {item.content_type && <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{formatLabel(item.content_type)}</span>}
              {item.priority && <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{item.priority}</span>}
              {item.assignee_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{item.assignee_name}</span>}
              {item.deadline && (
                <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-semibold' : ''}`}>
                  <Clock className="h-3 w-3" />
                  Due {formatDistanceToNow(parseISO(item.deadline), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {can('content.edit') && (
            <Button variant="secondary" size="sm" onClick={() => setShowAIPanel((v) => !v)}>
              <Wand2 className="h-3.5 w-3.5 mr-1" /> AI Assist
            </Button>
          )}
          {can('content.edit') && (
            <Button variant="secondary" size="sm" onClick={handleEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
          {can('content.transition') && allowedTransitions.length > 0 && (
            <Button size="sm" onClick={() => handleTransition()}>
              <MoveRight className="h-3.5 w-3.5 mr-1" /> Update Status
            </Button>
          )}
          {can('content.internal_review') && item.status === 'internal_review' && (
            <Button size="sm" onClick={() => handleReview('internal')}>
              <Eye className="h-3.5 w-3.5 mr-1" /> Review
            </Button>
          )}
          {can('content.client_review') && item.status === 'client_review' && (
            <Button size="sm" onClick={() => handleReview('client')}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Client Review
            </Button>
          )}
        </div>
      </div>

      {/* Business Context Summary — the first screen answers: what is this,
          for which client/project/service, who owns it, when is it due, and
          what needs to happen next (backend-derived). Not buried in forms. */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-surface-border bg-surface p-3 text-xs shadow-sm dark:border-gray-800 dark:bg-black md:grid-cols-4 lg:grid-cols-7">
        <SummaryCell label="Client" value={item.client_name} />
        <SummaryCell label="Service" value={item.service_name} />
        <SummaryCell label="Project" value={item.project_name} />
        <SummaryCell label="Deliverable" value={item.deliverable_name} />
        <SummaryCell label="Owner" value={item.assignee_name} />
        <SummaryCell label="Deadline" value={item.deadline ? format(parseISO(item.deadline), 'MMM d, yyyy') : null} valueClass={isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''} />
        <div className="col-span-2 md:col-span-4 lg:col-span-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Next Action</p>
          <p className="mt-0.5 text-sm font-bold text-primary-600 dark:text-primary-400">{item.next_action || formatLabel(item.status)}</p>
        </div>
      </div>

      {/* Contextual AI Panel — stage-relevant actions from the backend.
          Results are preview-first: Accept / Edit / Regenerate / Discard.
          Accepting writes through the normal update endpoint only. */}
      {showAIPanel && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-purple-700 dark:text-purple-300">
              <Wand2 className="h-4 w-4" /> AI Assist — contextual to this item
            </h3>
            <button type="button" onClick={() => { setShowAIPanel(false); discardSuggestion() }} className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="h-4 w-4" />
            </button>
          </div>
          {aiActions.length === 0 && !aiGenerating ? (
            <p className="mt-2 text-xs text-gray-500">Loading available AI actions…</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {aiActions.map((a) => (
                <button
                  key={a.action}
                  type="button"
                  disabled={aiGenerating}
                  onClick={() => { setAiAction(a.action); setAiSuggestion(null); setAiPreview(''); aiActionMutation.mutate(a.action) }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-white px-3 py-1.5 text-xs font-medium text-purple-700 transition hover:bg-purple-100 disabled:opacity-50 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300 dark:hover:bg-purple-900/50"
                >
                  <Wand2 className="h-3 w-3" /> {a.label}
                </button>
              ))}
            </div>
          )}
          {aiGenerating && (
            <p className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <RefreshCcw className="h-3 w-3 animate-spin" /> Generating from this item's client, brief, and content context…
            </p>
          )}
          {aiSuggestion && !aiGenerating && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <ListChecks className="h-3.5 w-3.5 text-purple-500" />
                {aiSuggestion.target_field
                  ? <>Suggestion for <strong className="font-semibold">{formatLabel(aiSuggestion.target_field)}</strong> — nothing is saved until you accept.</>
                  : 'Advisory result — nothing is written to the item.'}
              </div>
              <textarea
                className="input text-sm"
                rows={8}
                value={aiPreview}
                onChange={(e) => setAiPreview(e.target.value)}
                placeholder="AI suggestion…"
              />
              <div className="flex flex-wrap justify-end gap-2">
                {aiSuggestion.target_field && (
                  <Button size="sm" onClick={acceptSuggestion} disabled={updateMutation.isLoading || !aiPreview.trim()}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Accept — write into {formatLabel(aiSuggestion.target_field)}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={regenerateSuggestion} disabled={aiGenerating}>
                  <RefreshCcw className="h-3.5 w-3.5 mr-1" /> Regenerate
                </Button>
                <Button size="sm" variant="secondary" onClick={discardSuggestion}>
                  <X className="h-3.5 w-3.5 mr-1" /> Discard
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lifecycle Progress Bar */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none rounded-2xl border border-surface-border bg-surface p-3 dark:border-gray-800 dark:bg-black">
        {LIFECYCLE_STEPS.map((step, i) => {
          const isCurrent = item.status === step
          const isPast = LIFECYCLE_STEPS.indexOf(item.status) > i ||
            (item.status === 'revision_required' && i <= LIFECYCLE_STEPS.indexOf('production'))
          return (
            <div key={step} className="flex items-center">
              <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                isCurrent
                  ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500 dark:bg-primary-900/30 dark:text-primary-300'
                  : isPast
                    ? 'bg-green-50 text-green-600 dark:bg-green-900/10 dark:text-green-400'
                    : 'bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
              }`}>
                {isPast && <CheckCircle2 className="h-3 w-3" />}
                {formatLabel(step)}
              </div>
              {i < LIFECYCLE_STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 text-gray-300 mx-0.5" />
              )}
            </div>
          )
        })}
      </div>

      {/* Detail Tabs */}
      <div className="flex gap-1 border-b border-surface-border dark:border-gray-800">
        {DETAIL_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 rounded-2xl border border-surface-border bg-surface p-6 dark:border-gray-800 dark:bg-black">
        {activeTab === 'overview' && (
          <OverviewTab item={item} />
        )}
        {activeTab === 'brief' && (
          <BriefTab item={item} />
        )}
        {activeTab === 'script' && (
          <ScriptTab item={item} />
        )}
        {activeTab === 'versions' && (
          <VersionsTab item={item} />
        )}
        {activeTab === 'reviews' && (
          <ReviewsTab item={item} />
        )}
        {activeTab === 'publishing' && (
          <PublishingTab record={publishingRecord} item={item} />
        )}
        {activeTab === 'comments' && (
          <CommentsTab
            comments={commentsQuery?.data?.data?.comments || []}
            isLoading={commentsQuery?.isLoading}
            text={commentText}
            onTextChange={setCommentText}
            onSubmit={() => {
              if (!commentText.trim()) return
              addCommentMutation.mutate({ text: commentText.trim() })
            }}
            isSubmitting={addCommentMutation.isLoading}
            currentUserId={user?.id || user?._id}
            isAdmin={can('*') || can('content.edit')}
            onDelete={(id) => deleteCommentMutation.mutate(id)}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab item={item} />
        )}
      </div>

      {/* Transition Modal — pick the target stage, then confirm with the submit button */}
      <Modal
        isOpen={showTransitionModal}
        onClose={() => setShowTransitionModal(false)}
        title="Update Status"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowTransitionModal(false)}>Cancel</Button>
            <Button
              onClick={() => transitionMutation.mutate({ status: transitionTarget, feedback: transitionFeedback })}
              disabled={!transitionTarget || transitionMutation.isLoading}
            >
              <MoveRight className="h-4 w-4 mr-1" />
              {transitionMutation.isLoading ? 'Updating...' : `Move to ${formatLabel(transitionTarget)}`}
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Move from <strong>{formatLabel(item.status)}</strong> to:
          </p>
          <div className="flex flex-wrap gap-2">
            {allowedTransitions.map((status) => {
              const isSelected = transitionTarget === status
              const colorClass = STATUS_COLORS[status] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setTransitionTarget(status)}
                  aria-pressed={isSelected}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all ${
                    isSelected
                      ? `border-transparent ring-2 ring-primary-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-900 ${colorClass}`
                      : `${colorClass} border-gray-200/70 opacity-80 hover:opacity-100 dark:border-gray-700`
                  }`}
                  disabled={transitionMutation.isLoading}
                >
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {formatLabel(status)}
                </button>
              )
            })}
          </div>
          <FormField label="Notes (optional)">
            <textarea
              className="input"
              rows={2}
              value={transitionFeedback}
              onChange={(e) => setTransitionFeedback(e.target.value)}
              placeholder="Add notes about this transition..."
            />
          </FormField>
        </div>
      </Modal>

      {/* Review Modal */}
      <Modal isOpen={showReviewModal} onClose={() => setShowReviewModal(false)} title={`${reviewType === 'internal' ? 'Internal' : 'Client'} Review`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Reviewing version {item.current_version} of <strong>{item.title}</strong>
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setReviewDecision('approve')}
              className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                reviewDecision === 'approve'
                  ? 'bg-green-100 border-green-300 text-green-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <CheckCircle2 className="h-4 w-4 mr-1 inline" />
              Approve
            </button>
            <button
              onClick={() => setReviewDecision('request_revision')}
              className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                reviewDecision === 'request_revision'
                  ? 'bg-amber-100 border-amber-300 text-amber-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <RotateCcw className="h-4 w-4 mr-1 inline" />
              Request Revision
            </button>
            <button
              onClick={() => setReviewDecision('reject')}
              className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                reviewDecision === 'reject'
                  ? 'bg-red-100 border-red-300 text-red-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <X className="h-4 w-4 mr-1 inline" />
              Reject
            </button>
          </div>
          <FormField label="Feedback">
            <textarea
              className="input"
              rows={3}
              value={reviewFeedback}
              onChange={(e) => setReviewFeedback(e.target.value)}
              placeholder="Provide feedback..."
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowReviewModal(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const payload = { decision: reviewDecision, feedback: reviewFeedback }
                if (reviewType === 'internal') {
                  internalReviewMutation.mutate(payload)
                } else {
                  clientReviewMutation.mutate(payload)
                }
              }}
              disabled={internalReviewMutation.isLoading || clientReviewMutation.isLoading}
            >
              Submit Review
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Content">
        <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(editForm) }} className="space-y-4">
          <FormField label="Title">
            <input type="text" className="input" value={editForm.title} onChange={(e) => setEditForm(p => ({ ...p, title: e.target.value }))} />
          </FormField>
          <FormField label="Description">
            <textarea className="input" rows={2} value={editForm.description} onChange={(e) => setEditForm(p => ({ ...p, description: e.target.value }))} />
          </FormField>
          <FormField label="Objective">
            <input type="text" className="input" value={editForm.objective} onChange={(e) => setEditForm(p => ({ ...p, objective: e.target.value }))} />
          </FormField>
          <FormField label="Target Audience">
            <input type="text" className="input" value={editForm.target_audience} onChange={(e) => setEditForm(p => ({ ...p, target_audience: e.target.value }))} />
          </FormField>
          <FormField label="Key Message">
            <input type="text" className="input" value={editForm.key_message} onChange={(e) => setEditForm(p => ({ ...p, key_message: e.target.value }))} />
          </FormField>
          <FormField label="Hook">
            <input type="text" className="input" value={editForm.hook} onChange={(e) => setEditForm(p => ({ ...p, hook: e.target.value }))} />
          </FormField>
          <FormField label="CTA">
            <input type="text" className="input" value={editForm.cta} onChange={(e) => setEditForm(p => ({ ...p, cta: e.target.value }))} />
          </FormField>
          <FormField label="Tone">
            <input type="text" className="input" value={editForm.tone} onChange={(e) => setEditForm(p => ({ ...p, tone: e.target.value }))} />
          </FormField>
          <FormField label="Caption">
            <textarea className="input" rows={3} value={editForm.caption} onChange={(e) => setEditForm(p => ({ ...p, caption: e.target.value }))} />
          </FormField>
          <FormField label="Script">
            <textarea className="input" rows={5} value={editForm.script} onChange={(e) => setEditForm(p => ({ ...p, script: e.target.value }))} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button type="submit" disabled={updateMutation.isLoading}>
              <Save className="h-4 w-4 mr-1" />
              {updateMutation.isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ── Tab Content Components ────────────────────────────────────────────────

function OverviewTab({ item }) {
  const brief = item.brief_completeness || null
  return (
    <div className="space-y-6">
      {/* Backend-derived next action — same source as the workspace list. */}
      <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50/60 p-3 dark:border-primary-900/40 dark:bg-primary-950/20">
        <MoveRight className="h-4 w-4 text-primary-600" />
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold text-text-primary">Next Action:</span>{' '}
          <span className="font-semibold text-primary-700 dark:text-primary-400">{item.next_action || formatLabel(item.status)}</span>
        </p>
      </div>
      {brief && (
        <Section title="Brief Completeness">
          <div className="rounded-xl border border-surface-border p-3 dark:border-gray-800">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-gray-600 dark:text-gray-400">Brief completeness</span>
              <span className={brief.score >= 80 ? 'text-emerald-600' : brief.score >= 50 ? 'text-amber-600' : 'text-red-600'}>{brief.score}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className={`h-full rounded-full ${brief.score >= 80 ? 'bg-emerald-500' : brief.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${brief.score}%` }}
              />
            </div>
            {brief.missing?.length > 0 && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Missing: {brief.missing.map((m) => formatLabel(m)).join(', ')}
              </p>
            )}
            <p className="mt-1 text-[11px] text-gray-400">Guidance only — the lifecycle decides what is required to move forward.</p>
          </div>
        </Section>
      )}
      <Section title="Business Context">
        <InfoGrid>
          <InfoItem label="Content ID" value={item.content_id || '—'} />
          <InfoItem label="Client" value={item.client_name || '—'} />
          <InfoItem label="Service" value={item.service_name || '—'} />
          <InfoItem label="Project" value={item.project_name || '—'} />
          <InfoItem label="Deliverable" value={item.deliverable_name || '—'} />
          <InfoItem label="Owner" value={item.assignee_name || '—'} />
        </InfoGrid>
      </Section>
      <Section title="Content Details">
        <InfoGrid>
          <InfoItem label="Content ID" value={item.content_id || '—'} />
          <InfoItem label="Platform" value={item.platform || '—'} />
          <InfoItem label="Content Type" value={formatLabel(item.content_type)} />
          <InfoItem label="Priority" value={formatLabel(item.priority)} />
          <InfoItem label="Status" value={formatLabel(item.status)} />
          <InfoItem label="Version" value={`v${item.current_version}`} />
          <InfoItem label="Owner" value={item.assignee_name || '—'} />
          <InfoItem label="Deadline" value={item.deadline ? format(parseISO(item.deadline), 'MMM d, yyyy') : '—'} />
          <InfoItem label="Due Date" value={item.due_date ? format(parseISO(item.due_date), 'MMM d, yyyy') : '—'} />
          <InfoItem label="Publish Date" value={item.publish_date ? format(parseISO(item.publish_date), 'MMM d, yyyy') : '—'} />
        </InfoGrid>
      </Section>
      {item.description && (
        <Section title="Description">
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{item.description}</p>
        </Section>
      )}
      {item.tags?.length > 0 && (
        <Section title="Tags">
          <div className="flex flex-wrap gap-1">
            {item.tags.map((tag, i) => (
              <span key={i} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">{tag}</span>
            ))}
          </div>
        </Section>
      )}
      {item.notes && (
        <Section title="Notes">
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{item.notes}</p>
        </Section>
      )}
    </div>
  )
}

function BriefTab({ item }) {
  return (
    <div className="space-y-6">
      <Section title="Content Brief">
        <InfoGrid>
          <InfoItem label="Objective" value={item.objective || '—'} wide />
          <InfoItem label="Target Audience" value={item.target_audience || '—'} wide />
          <InfoItem label="Key Message" value={item.key_message || '—'} wide />
          <InfoItem label="Hook" value={item.hook || '—'} />
          <InfoItem label="CTA" value={item.cta || '—'} />
          <InfoItem label="Tone" value={item.tone || '—'} />
        </InfoGrid>
      </Section>
      {item.assets_required?.length > 0 && (
        <Section title="Required Assets">
          <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300">
            {item.assets_required.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </Section>
      )}
      {item.references?.length > 0 && (
        <Section title="References">
          <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-300">
            {item.references.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </Section>
      )}
    </div>
  )
}

function ScriptTab({ item }) {
  return (
    <div className="space-y-6">
      {item.caption && (
        <Section title="Caption">
          <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans">{item.caption}</pre>
        </Section>
      )}
      {item.script && (
        <Section title="Script">
          <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans">{item.script}</pre>
        </Section>
      )}
      {item.creative_brief && (
        <Section title="Creative Brief">
          <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans">{item.creative_brief}</pre>
        </Section>
      )}
      {!item.caption && !item.script && !item.creative_brief && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No script or copy yet. Edit this item to add content.</p>
      )}
    </div>
  )
}

function VersionsTab({ item }) {
  const versions = item.versions || []
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">Current version: <strong>v{item.current_version}</strong></p>
      {versions.length === 0 ? (
        <p className="text-sm text-gray-500">No version history.</p>
      ) : (
        <div className="space-y-3">
          {[...versions].reverse().map((v) => (
            <div key={v.version_number} className="rounded-xl border border-surface-border p-4 dark:border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Version {v.version_number}</span>
                <span className="text-xs text-gray-400">
                  {v.created_at ? format(parseISO(v.created_at), 'MMM d, yyyy h:mm a') : '—'}
                </span>
              </div>
              {v.created_by_name && (
                <p className="text-xs text-gray-500">By {v.created_by_name}</p>
              )}
              {v.feedback && (
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 italic">&quot;{v.feedback}&quot;</p>
              )}
              {v.review_result && (
                <span className="mt-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {v.review_result}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReviewsTab({ item }) {
  const internalReviews = item.internal_reviews || []
  const clientApprovals = item.client_approvals || []
  return (
    <div className="space-y-6">
      <Section title="Internal Reviews">
        {internalReviews.length === 0 ? (
          <p className="text-sm text-gray-500">No internal reviews yet.</p>
        ) : (
          <div className="space-y-3">
            {[...internalReviews].reverse().map((r, i) => (
              <ReviewCard key={i} review={r} />
            ))}
          </div>
        )}
      </Section>
      <Section title="Client Approvals">
        {clientApprovals.length === 0 ? (
          <p className="text-sm text-gray-500">No client reviews yet.</p>
        ) : (
          <div className="space-y-3">
            {[...clientApprovals].reverse().map((r, i) => (
              <ReviewCard key={i} review={r} />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// Publishing visibility — mirrors the canonical publishing record's state.
// This is deliberately read-oriented: Content never duplicates the Publishing
// execution UI; publishing operators act from Publishing's own workspace.
function PublishingTab({ record, item }) {
  if (!record) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {item?.status === 'ready_to_publish'
            ? 'Waiting for Publishing — this item has been handed off but Publishing has not scheduled it yet.'
            : 'Not yet handed off to Publishing. Publishing information appears here once the item is approved and becomes Ready to Publish.'}
        </p>
      </div>
    )
  }
  const statusColors = {
    not_started: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  }
  return (
    <div className="space-y-6">
      <Section title="Publishing Status">
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[record.status] || 'bg-gray-100 text-gray-700'}`}>
          {formatLabel(record.status)}
        </span>
        {record.status === 'failed' && record.error_message && (
          <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            <AlertTriangle className="mr-1.5 inline h-4 w-4" />
            Last publishing error: {record.error_message}
          </p>
        )}
      </Section>
      <Section title="Publishing Details">
        <InfoGrid>
          <InfoItem label="Platform" value={record.platform || '—'} />
          <InfoItem label="Account" value={record.account_name || '—'} />
          <InfoItem label="Scheduled" value={record.scheduled_date ? format(parseISO(record.scheduled_date), 'MMM d, yyyy h:mm a') : '—'} />
          <InfoItem label="Published" value={record.published_date ? format(parseISO(record.published_date), 'MMM d, yyyy h:mm a') : '—'} />
          <InfoItem label="Publishing Owner" value={record.owner_name || record.owner_id || '—'} />
          <InfoItem label="Approved Version" value={record.approved_version ? `v${record.approved_version}` : '—'} />
        </InfoGrid>
      </Section>
      {record.external_url && (
        <Section title="Published URL">
          <a
            href={record.external_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline dark:text-primary-400"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {record.external_url}
          </a>
        </Section>
      )}
    </div>
  )
}

// Comments belong to the canonical Content Item. They are discussion about the
// content ("please use the new product image") — NOT review decisions, which
// remain in the Reviews tab.
function CommentsTab({ comments, isLoading, text, onTextChange, onSubmit, isSubmitting, currentUserId, isAdmin, onDelete }) {
  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading comments…</p>
  }
  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit() }}
        className="flex items-start gap-2"
      >
        <textarea
          className="input flex-1"
          rows={2}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Add a comment… (discussion only — review decisions live in Reviews)"
        />
        <Button type="submit" disabled={isSubmitting || !text.trim()}>
          Comment
        </Button>
      </form>
      {(comments || []).length === 0 ? (
        <p className="text-sm text-gray-500">No comments yet.</p>
      ) : (
        <div className="space-y-3">
          {[...comments].reverse().map((c) => (
            <div key={c.id} className="rounded-xl border border-surface-border p-3 dark:border-gray-800">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.user_name || 'Unknown'}</span>
                  <span className="text-xs text-gray-400">
                    {c.created_at ? format(parseISO(c.created_at), 'MMM d, yyyy h:mm a') : ''}
                  </span>
                </div>
                {(isAdmin || c.user_id === currentUserId) && (
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    title="Delete comment"
                    className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{c.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function HistoryTab({ item }) {
  const history = item.history || []
  return (
    <div className="space-y-3">
      {history.length === 0 ? (
        <p className="text-sm text-gray-500">No history yet.</p>
      ) : (
        [...history].reverse().map((h, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <div className="mt-0.5 h-2 w-2 rounded-full bg-primary-400" />
            <div>
              <p className="text-gray-700 dark:text-gray-300">
                <span className="font-medium">{h.action?.replace(/_/g, ' ')}</span>
                {h.from_status && h.to_status && (
                  <> from <strong>{formatLabel(h.from_status)}</strong> to <strong>{formatLabel(h.to_status)}</strong></>
                )}
                {h.version_number && <> (v{h.version_number})</>}
              </p>
              {h.actor_name && <p className="text-xs text-gray-400">by {h.actor_name}</p>}
              {h.created_at && <p className="text-xs text-gray-400">{format(parseISO(h.created_at), 'MMM d, yyyy h:mm a')}</p>}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Shared UI Components ──────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">{title}</h3>
      {children}
    </div>
  )
}

function InfoGrid({ children }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}

// Compact cell for the header context strip: hides the row entirely when the
// value is missing so a deleted/missing relation never renders an empty hole.
function SummaryCell({ label, value, valueClass = '' }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-0.5 truncate text-sm text-gray-900 dark:text-gray-100 ${valueClass}`}>
        {value || '—'}
      </p>
    </div>
  )
}

function InfoItem({ label, value, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-3' : ''}>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
    </div>
  )
}

function ReviewCard({ review }) {
  const decisionColors = {
    approve: 'bg-green-100 text-green-700',
    request_revision: 'bg-amber-100 text-amber-700',
    reject: 'bg-red-100 text-red-700',
  }
  return (
    <div className="rounded-xl border border-surface-border p-3 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{review.reviewer_name || 'Unknown'}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${decisionColors[review.decision] || 'bg-gray-100 text-gray-600'}`}>
            {formatLabel(review.decision)}
          </span>
          <span className="text-xs text-gray-400">v{review.version_number}</span>
        </div>
        <span className="text-xs text-gray-400">
          {review.created_at ? format(parseISO(review.created_at), 'MMM d, h:mm a') : ''}
        </span>
      </div>
      {review.feedback && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 italic">&quot;{review.feedback}&quot;</p>
      )}
      {review.issues?.length > 0 && (
        <ul className="mt-2 list-disc list-inside text-xs text-red-600">
          {review.issues.map((issue, i) => <li key={i}>{issue}</li>)}
        </ul>
      )}
    </div>
  )
}
