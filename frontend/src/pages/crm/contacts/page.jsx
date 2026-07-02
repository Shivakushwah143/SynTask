import { Users } from 'lucide-react'
import { CRMPage, CRMRoutePlaceholder } from '../../../components/crm'

export default function CRMContactsPage() {
  return (
    <CRMPage>
      <CRMRoutePlaceholder
        title="Contacts"
        routeLabel="Contacts"
        description="Contact workspace placeholder for relationship management."
        icon={Users}
      />
    </CRMPage>
  )
}
