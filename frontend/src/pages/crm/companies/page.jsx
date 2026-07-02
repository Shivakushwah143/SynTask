import { Building2 } from 'lucide-react'
import { CRMPage, CRMRoutePlaceholder } from '../../../components/crm'

export default function CRMCompaniesPage() {
  return (
    <CRMPage>
      <CRMRoutePlaceholder
        title="Companies"
        routeLabel="Companies"
        description="Company workspace placeholder for account management."
        icon={Building2}
      />
    </CRMPage>
  )
}
