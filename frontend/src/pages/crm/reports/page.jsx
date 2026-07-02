import { FileText } from 'lucide-react'
import { CRMPage, CRMRoutePlaceholder } from '../../../components/crm'

export default function CRMReportsPage() {
  return (
    <CRMPage>
      <CRMRoutePlaceholder
        title="Reports"
        routeLabel="Reports"
        description="Report workspace placeholder for later analytics."
        icon={FileText}
      />
    </CRMPage>
  )
}
