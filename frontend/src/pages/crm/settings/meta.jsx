import { CRMPage, CRMPageTitle } from '../../../components/crm'
import { Badge } from '../../../components/ui'
import { MetaIntegrationSettings } from './MetaIntegrationSettings'

export default function CRMMetaIntegrationPage() {
  return (
    <CRMPage>
      <CRMPageTitle
        eyebrow="CRM Admin"
        title="Meta Integration"
        description="Admin-only connection status, webhook health, token setup, and read-only sync controls for Meta Lead Ads and marketing insights."
        actions={<Badge label="Admin only" colorKey="active" />}
      />
      <MetaIntegrationSettings />
    </CRMPage>
  )
}
