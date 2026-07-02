import { Users } from 'lucide-react'
import { CRMPage, CRMRoutePlaceholder } from '../../../components/crm'

export default function CRMLeadsPage() {
  return (
    <CRMPage>
      <CRMRoutePlaceholder
        title="Leads"
        routeLabel="Leads"
        description="Lead workspace placeholder for CRM intake."
        icon={Users}
      />
    </CRMPage>
  )
}
