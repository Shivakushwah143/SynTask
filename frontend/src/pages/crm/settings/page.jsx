import { Settings } from 'lucide-react'
import { CRMPage, CRMRoutePlaceholder } from '../../../components/crm'

export default function CRMSettingsPage() {
  return (
    <CRMPage>
      <CRMRoutePlaceholder
        title="Settings"
        routeLabel="Settings"
        description="CRM settings placeholder for workspace configuration."
        icon={Settings}
      />
    </CRMPage>
  )
}
