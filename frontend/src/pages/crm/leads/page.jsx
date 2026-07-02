import { Users } from 'lucide-react'
import { CRMPage, CRMRoutePlaceholder } from '../../../components/crm'

export default function CRMLeadsPage() {
  return (
    <CRMPage>
      <CRMRoutePlaceholder
        title="Leads"
        routeLabel="Leads"
        description="Open a lead from the pipeline to view the lead workspace."
        icon={Users}
      />
    </CRMPage>
  )
}
