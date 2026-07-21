import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  AlertTriangle,
  BadgeCheck,
  Bot,
  Clock3,
  Layers3,
  RefreshCw,
  Sparkles,
  Upload,
  Wand2,
  LayoutDashboard,
  Filter,
  Search,
  Eye,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  Award,
  Target,
  Activity,
  Calendar,
  User,
  Building2,
  FileText,
  Image,
  Video,
  Music,
  File,
  Star,
  Zap,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  Maximize2,
  Minimize2,
  Settings,
  HelpCircle,
  Plus,
  Minus,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Clock,
  BarChart3,
  PieChart
} from 'lucide-react'
import toast from 'react-hot-toast'
import { creativeAPI } from '../api/creative'
import { projectsApi } from '../api/projects'
import { Badge, Button, EmptyState, PageHeader, inputClassName } from '../components/ui'

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
// PANEL COMPONENT
// ============================================================
const Panel = ({ title, icon: Icon, description, children, className = '' }) => (
  <div className={`rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 ${className}`}>
    <div className="border-b border-gray-200 bg-gradient-to-r from-indigo-50/50 to-white p-4 dark:border-gray-700 dark:from-indigo-950/20 dark:to-gray-800">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
          <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
    </div>
    <div className="p-4">{children}</div>
  </div>
)

// ============================================================
// FIELD COMPONENT
// ============================================================
const Field = ({ label, required, children }) => (
  <div className="space-y-1">
    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
      {label}
      {required && <span className="ml-1 text-rose-500">*</span>}
    </label>
    {children}
  </div>
)

