import { useQuery } from 'react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Briefcase } from 'lucide-react'
import { salesApi } from '../../api/sales'
import { Badge, Button, EmptyState, SkeletonCard, PageHeader } from '../../components/ui'
import { formatDate, formatMoney } from '../phase4Utils'

export default function ProspectDetail() {
  const { id } = useParams()
  const { data, isLoading, isError } = useQuery(['sales-prospect', id], () => salesApi.getProspect(id), { enabled: Boolean(id) })
  if (isLoading) return <div className="p-6"><SkeletonCard lines={8} /></div>
  if (isError || !data) return <div className="p-6"><EmptyState icon={Briefcase} title="Prospect not found" /></div>
  return (
    <div className="p-6">
      <PageHeader title={data.prospect_name || `${data.first_name || ''} ${data.last_name || ''}`} description={data.company_name || 'Sales prospect'} actions={<Link to="/sales/prospects"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>} />
      <div className="grid gap-4 md:grid-cols-3">
        <Info label="Status" value={<Badge label={data.status || 'open'} colorKey={data.status || 'active'} />} />
        <Info label="Stage" value={data.current_stage} />
        <Info label="Interest" value={data.interest_level} />
        <Info label="Expected Close" value={formatDate(data.estimated_close_date)} />
        <Info label="Won Amount" value={formatMoney(data.won_amount)} />
        <Info label="Phone" value={`${data.country_code || ''} ${data.phone || ''}`} />
      </div>
    </div>
  )
}

function Info({ label, value }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase text-gray-500">{label}</p><div className="mt-2 text-sm text-gray-900">{value || '-'}</div></div>
}
