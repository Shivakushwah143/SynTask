import { useMemo } from 'react'
import { useQuery } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, Filter, Sparkles, Users } from 'lucide-react'
import { crmApi } from '../../../api/crm'
import { CRMEmptyState, CRMPage, CRMPageTitle, CRMSection, CRMStatCard } from '../../../components/crm'
import { Badge, Button, Skeleton } from '../../../components/ui'

export default function CRMLeadsPage() {
  const navigate = useNavigate()
  const pipelineQuery = useQuery('crm-leads-entry', crmApi.getPipeline, {
    staleTime: 5 * 60 * 1000,
  })

  const board = useMemo(() => pipelineQuery.data || {}, [pipelineQuery.data])
  const stages = useMemo(() => (Array.isArray(board?.stages) ? board.stages : []), [board])
  const leadCount = useMemo(() => stages.reduce((sum, stage) => sum + (stage.leads?.length || 0), 0), [stages])
  const activeCount = useMemo(() => stages.reduce((sum, stage) => sum + (stage.leads || []).filter((lead) => !['won', 'lost', 'closed'].includes(String(lead?.status || '').toLowerCase())).length, 0), [stages])
  const recentLeads = useMemo(() => stages.flatMap((stage) => stage.leads || []).slice(0, 6), [stages])

  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM"
        title="Leads"
        description="Open a lead from the pipeline to enter the lead workspace."
        actions={(
          <Button variant="primary" onClick={() => navigate('/crm/pipeline')}>
            Open Pipeline
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CRMStatCard icon={Users} label="Total leads" value={String(leadCount)} tone="blue" />
        <CRMStatCard icon={Sparkles} label="Active leads" value={String(activeCount)} tone="emerald" />
        <CRMStatCard icon={CalendarDays} label="Pipeline stages" value={String(stages.length)} tone="amber" />
      </div>

      <CRMSection
        title="Lead entry points"
        description="The CRM lead workspace lives at /crm/leads/:leadId. Select a lead from the pipeline or related activity screens."
        actions={<Badge label="Sales module" colorKey="draft" />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>
            Go to Pipeline
          </Button>
          <Button variant="secondary" onClick={() => navigate('/crm/activities')}>
            View Activities
          </Button>
          <Button variant="secondary" onClick={() => navigate('/crm/companies')}>
            Open Companies
          </Button>
        </div>
      </CRMSection>

      <CRMSection title="Recent leads" description="Recently visible leads from the live pipeline board.">
        {pipelineQuery.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-24 w-full rounded-3xl" />)}
          </div>
        ) : pipelineQuery.isError ? (
          <CRMEmptyState
            icon={Filter}
            title="Unable to load leads"
            description={pipelineQuery.error?.response?.data?.detail || 'Try again from the pipeline screen.'}
            action={<Button variant="secondary" onClick={() => pipelineQuery.refetch()}>Retry</Button>}
          />
        ) : recentLeads.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentLeads.map((lead) => (
              <button
                key={lead.id || lead._id}
                type="button"
                onClick={() => navigate(`/crm/leads/${lead.id || lead._id}`)}
                className="rounded-3xl border border-surface-border/80 bg-white p-4 text-left shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{lead.company_name || lead.prospect_name || 'Lead'}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{lead.owner_name || lead.assigned_to_name || lead.assigned_to || 'Unassigned'}</p>
                  </div>
                  <Badge label={lead.current_stage || lead.stage || 'Unknown'} colorKey="draft" />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <CRMEmptyState
            icon={Users}
            title="No leads yet"
            description="Leads will appear here once the pipeline has records."
            action={<Button variant="secondary" onClick={() => navigate('/crm/pipeline')}>Open Pipeline</Button>}
          />
        )}
      </CRMSection>
    </CRMPage>
  )
}
