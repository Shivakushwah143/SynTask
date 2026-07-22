import { Badge } from '../../../components/ui'

export function getInstagramConnectionHealth(connection = {}) {
  if (!connection.instagram_business_account_id) {
    return { status: 'degraded', reason: 'Missing Instagram professional account ID.' }
  }
  if (!(connection.scopes || []).includes('instagram_manage_messages')) {
    return { status: 'degraded', reason: 'Missing instagram_manage_messages scope.' }
  }
  return { status: 'healthy', reason: null }
}

export function InstagramConnectionPanel({ connection = {} }) {
  const health = getInstagramConnectionHealth(connection)
  const scopedSenders = connection.scoped_sender_ids || []

  return (
    <section className="rounded-2xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Instagram Messaging</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Professional account inbound messaging only.</p>
        </div>
        <Badge label={health.status} colorKey={health.status === 'healthy' ? 'active' : 'draft'} />
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500 dark:text-gray-400">Professional account</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{connection.instagram_business_account_id || 'Not connected'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-gray-500 dark:text-gray-400">Scoped sender IDs</dt>
          <dd className="font-medium text-gray-900 dark:text-gray-100">{scopedSenders.length}</dd>
        </div>
      </dl>
      {health.reason ? <p className="mt-3 text-sm text-amber-700 dark:text-amber-200">{health.reason}</p> : null}
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        External gate: Instagram permissions/App Review required before production usage.
      </p>
    </section>
  )
}

export default InstagramConnectionPanel
