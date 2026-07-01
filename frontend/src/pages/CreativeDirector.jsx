import { useEffect, useMemo, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { AlertTriangle, Bot, CheckCircle2, Clock3, FolderKanban, RefreshCw, Sparkles, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { creativeAPI } from '../api/creative'
import { projectsApi } from '../api/projects'
import { Button, EmptyState, PageHeader } from '../components/ui'

const statusClass = {
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  queued: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200',
  running: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200',
}

export default function CreativeDirector() {
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [files, setFiles] = useState([])
  const [reviews, setReviews] = useState([])
  const [selectedReview, setSelectedReview] = useState(null)
  const [reviewDetail, setReviewDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [campaignId, setCampaignId] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [objective, setObjective] = useState('')
  const [channel, setChannel] = useState('instagram')
  const [fileId, setFileId] = useState('')

  const loadProjects = useCallback(async () => {
    try {
      const data = await projectsApi.getProjects()
      const nextProjects = data.projects || data || []
      setProjects(nextProjects)
      setSelectedProjectId((current) => current || nextProjects[0]?.id || '')
    } catch (error) {
      toast.error('Failed to load projects')
    }
  }, [])

  const loadProjectData = useCallback(async (projectId) => {
    try {
      setLoading(true)
      const [filesResponse, reviewsResponse] = await Promise.all([
        projectsApi.getProjectFiles(projectId),
        creativeAPI.listProjectReviews(projectId, { limit: 20 }),
      ])
      setFiles(filesResponse.files || [])
      setReviews(reviewsResponse.reviews || [])
      setFileId((filesResponse.files || [])[0]?.id || '')
      if ((reviewsResponse.reviews || []).length) {
        setSelectedReview((reviewsResponse.reviews || [])[0].id)
      } else {
        setSelectedReview(null)
        setReviewDetail(null)
      }
    } catch (error) {
      toast.error('Failed to load creative data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedReview) return
    loadReviewDetail(selectedReview)
  }, [selectedReview, loadReviewDetail])

  const loadReviewDetail = useCallback(async (reviewId) => {
    try {
      setLoadingDetail(true)
      const data = await creativeAPI.getReview(reviewId)
      setReviewDetail(data)
    } catch (error) {
      toast.error('Failed to load review details')
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    if (!selectedProjectId) return
    loadProjectData(selectedProjectId)
  }, [selectedProjectId, loadProjectData])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  )

  const handleQueueReview = async () => {
    if (!selectedProjectId || !fileId) {
      toast.error('Select a project and asset')
      return
    }
    const file = files.find((item) => item.id === fileId)
    try {
      setLoading(true)
      await creativeAPI.createProjectReview(selectedProjectId, {
        asset_id: file?.id,
        file_name: file?.name || file?.original_name,
        file_url: file?.url,
        mime_type: file?.type,
        file_size: file?.size,
        campaign_id: campaignId || undefined,
        campaign_name: campaignName || undefined,
        objective: objective || undefined,
        channel: channel || undefined,
        designer_notes: objective || undefined,
        source_type: 'project_file',
      })
      toast.success('Creative review queued')
      await loadProjectData(selectedProjectId)
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to queue creative review')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    if (selectedProjectId) {
      await loadProjectData(selectedProjectId)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Creative Director AI"
        description="Review uploaded creative assets against campaign, brand, accessibility, and requirement context."
        actions={
          <Button variant="ghost" onClick={handleRefresh} loading={loading}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Queue review</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Choose a project file or campaign to scan.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Project</span>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-100"
              >
                <option value="">Select a project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Asset</span>
              <select
                value={fileId}
                onChange={(event) => setFileId(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-100"
              >
                <option value="">Select a project file</option>
                {files.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.name || file.original_name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Campaign ID</span>
                <input
                  value={campaignId}
                  onChange={(event) => setCampaignId(event.target.value)}
                  placeholder="campaign-001"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Campaign Name</span>
                <input
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="Spring Ads"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Campaign objective</span>
              <textarea
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
                placeholder="Drive signups for the new product launch"
                className="min-h-[112px] w-full resize-none rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Channel</span>
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-950/70 dark:text-gray-100"
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="landing_page">Landing Page</option>
                <option value="email">Email</option>
                <option value="banner">Banner</option>
              </select>
            </label>

            <Button onClick={handleQueueReview} loading={loading} className="w-full">
              <Upload className="h-4 w-4" />
              Queue creative review
            </Button>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Selected project</div>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {selectedProject ? selectedProject.name : 'No project selected'}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-3 dark:bg-gray-900">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Files</div>
                <div className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{files.length}</div>
              </div>
              <div className="rounded-2xl bg-white p-3 dark:bg-gray-900">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Reviews</div>
                <div className="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">{reviews.length}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Review timeline</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Latest reviews for this project.</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {reviews.length ? reviews.map((review) => (
                <button
                  key={review.id}
                  type="button"
                  onClick={() => setSelectedReview(review.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    selectedReview === review.id
                      ? 'border-primary-400 bg-primary-50 dark:border-primary-700 dark:bg-primary-950/30'
                      : 'border-gray-200 bg-white hover:border-primary-200 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950/40 dark:hover:border-primary-700/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {review.summary || review.asset_id}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {review.asset_id} • {review.risk_level} risk
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[review.status] || statusClass.pending}`}>
                      {review.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">Overall {review.overall_score}</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">Issues {review.issue_count}</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">Critical {review.critical_issue_count}</span>
                    {review.completed_at ? (
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
                        {format(new Date(review.completed_at), 'MMM d, HH:mm')}
                      </span>
                    ) : null}
                  </div>
                </button>
              )) : (
                <EmptyState
                  icon={AlertTriangle}
                  title="No creative reviews yet"
                  description="Upload a file or queue a review to populate this timeline."
                />
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Review details</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Scores, issues, suggestions, and human feedback.</p>
              </div>
            </div>

            {loadingDetail ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Clock3 className="h-4 w-4 animate-spin" />
                Loading review detail...
              </div>
            ) : reviewDetail?.review ? (
              <div className="mt-5 space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    ['Brand', reviewDetail.review.brand_score],
                    ['UX', reviewDetail.review.ux_score],
                    ['Accessibility', reviewDetail.review.accessibility_score],
                    ['Marketing', reviewDetail.review.marketing_score],
                    ['Requirements', reviewDetail.review.requirement_score],
                    ['Quality', reviewDetail.review.creative_quality_score],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                      <div className="text-xs uppercase tracking-[0.2em] text-gray-500">{label}</div>
                      <div className="mt-1 text-2xl font-black text-gray-900 dark:text-gray-100">{Number(value || 0).toFixed(1)}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                  <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Summary</div>
                  <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{reviewDetail.review.summary}</p>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Issues</div>
                  <div className="mt-3 space-y-3">
                    {reviewDetail.issues.length ? reviewDetail.issues.map((issue) => (
                      <div key={issue.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100">{issue.title}</div>
                            <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{issue.description}</p>
                          </div>
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-200">
                            {issue.severity}
                          </span>
                        </div>
                        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                          Confidence {Math.round(issue.confidence * 100)}% • {issue.analyzer_key}
                        </div>
                        {issue.suggested_fix ? (
                          <div className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                            {issue.suggested_fix}
                          </div>
                        ) : null}
                      </div>
                    )) : (
                      <EmptyState icon={CheckCircle2} title="No issues" description="This asset passed the current rule set." />
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Suggestions</div>
                  <div className="mt-3 space-y-3">
                    {reviewDetail.suggestions.map((item) => (
                      <div key={`${item.title}-${item.priority}`} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{item.title}</div>
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                            {item.priority}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{item.recommended_fix}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Human feedback</div>
                  <div className="mt-3 space-y-2">
                    {reviewDetail.review.human_feedback?.length ? reviewDetail.review.human_feedback.map((feedback, index) => (
                      <div key={`${feedback.action}-${index}`} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                        <div className="font-semibold capitalize text-gray-900 dark:text-gray-100">{feedback.action}</div>
                        <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{feedback.notes || 'No notes'}</div>
                      </div>
                    )) : (
                      <EmptyState icon={Sparkles} title="No feedback yet" description="Reviewer actions will appear here and feed future AI context." />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={FolderKanban}
                title="Select a review"
                description="Choose an item from the timeline to inspect scores and findings."
              />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
