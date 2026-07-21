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
} from 'lucide-react'
import toast from 'react-hot-toast'
import { creativeAPI } from '../api/creative'
import { projectsApi } from '../api/projects'
import { Badge, Button, EmptyState, PageHeader, inputClassName } from '../components/ui'
import { timeService } from '@/services/timeService'

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
      toast.success('Creative review queued')
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

  const reviewMetrics = useMemo(() => {
    const review = reviewDetail?.review
    return [
      { label: 'Brand', value: review?.brand_score ?? '-' },
      { label: 'UX', value: review?.ux_score ?? '-' },
      { label: 'Accessibility', value: review?.accessibility_score ?? '-' },
      { label: 'Quality', value: review?.creative_quality_score ?? '-' },
    ]
  }, [reviewDetail])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Creative Director AI"
        description="Review assets with evidence, version context, and approval-ready recommendations."
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleRefresh} loading={loading}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Badge label="Approval workflow" colorKey="scheduled" />
          </div>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-6">
          <Panel title="Brief panel" icon={Wand2} description="Choose the project, asset, campaign, and channel that define the review context.">
            <div className="space-y-4">
              <Field label="Project">
                <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} className={inputClassName}>
                  <option value="">Select a project</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </Field>
              <Field label="Asset">
                <select value={selectedFileId} onChange={(event) => setSelectedFileId(event.target.value)} className={inputClassName}>
                  <option value="">Select an asset</option>
                  {files.map((file) => <option key={file.id} value={file.id}>{file.name || file.original_name}</option>)}
                </select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Campaign ID">
                  <input value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className={inputClassName} placeholder="campaign-001" />
                </Field>
                <Field label="Campaign Name">
                  <input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} className={inputClassName} placeholder="Spring launch" />
                </Field>
              </div>
              <Field label="Creative objective">
                <textarea value={objective} onChange={(event) => setObjective(event.target.value)} className={`${inputClassName} min-h-[112px] resize-none`} placeholder="Describe the goal, audience, and channel requirements." />
              </Field>
              <Field label="Channel">
                <select value={channel} onChange={(event) => setChannel(event.target.value)} className={inputClassName}>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="landing_page">Landing Page</option>
                  <option value="email">Email</option>
                  <option value="banner">Banner</option>
                </select>
              </Field>
              <Button onClick={handleQueueReview} loading={submitting} className="w-full">
                <Upload className="h-4 w-4" />
                Queue review
              </Button>
            </div>
          </Panel>

          <Panel title="Asset review" icon={Layers3} description="Review queue and approval state for the selected project.">
            {loading ? (
              <EmptyState title="Loading reviews" description="Fetching project assets and review history." />
            ) : reviews.length ? (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <button
                    key={review.id}
                    type="button"
                    onClick={() => setSelectedReviewId(review.id)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${selectedReviewId === review.id ? 'border-primary-400 bg-primary-50 dark:border-primary-700 dark:bg-primary-950/30' : 'border-gray-200 bg-white hover:border-primary-300 dark:border-gray-800 dark:bg-gray-900'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{review.summary || review.asset_id || 'Review'}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {review.asset_id} • {review.risk_level || 'unknown'} risk
                        </div>
                      </div>
                      <Badge label={review.status || 'pending'} colorKey={review.status || 'pending'} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Badge label={`Overall ${review.overall_score ?? '-'}`} colorKey="info" />
                      <Badge label={`Issues ${review.issue_count ?? 0}`} colorKey="scheduled" />
                      <Badge label={`Critical ${review.critical_issue_count ?? 0}`} colorKey="warning" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={AlertTriangle} title="No reviews yet" description="Queue an asset review to start the approval workflow." />
            )}
          </Panel>
        </section>

        <section className="space-y-6">
          <Panel title="Evidence and reasoning" icon={BadgeCheck} description="Scores, findings, and rationale that support the approval decision.">
            {loadingDetail ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Clock3 className="h-4 w-4 animate-spin" />
                Loading review detail...
              </div>
            ) : reviewDetail?.review ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {reviewMetrics.map((metric) => (
                    <MetricCard key={metric.label} label={metric.label} value={metric.value} />
                  ))}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
                  <div className="text-xs uppercase tracking-[0.22em] text-gray-500">Summary</div>
                  <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{reviewDetail.review.summary || 'No summary available.'}</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-4">
                    <SectionList
                      title="Issues"
                      emptyLabel="No issues"
                      emptyDescription="The current asset passed the visible rule set."
                      items={reviewDetail.issues || []}
                      renderItem={(issue) => (
                        <div key={issue.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-gray-100">{issue.title}</div>
                              <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{issue.description}</p>
                            </div>
                            <Badge label={issue.severity || 'info'} colorKey={issue.severity === 'critical' ? 'warning' : 'pending'} />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <Badge label={`Confidence ${Math.round((issue.confidence || 0) * 100)}%`} colorKey="info" />
                            <Badge label={issue.analyzer_key || 'rule'} colorKey="scheduled" />
                          </div>
                          {issue.suggested_fix ? (
                            <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                              {issue.suggested_fix}
                            </p>
                          ) : null}
                        </div>
                      )}
                    />
                    <SectionList
                      title="Suggestions"
                      emptyLabel="No suggestions"
                      emptyDescription="AI suggestions will appear when the analyzer has enough evidence."
                      items={reviewDetail.suggestions || []}
                      renderItem={(item) => (
                        <div key={`${item.title}-${item.priority}`} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold text-gray-900 dark:text-gray-100">{item.title}</div>
                            <Badge label={item.priority || 'medium'} colorKey={item.priority || 'scheduled'} />
                          </div>
                          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{item.recommended_fix}</p>
                        </div>
                      )}
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Approval workflow</div>
                      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                        Human approval is required before the asset can be promoted. AI should explain why the asset is safe or risky, then wait.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge label={`Status ${reviewDetail.review.status || 'pending'}`} colorKey={reviewDetail.review.status || 'pending'} />
                        <Badge label={`Quality ${Number(reviewDetail.review.creative_quality_score || 0).toFixed(1)}`} colorKey="info" />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Version comparison</div>
                      <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                        Compare the selected asset against prior review history and keep the current version visible while discussing changes.
                      </p>
                      <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                        <p>Latest review: {reviewDetail.review.completed_at ? format(timeService.instant(reviewDetail.review.completed_at), 'MMM d, HH:mm') : 'Not completed'}</p>
                        <p>Selected asset: {selectedFile?.name || selectedFile?.original_name || 'No asset selected'}</p>
                        <p>Project: {selectedProject?.name || 'No project selected'}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Feedback timeline</div>
                      <div className="mt-3 space-y-3">
                        {(reviewDetail.review.human_feedback || []).length ? reviewDetail.review.human_feedback.map((feedback, index) => (
                          <div key={`${feedback.action}-${index}`} className="rounded-xl bg-gray-50 px-3 py-3 dark:bg-gray-950/40">
                            <div className="font-semibold capitalize text-gray-900 dark:text-gray-100">{feedback.action}</div>
                            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{feedback.notes || 'No notes'}</div>
                          </div>
                        )) : (
                          <EmptyState icon={Sparkles} title="No feedback yet" description="Reviewer actions will populate the timeline." />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState icon={Bot} title="Select a review" description="Choose an item from the review queue to inspect evidence and confidence." />
            )}
          </Panel>
        </section>
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, description, children }) {
  return (
    <section className="card p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {children}
    </label>
  )
}

function SectionList({ title, items, emptyLabel, emptyDescription, renderItem }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</div>
      <div className="mt-3 space-y-3">
        {items.length ? items.map((item) => renderItem(item)) : <EmptyState title={emptyLabel} description={emptyDescription} />}
      </div>
    </div>
  )
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950/40">
      <div className="text-xs uppercase tracking-[0.22em] text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  )
}
