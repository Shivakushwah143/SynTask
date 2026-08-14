import { FileText } from 'lucide-react'

import { PageHeader } from '../../components/ui'
import DocumentsTab from '../../modules/hr/recruitment/components/DocumentsTab'
import { useCanManageHrDocuments } from '../../modules/hr/recruitment/hooks/useCanManageHrDocuments'

/**
 * People → Documents — company-wide HR document management (Phase 2).
 *
 * Renders the shared DocumentsTab in global mode (no employee/candidate owner),
 * which reads the real /hr/documents backend list with backend filters for
 * owner type, document type, expiry state and visibility. Preview, download,
 * replace, history, metadata edit and archive all reuse the existing Phase 2
 * components/APIs — no second document system is introduced.
 */
export default function HRDocumentsPage() {
  const canManageHrDocuments = useCanManageHrDocuments()

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="HR Documents"
        description="All employee and candidate HR documents across the company. Search, filter, preview, and manage."
        actions={
          <span className="hidden items-center gap-2 text-sm text-text-muted sm:flex">
            <FileText className="h-4 w-4" /> Managed via HR Documents
          </span>
        }
      />
      <DocumentsTab canManage={canManageHrDocuments} />
    </div>
  )
}
