import { useQuery } from 'react-query'
import { MessageSquare, Clock, Cpu, BarChart2 } from 'lucide-react'
import { metaApi } from '../../../api/meta'

export function MetaAnalyticsPanel({ companyId }) {
  const { data, isLoading, isError } = useQuery(
    ['meta-analytics', companyId],
    () => metaApi.getAnalytics(companyId),
    { retry: false }
  )

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Omnichannel Analytics</h3>
        <p className="mt-2 text-sm text-slate-500">Loading metrics...</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h3 className="text-base font-semibold text-red-950">Omnichannel Analytics</h3>
        <p className="mt-2 text-sm text-red-700">Failed to load analytics metrics.</p>
      </div>
    )
  }

  const formatFRT = (seconds) => {
    if (!seconds || seconds <= 0) return 'N/A'
    if (seconds < 60) return `${Math.round(seconds)}s`
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    if (mins < 60) return `${mins}m ${secs}s`
    const hrs = Math.floor(mins / 60)
    const remMins = mins % 60
    return `${hrs}h ${remMins}m`
  }

  const channelBreakdown = data.channel_counts || {}
  const statusCounts = data.status_counts || {}
  const ai = data.ai_metrics || {}
  const crm = data.crm_metrics || {}

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-primary-500" />
            Omnichannel Analytics
          </h3>
          <p className="text-xs text-slate-500">Real-time engagement, AI acceptance, and response times.</p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={MessageSquare}
          label="Total Conversations"
          value={data.total_conversations}
          description={`${data.total_messages || 0} messages synced`}
          color="blue"
        />
        <MetricCard
          icon={Clock}
          label="Avg First Response"
          value={formatFRT(data.average_first_response_time_seconds)}
          description="Inbound to human send reply"
          color="amber"
        />
        <MetricCard
          icon={Cpu}
          label="AI Acceptance Rate"
          value={`${ai.acceptance_rate?.toFixed(1) || 0}%`}
          description={`${ai.approved_drafts || 0} / ${ai.total_drafts || 0} drafts approved`}
          color="emerald"
        />
        <MetricCard
          icon={BarChart2}
          label="CRM Lead Conversion"
          value={`${crm.conversion_rate?.toFixed(1) || 0}%`}
          description={`${crm.converted_conversations || 0} leads generated`}
          color="indigo"
        />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Channel breakdown & status */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Conversations by Channel</h4>
          <div className="mt-4 space-y-3">
            <ProgressBarLabel
              label="WhatsApp"
              count={channelBreakdown.whatsapp || 0}
              total={data.total_conversations}
              color="bg-green-500"
            />
            <ProgressBarLabel
              label="Instagram"
              count={channelBreakdown.instagram || 0}
              total={data.total_conversations}
              color="bg-pink-500"
            />
            <ProgressBarLabel
              label="Messenger"
              count={channelBreakdown.messenger || 0}
              total={data.total_conversations}
              color="bg-blue-500"
            />
          </div>
        </div>

        {/* Status and direction distributions */}
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Message Volumes</h4>
          <div className="mt-4 grid grid-cols-2 gap-4 text-center">
            <div className="rounded-lg bg-white p-3 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Incoming</span>
              <p className="mt-1 text-xl font-bold text-slate-900">{data.inbound_messages || 0}</p>
            </div>
            <div className="rounded-lg bg-white p-3 shadow-xs">
              <span className="text-xs font-medium text-slate-500">Outgoing</span>
              <p className="mt-1 text-xl font-bold text-slate-900">{data.outbound_messages || 0}</p>
            </div>
          </div>
          <div className="mt-4 flex justify-between text-xs text-slate-500">
            <span>Open: {statusCounts.open || 0}</span>
            <span>Pending: {statusCounts.pending || 0}</span>
            <span>Closed: {statusCounts.closed || 0}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function MetricCard({ icon: Icon, label, value, description, color }) {
  const colors = {
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    amber: 'text-amber-600 bg-amber-50 border-amber-100',
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
  }

  return (
    <div className="rounded-xl border border-slate-100 p-4 shadow-xs hover:shadow-sm transition-shadow bg-white">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 border ${colors[color] || colors.blue}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <span className="text-xs font-medium text-slate-500">{label}</span>
          <p className="text-lg font-bold text-slate-900 mt-0.5">{value}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{description}</p>
    </div>
  )
}

function ProgressBarLabel({ label, count, total, color }) {
  const percentage = total > 0 ? (count / total) * 100 : 0
  return (
    <div>
      <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
        <span>{label}</span>
        <span>{count} ({percentage.toFixed(0)}%)</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}
