import { CalendarDays } from 'lucide-react'
import { CRMPage, CRMRoutePlaceholder } from '../../../components/crm'

export default function CRMCalendarPage() {
  return (
    <CRMPage>
      <CRMRoutePlaceholder
        title="Calendar"
        routeLabel="Calendar"
        description="Calendar workspace placeholder for meetings and scheduling."
        icon={CalendarDays}
      />
    </CRMPage>
  )
}
