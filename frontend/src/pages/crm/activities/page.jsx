import { Activity } from 'lucide-react'
import { CRMPage, CRMRoutePlaceholder } from '../../../components/crm'

export default function CRMActivitiesPage() {
  return (
    <CRMPage>
      <CRMRoutePlaceholder
        title="Activities"
        routeLabel="Activities"
        description="Activity workspace placeholder for timeline and follow-ups."
        icon={Activity}
      />
    </CRMPage>
  )
}