// ============================================================
// METRIC CARD COMPONENT
// ============================================================
const MetricCard = ({ label, value, color = 'indigo' }) => {
  const colors = {
    indigo: 'border-indigo-200 bg-indigo-50 dark:border-indigo-900/40 dark:bg-indigo-950/20',
    emerald: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20',
    amber: 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20',
    rose: 'border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20',
    blue: 'border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20',
  }

  return (
    <div className={`rounded-xl border ${colors[color]} p-3`}>
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}

// ============================================================
// ISSUE CARD COMPONENT
// ============================================================
const IssueCard = ({ issue }) => (
  <div className="rounded-xl border border-gray-200 p-4 transition hover:border-indigo-200 dark:border-gray-700 dark:hover:border-indigo-700">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {issue.severity === 'critical' ? (
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          ) : issue.severity === 'warning' ? (
            <AlertCircle className="h-4 w-4 text-amber-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-blue-500" />
          )}
          <h4 className="font-semibold text-gray-900 dark:text-white">{issue.title}</h4>
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{issue.description}</p>
      </div>
      <Badge 
        label={issue.severity || 'info'} 
        colorKey={issue.severity === 'critical' ? 'warning' : issue.severity === 'warning' ? 'pending' : 'info'} 
      />
    </div>
    {issue.suggested_fix && (
      <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        <span className="font-medium">Suggested fix:</span> {issue.suggested_fix}
      </div>
    )}
    <div className="mt-2 flex flex-wrap gap-2">
      <Badge label={`Confidence ${Math.round((issue.confidence || 0) * 100)}%`} colorKey="info" />
      <Badge label={issue.analyzer_key || 'rule'} colorKey="scheduled" />
    </div>
  </div>
)

// ============================================================
// SUGGESTION CARD COMPONENT
// ============================================================
const SuggestionCard = ({ item }) => (
  <div className="rounded-xl border border-gray-200 p-4 transition hover:border-indigo-200 dark:border-gray-700 dark:hover:border-indigo-700">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <h4 className="font-semibold text-gray-900 dark:text-white">{item.title}</h4>
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{item.recommended_fix}</p>
      </div>
      <Badge label={item.priority || 'medium'} colorKey={item.priority === 'high' ? 'warning' : 'info'} />
    </div>
  </div>
)

// ============================================================
// REVIEW CARD COMPONENT
// ============================================================
const ReviewCard = ({ review, isSelected, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full rounded-xl border p-4 text-left transition-all hover:shadow-md ${
      isSelected 
        ? 'border-indigo-300 bg-indigo-50 shadow-md dark:border-indigo-700 dark:bg-indigo-950/30' 
        : 'border-gray-200 bg-white hover:border-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-700'
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {review.summary || review.asset_id || 'Review'}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Clock className="h-3 w-3" />
          <span>{format(new Date(review.created_at || review.createdAt || Date.now()), 'MMM d, yyyy')}</span>
          <span className="h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
          <span className="capitalize">{review.risk_level || 'unknown'} risk</span>
        </div>
      </div>
      <Badge label={review.status || 'pending'} colorKey={review.status === 'completed' ? 'active' : 'scheduled'} />
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <Badge label={`Overall ${review.overall_score ?? '-'}`} colorKey="info" />
      <Badge label={`Issues ${review.issue_count ?? 0}`} colorKey="scheduled" />
      {review.critical_issue_count > 0 && (
        <Badge label={`Critical ${review.critical_issue_count}`} colorKey="warning" />
      )}
    </div>
  </button>
)

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function CreativeDirector() {
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [files, setFiles] = useState([])
  const [reviews, setReviews] = useState([])
  const [selectedReviewId, setSelectedReviewId] = useState('')
  const [reviewDetail, setReviewDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [campaignId, setCampaignId] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [objective, setObjective] = useState('')
  const [channel, setChannel] = useState('instagram')
  const [selectedFileId, setSelectedFileId] = useState('')

  const loadProjects = useCallback(async () => {
    try {
      const response = await projectsApi.getProjects()
      const nextProjects = response.projects || response.data?.projects || []
      setProjects(nextProjects)
      setSelectedProjectId((current) => current || nextProjects[0]?.id || '')
    } catch (error) {
      toast.error('Failed to load projects')
      setProjects([])
    }
  }, [])

  const loadProjectData = useCallback(async (projectId) => {
    if (!projectId) return
    try {
      setLoading(true)
      const [filesResponse, reviewsResponse] = await Promise.all([
        projectsApi.getProjectFiles(projectId),
        creativeAPI.listProjectReviews(projectId, { limit: 20 }),
      ])
      const nextFiles = filesResponse.files || filesResponse.data?.files || []
      const nextReviews = reviewsResponse.reviews || reviewsResponse.data?.reviews || []
      setFiles(nextFiles)
      setReviews(nextReviews)
      setSelectedFileId(nextFiles[0]?.id || '')
      setSelectedReviewId(nextReviews[0]?.id || '')
      if (!nextReviews.length) setReviewDetail(null)
    } catch (error) {
      toast.error('Failed to load creative workspace')
      setFiles([])
      setReviews([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadReviewDetail = useCallback(async (reviewId) => {
    if (!reviewId) {
      setReviewDetail(null)
      return
    }
    try {
      setLoadingDetail(true)
      const response = await creativeAPI.getReview(reviewId)
      setReviewDetail(response.review ? response : { review: response.review || response, issues: response.issues || [], suggestions: response.suggestions || [] })
    } catch (error) {
      toast.error('Failed to load review details')
      setReviewDetail(null)
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (selectedProjectId) loadProjectData(selectedProjectId)
  }, [loadProjectData, selectedProjectId])

  useEffect(() => {
    if (selectedReviewId) loadReviewDetail(selectedReviewId)
  }, [loadReviewDetail, selectedReviewId])

  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId), [projects, selectedProjectId])
  const selectedFile = useMemo(() => files.find((file) => file.id === selectedFileId), [files, selectedFileId])

  const handleQueueReview = async () => {
    if (!selectedProjectId || !selectedFileId) {
      toast.error('Select a project and asset')
      return
    }

    try {
      setSubmitting(true)
      await creativeAPI.createProjectReview(selectedProjectId, {
        asset_id: selectedFile?.id,
        file_name: selectedFile?.name || selectedFile?.original_name,
        file_url: selectedFile?.url,
        mime_type: selectedFile?.type,
        file_size: selectedFile?.size,
        campaign_id: campaignId || undefined,
        campaign_name: campaignName || undefined,
        objective: objective || undefined,
        channel,
        designer_notes: objective || undefined,
        source_type: 'project_file',
      })
      toast.success('Creative review queued successfully! 🎨')
      await loadProjectData(selectedProjectId)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to queue creative review')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRefresh = async () => {
    if (selectedProjectId) await loadProjectData(selectedProjectId)
  }

  // Calculate stats
  const stats = useMemo(() => ({
    total: reviews.length,
    pending: reviews.filter(r => r.status === 'pending').length,
    completed: reviews.filter(r => r.status === 'completed').length,
    critical: reviews.filter(r => r.critical_issue_count > 0).length,
  }), [reviews])

  const reviewMetrics = useMemo(() => {
    const review = reviewDetail?.review
    return [
      { label: 'Brand', value: review?.brand_score ?? '-', color: 'indigo' },
      { label: 'UX', value: review?.ux_score ?? '-', color: 'blue' },
      { label: 'Accessibility', value: review?.accessibility_score ?? '-', color: 'emerald' },
      { label: 'Quality', value: review?.creative_quality_score ?? '-', color: 'amber' },
    ]
  }, [reviewDetail])

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
                <Wand2 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">Creative Director AI</h1>
                <p className="mt-1 text-indigo-100">
                  Review assets with evidence, version context, and approval-ready recommendations.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Approval workflow
              </span>
              <button 
                onClick={handleRefresh}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/30 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* STAT CARDS - 4 Cards with Gradients */}
      {/* ============================================================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Total Reviews" 
          value={stats.total} 
          icon={Layers3} 
          color="indigo"
          subtitle="All reviews"
        />
        <StatCard 
          label="Pending" 
          value={stats.pending} 
          icon={Clock} 
          color="amber"
          subtitle="Awaiting review"
        />
        <StatCard 
          label="Completed" 
          value={stats.completed} 
          icon={CheckCircle} 
          color="emerald"
          subtitle="Finished reviews"
        />
        <StatCard 
          label="Critical Issues" 
          value={stats.critical} 
          icon={AlertTriangle} 
          color="rose"
          subtitle="Need attention"
        />
      </div>

      {/* ============================================================ */}
      {/* MAIN GRID - Brief Panel & Asset Review */}
      {/* ============================================================ */}
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Brief Panel */}
          <Panel title="Brief Panel" icon={Wand2} description="Choose the project, asset, campaign, and channel that define the review context.">
            <div className="space-y-4">
              <Field label="Project" required>
                <select 
                  value={selectedProjectId} 
                  onChange={(event) => setSelectedProjectId(event.target.value)} 
                  className={inputClassName}
                >
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Asset" required>
                <select 
                  value={selectedFileId} 
                  onChange={(event) => setSelectedFileId(event.target.value)} 
                  className={inputClassName}
                >
                  <option value="">Select an asset</option>
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>{file.name || file.original_name}</option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Campaign ID">
                  <input 
                    value={campaignId} 
                    onChange={(event) => setCampaignId(event.target.value)} 
                    className={inputClassName} 
                    placeholder="campaign-001" 
                  />
                </Field>
                <Field label="Campaign Name">
                  <input 
                    value={campaignName} 
                    onChange={(event) => setCampaignName(event.target.value)} 
                    className={inputClassName} 
                    placeholder="Spring launch" 
                  />
                </Field>
              </div>
              <Field label="Creative Objective">
                <textarea 
                  value={objective} 
                  onChange={(event) => setObjective(event.target.value)} 
                  className={`${inputClassName} min-h-[112px] resize-none`} 
                  placeholder="Describe the goal, audience, and channel requirements." 
                />
              </Field>
              <Field label="Channel">
                <select 
                  value={channel} 
                  onChange={(event) => setChannel(event.target.value)} 
                  className={inputClassName}
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="landing_page">Landing Page</option>
                  <option value="email">Email</option>
                  <option value="banner">Banner</option>
                </select>
              </Field>
              <button 
                onClick={handleQueueReview} 
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Queuing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Queue Review
                  </>
                )}
              </button>
            </div>
          </Panel>

          {/* Asset Review Panel */}
          <Panel title="Asset Review" icon={Layers3} description="Review queue and approval state for the selected project.">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading reviews...</p>
                </div>
              </div>
            ) : reviews.length ? (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {reviews.map((review) => (
                  <ReviewCard 
                    key={review.id}
                    review={review}
                    isSelected={selectedReviewId === review.id}
                    onClick={() => setSelectedReviewId(review.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertTriangle className="h-12 w-12 text-gray-300 dark:text-gray-600" />
                <h3 className="mt-3 text-sm font-medium text-gray-900 dark:text-white">No reviews yet</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Queue an asset review to start the approval workflow.</p>
              </div>
            )}
          </Panel>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Evidence and Reasoning Panel */}
          <Panel title="Evidence and Reasoning" icon={BadgeCheck} description="Scores, findings, and rationale that support the approval decision.">
            {loadingDetail ? (
              <div className="flex h-96 items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading review details...</p>
                </div>
              </div>
            ) : reviewDetail?.review ? (
              <div className="space-y-5">
                {/* Metrics Grid */}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {reviewMetrics.map((metric) => (
                    <MetricCard key={metric.label} label={metric.label} value={metric.value} color={metric.color} />
                  ))}
                </div>

                {/* Summary */}
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Summary</p>
                  <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
                    {reviewDetail.review.summary || 'No summary available.'}
                  </p>
                </div>

                {/* Issues & Suggestions Grid */}
                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-4">
                    {/* Issues */}
                    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                      <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Issues</h4>
                      {reviewDetail.issues?.length ? (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                          {reviewDetail.issues.map((issue) => (
                            <IssueCard key={issue.id || issue.title} issue={issue} />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <CheckCircle className="h-10 w-10 text-emerald-500" />
                          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No issues found</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">The current asset passed the visible rule set.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column - Suggestions & Workflow */}
                  <div className="space-y-4">
                    {/* Suggestions */}
                    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                      <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Suggestions</h4>
                      {reviewDetail.suggestions?.length ? (
                        <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                          {reviewDetail.suggestions.map((item, index) => (
                            <SuggestionCard key={`${item.title}-${index}`} item={item} />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <Sparkles className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">No suggestions</p>
                        </div>
                      )}
                    </div>

                    {/* Approval Workflow */}
                    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Approval Workflow</h4>
                      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                        Human approval is required before the asset can be promoted. AI should explain why the asset is safe or risky, then wait.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge label={`Status ${reviewDetail.review.status || 'pending'}`} colorKey={reviewDetail.review.status === 'completed' ? 'active' : 'scheduled'} />
                        <Badge label={`Quality ${Number(reviewDetail.review.creative_quality_score || 0).toFixed(1)}`} colorKey="info" />
                      </div>
                    </div>

                    {/* Version Comparison */}
                    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Version Comparison</h4>
                      <div className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-700">
                          <span className="text-gray-500 dark:text-gray-500">Latest review</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {reviewDetail.review.completed_at ? format(new Date(reviewDetail.review.completed_at), 'MMM d, HH:mm') : 'Not completed'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-700">
                          <span className="text-gray-500 dark:text-gray-500">Selected asset</span>
                          <span className="font-medium text-gray-900 dark:text-white truncate max-w-[150px]">
                            {selectedFile?.name || selectedFile?.original_name || 'No asset selected'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 dark:text-gray-500">Project</span>
                          <span className="font-medium text-gray-900 dark:text-white truncate max-w-[150px]">
                            {selectedProject?.name || 'No project selected'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Feedback Timeline */}
                    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Feedback Timeline</h4>
                      <div className="mt-3 space-y-3">
                        {(reviewDetail.review.human_feedback || []).length ? (
                          reviewDetail.review.human_feedback.map((feedback, index) => (
                            <div key={`${feedback.action}-${index}`} className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
                              <div className="flex items-center gap-2">
                                {feedback.action === 'approved' ? (
                                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                                ) : feedback.action === 'rejected' ? (
                                  <XCircle className="h-4 w-4 text-rose-500" />
                                ) : (
                                  <MessageSquare className="h-4 w-4 text-blue-500" />
                                )}
                                <span className="font-semibold capitalize text-gray-900 dark:text-white">
                                  {feedback.action}
                                </span>
                              </div>
                              {feedback.notes && (
                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{feedback.notes}</p>
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="flex flex-col items-center justify-center py-6 text-center">
                            <MessageSquare className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">No feedback yet</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Bot className="h-16 w-16 text-gray-300 dark:text-gray-600" />
                <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">Select a review</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Choose an item from the review queue to inspect evidence and confidence.</p>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}