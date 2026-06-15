import { useQuery } from 'react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, User } from 'lucide-react'
import { salesApi } from '../../api/sales'
import { Badge, Button, EmptyState, LoadingSpinner, PageHeader } from '../../components/ui'
import { formatDate } from '../phase4Utils'

export default function ContactDetail() {
  const { id } = useParams()
  const { data, isLoading, isError } = useQuery(['sales-contact', id], () => salesApi.getContact(id), { enabled: Boolean(id) })

  if (isLoading) return <div className="p-6"><LoadingSpinner label="Loading contact" /></div>
  if (isError || !data) return <div className="p-6"><EmptyState icon={User} title="Contact not found" /></div>

  return (
    <div className="p-6">
      <PageHeader title={`${data.first_name || ''} ${data.last_name || ''}`} description={data.company_name || 'Sales contact'} actions={<Link to="/sales/contacts"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back</Button></Link>} />
      <div className="grid gap-4 md:grid-cols-2">
        <Info label="Email" value={data.email} />
        <Info label="Phone" value={`${data.country_code || ''} ${data.phone || ''}`} />
        <Info label="Company" value={data.company_name} />
        <Info label="Designation" value={data.designation} />
        <Info label="Channel" value={data.channel ? <Badge label={data.channel} /> : '-'} />
        <Info label="Created" value={formatDate(data.created_at)} />
      </div>
    </div>
  )
}

function Info({ label, value }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase text-gray-500">{label}</p><div className="mt-2 text-sm text-gray-900">{value || '-'}</div></div>
}
