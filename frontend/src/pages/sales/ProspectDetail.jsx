import { useMemo } from 'react'
import { useQuery } from 'react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Briefcase, Clock3, LayoutList } from 'lucide-react'
import { salesApi } from '../../api/sales'
import { crmApi } from '../../api/crm'
import { Badge, Button, EmptyState, SkeletonCard, PageHeader } from '../../components/ui'
import { formatDate, formatMoney } from '../phase4Utils'

export default function LeadDetail() {
  const { id } = useParams()
  const { data, isLoading, isError } = useQuery(['sales-prospect', id], () => salesApi.getLead(id), { enabled: Boolean(id) })
  const historyQuery = useQuery(['crm-pipeline-history', id], () => crmApi.getPipelineHistory(id), { enabled: Boolean(id) })
  const timelineQuery = useQuery(['crm-lead-timeline', id], () => crmApi.getLeadTimeline(id), { enabled: Boolean(id) })

  const history = useMemo(() => historyQuery.data?.history || historyQuery.data?.data?.history || [], [historyQuery.data])
  const timeline = useMemo(() => timelineQuery.data?.timeline || timelineQuery.data?.data?.timeline || [], [timelineQuery.data])

  if (isLoading) return <div className="p-6"><SkeletonCard lines={8} /></div>
  if (isError || !data) return <div className="p-6"><EmptyState icon={Briefcase} title="Lead not found" /></div>
  return (
    <div className="p-6">
      <PageHeader title={data.prospect_name || `${data.first_name || ''} ${data.last_name || ''}`} description={data.company_name || 'Lead'} actions={<Link to="/sales/prospects"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>} />
      <div className="grid gap-4 md:grid-cols-3">
        <Info label="Status" value={<Badge label={data.status || 'open'} colorKey={data.status || 'active'} />} />
        <Info label="Stage" value={data.current_stage} />
        <Info label="Interest" value={data.interest_level} />
        <Info label="Expected Close" value={formatDate(data.estimated_close_date)} />
        <Info label="Won Amount" value={formatMoney(data.won_amount)} />
        <Info label="Phone" value={`${data.country_code || ''} ${data.phone || ''}`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Stage history" icon={LayoutList} loading={historyQuery.isLoading}>
          {history.length ? history.map((item) => (
            <TimelineItem
              key={item.id || `${item.previous_stage}-${item.new_stage}-${item.timestamp}`}
              title={`${item.previous_stage || 'Unstaged'} → ${item.new_stage}`}
              subtitle={`${item.user_name || 'System'}${item.reason ? ` · ${item.reason}` : ''}`}
              meta={formatDate(item.timestamp)}
            />
          )) : <EmptyPanelState label="No stage changes recorded yet." />}
        </Panel>
        <Panel title="Lead timeline" icon={Clock3} loading={timelineQuery.isLoading}>
          {timeline.length ? timeline.map((item, index) => (
            <TimelineItem
              key={item.id || `${item.type || 'event'}-${index}`}
              title={item.title || item.event_name || item.type || 'Timeline event'}
              subtitle={item.description || item.message || item.summary || ''}
              meta={formatDate(item.created_at || item.timestamp)}
            />
          )) : <EmptyPanelState label="No timeline events available." />}
        </Panel>
      </div>
    </div>
  )
}

function Info({ label, value }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase text-gray-500">{label}</p><div className="mt-2 text-sm text-gray-900">{value || '-'}</div></div>
}

function Panel({ title, icon: Icon, loading, children }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 text-gray-500" /> : null}
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      {loading ? <SkeletonCard lines={4} /> : children}
    </section>
  )
}

function TimelineItem({ title, subtitle, meta }) {
  return (
    <article className="mb-3 rounded-md border border-gray-100 bg-gray-50 p-3 last:mb-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{title}</p>
          {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        {meta ? <span className="text-xs text-gray-400">{meta}</span> : null}
      </div>
    </article>
  )
}

function EmptyPanelState({ label }) {
  return <p className="text-sm text-gray-500">{label}</p>
}
