import { useMutation, useQueries, useQuery, useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import { Zap } from 'lucide-react'
import { superadminApi } from '../../api/superadmin'
import { EmptyState, PageHeader, SkeletonTable } from '../../components/ui'
import { asArray, getId } from '../phase4Utils'

export default function FeatureFlagsPage() {
  const queryClient = useQueryClient()
  const tenantsQuery = useQuery('superadmin-tenants-feature-matrix', () => superadminApi.getTenants({ limit: 1000 }))
  const featuresQuery = useQuery('superadmin-available-features', superadminApi.getAvailableFeatures)
  const tenants = asArray(tenantsQuery.data, ['tenants', 'companies'])
  const features = asArray(featuresQuery.data, ['features'])
  const companyFeatureQueries = useQueries(
    tenants.map((tenant) => ({
      queryKey: ['superadmin-features', getId(tenant)],
      queryFn: () => superadminApi.getCompanyFeatures(getId(tenant)),
      enabled: Boolean(getId(tenant)),
    })),
  )
  const toggle = useMutation(({ companyId, data }) => superadminApi.toggleFeature(companyId, data), {
    onSuccess: (_, variables) => {
      toast.success('Feature updated')
      queryClient.invalidateQueries(['superadmin-features', variables.companyId])
    },
    onError: (error) => toast.error(error.response?.data?.detail?.detail || error.response?.data?.detail || 'Could not update feature'),
  })

  if (tenantsQuery.isLoading || featuresQuery.isLoading) return <SkeletonTable rows={6} cols={6} />
  if (!tenants.length || !features.length) return <EmptyState icon={Zap} title="No feature flags found" />

  const featureMapFor = (index) => {
    const rows = asArray(companyFeatureQueries[index]?.data, ['features'])
    return Object.fromEntries(rows.map((feature) => [feature.key, feature]))
  }

  return (
    <div>
      <PageHeader title="Feature Flags" description="Toggle client access to platform features." />
      <div className="viewport-scroll-x rounded-2xl border border-surface-border bg-surface">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-surface-muted">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Company</th>
              {features.map((feature) => <th key={feature.key} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">{feature.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {tenants.map((tenant, index) => {
              const map = featureMapFor(index)
              return (
                <tr key={getId(tenant)}>
                  <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-text-primary">{tenant.name || tenant.company_name}</td>
                  {features.map((feature) => {
                    const flag = map[feature.key]
                    const enabled = Boolean(flag?.is_enabled)
                    return (
                      <td key={feature.key} className="px-5 py-4">
                        <button type="button" disabled={toggle.isLoading} onClick={() => toggle.mutate({ companyId: getId(tenant), data: { feature_key: feature.key, is_enabled: !enabled } })} className={`h-6 w-11 rounded-full p-1 transition ${enabled ? 'bg-green-600' : 'bg-gray-300'}`} aria-label={`${enabled ? 'Disable' : 'Enable'} ${feature.label} for ${tenant.name || tenant.company_name}`}>
                          <span className={`block h-4 w-4 rounded-full bg-white transition ${enabled ? 'translate-x-5' : ''}`} />
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
