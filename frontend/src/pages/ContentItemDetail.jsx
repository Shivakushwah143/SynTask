import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import {
  ArrowLeft, Clock, User, AlertTriangle,
  CheckCircle2, Eye, RotateCcw, Pencil,
  ChevronRight, FileText, Tag,
  Globe, History, BookOpen, Layers, Sparkles,
  Save, X, MoveRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, formatDistanceToNow, isPast, parseISO } from 'date-fns'
import { extractErrorMessage } from '../api/axios'
import { contentProductionApi } from '../api/contentProduction'
import { Button, FormField, Modal, Skeleton } from '../components/ui'

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

  const item = itemData?.data?.item
  const allowedTransitions = transitionsData?.data?.allowed || []

  // Mutations
  const transitionMutation = useMutation(
    ({ status, feedback }) => contentProductionApi.transitionStatus(itemId, { status, feedback }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['content-item', itemId])
        queryClient.invalidateQueries(['content-transitions', itemId])
        queryClient.invalidateQueries(['content-workspace'])
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
        toast.success('Content updated')
        setShowEditModal(false)
      },
      onError: (err) => toast.error(extractErrorMessage(err?.response?.data?.detail) || 'Failed to update'),
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
    { key: 'history', label: 'History', icon: History },
  ]

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
          <Button variant="secondary" size="sm" onClick={handleEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
          {allowedTransitions.length > 0 && (
            <Button size="sm" onClick={() => handleTransition()}>
              <MoveRight className="h-3.5 w-3.5 mr-1" /> Update Status
            </Button>
          )}
          {item.status === 'internal_review' && (
            <Button size="sm" onClick={() => handleReview('internal')}>
              <Eye className="h-3.5 w-3.5 mr-1" /> Review
            </Button>
          )}
          {item.status === 'client_review' && (
            <Button size="sm" onClick={() => handleReview('client')}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Client Review
            </Button>
          )}
        </div>
      </div>

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
  return (
    <div className="space-y-6">
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
