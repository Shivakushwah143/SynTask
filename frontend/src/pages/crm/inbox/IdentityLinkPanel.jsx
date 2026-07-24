import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'

import { metaIdentityApi } from '../../../api/metaIdentity'
import { Badge, Button } from '../../../components/ui'

const unwrap = (value) => value?.data || value || { items: [] }

export function IdentityLinkPanel({ conversation, companyId }) {
  const identityId = conversation?.customer_identity_id
  const queryClient = useQueryClient()
  const [pendingSuggestion, setPendingSuggestion] = useState(null)
  const suggestionsQuery = useQuery(
    ['meta-identity-suggestions', identityId, companyId],
    () => metaIdentityApi.getSuggestions(identityId, { companyId }),
    { enabled: Boolean(identityId) },
  )
  const confirmMutation = useMutation(
    (targetIdentityId) => metaIdentityApi.confirmLink({
      identity_id: identityId,
      target_identity_id: targetIdentityId,
    }, { companyId }),
    {
      onSuccess: () => {
        setPendingSuggestion(null)
        queryClient.invalidateQueries(['meta-identity-suggestions'])
        queryClient.invalidateQueries(['meta-inbox-conversations'])
      },
    },
  )

  if (!conversation) {
    return null
  }

  const suggestions = unwrap(suggestionsQuery.data).items || []

  return (
    <section className="rounded-2xl border border-surface-border/80 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Identity linkage</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Deterministic suggestions only. No automatic merge; a person must confirm every link.
          </p>
        </div>
        <Badge label="No auto-merge" colorKey="warning" />
      </div>

      {!identityId ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          This conversation has no channel identity record yet.
        </p>
      ) : suggestionsQuery.isLoading ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Checking deterministic matches…</p>
      ) : suggestions.length ? (
        <div className="mt-4 space-y-3">
          {suggestions.map((suggestion) => (
            <article key={suggestion.identity_id} className="rounded-xl border border-surface-border/70 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {suggestion.display_name || suggestion.provider_user_id}
                  </p>
                  <p className="text-xs capitalize text-gray-500 dark:text-gray-400">
                    {suggestion.channel} · {suggestion.provider_user_id}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={confirmMutation.isLoading}
                  onClick={() => setPendingSuggestion(suggestion)}
                >
                  Confirm link
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(suggestion.evidence || []).map((item) => (
                  <Badge key={`${suggestion.identity_id}-${item.type}`} label={`${item.type}: ${item.value}`} colorKey="active" />
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          No deterministic cross-channel matches found.
        </p>
      )}
      {pendingSuggestion ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-semibold">Human confirmation required</p>
          <p className="mt-1">
            Confirm this {pendingSuggestion.channel} identity only if the evidence belongs to the same customer.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={confirmMutation.isLoading}
              onClick={() => confirmMutation.mutate(pendingSuggestion.identity_id)}
            >
              Yes, confirm link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingSuggestion(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
