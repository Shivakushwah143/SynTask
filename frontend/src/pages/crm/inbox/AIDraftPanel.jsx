import { useState } from 'react'
import { useMutation } from 'react-query'
import { Sparkles } from 'lucide-react'

import { metaAIDraftsApi } from '../../../api/metaAIDrafts'
import { Badge, Button, inputClassName } from '../../../components/ui'

const unwrap = (value) => value?.data || value || {}

const channelPolicy = (channel) => {
  if (channel === 'whatsapp') return 'WhatsApp: draft only. Later send must pass reply-window/template checks.'
  if (channel === 'instagram') return 'Instagram: draft only. Later send requires user-initiated thread and approved permissions.'
  if (channel === 'messenger') return 'Messenger: draft only. Later send requires valid Page messaging window.'
  return 'Select a Meta conversation to generate a governed draft.'
}

export function AIDraftPanel({ conversation, companyId }) {
  const [instruction, setInstruction] = useState('')
  const [draft, setDraft] = useState(null)

  const createMutation = useMutation(
    () => metaAIDraftsApi.createDraft(conversation.id, { instruction }, { companyId }),
    {
      onSuccess: (response) => setDraft(unwrap(response).item),
    },
  )
  const approveMutation = useMutation(
    () => metaAIDraftsApi.approveDraft(draft.id, { companyId }),
    {
      onSuccess: (response) => setDraft(unwrap(response).item),
    },
  )
  const rejectMutation = useMutation(
    () => metaAIDraftsApi.rejectDraft(draft.id, { reason: 'Rejected from inbox panel' }, { companyId }),
    {
      onSuccess: (response) => setDraft(unwrap(response).item),
    },
  )

  const disabled = !conversation?.id
  const busy = createMutation.isLoading || approveMutation.isLoading || rejectMutation.isLoading

  return (
    <section className="rounded-2xl border border-cyan-200/70 bg-cyan-50/70 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI reply draft</h3>
          </div>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            Approval required. Draft only. No provider send.
          </p>
        </div>
        <Badge label="Approval required" colorKey="warning" />
      </div>

      <p className="mt-3 rounded-xl border border-cyan-200 bg-white/70 px-3 py-2 text-xs text-gray-600 dark:border-cyan-900 dark:bg-gray-950/60 dark:text-gray-300">
        {channelPolicy(conversation?.channel)}
      </p>

      <label className="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-200">
        Draft instruction
        <input
          className={inputClassName}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Example: warm, short, ask for order number"
          disabled={disabled || busy}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={disabled || busy} onClick={() => createMutation.mutate()}>
          Generate AI draft
        </Button>
        {draft?.status && <Badge label={draft.status} colorKey={draft.status === 'approved' ? 'active' : 'warning'} />}
      </div>

      {draft?.draft_text ? (
        <div className="mt-4 space-y-3">
          <textarea
            className={`${inputClassName} min-h-[120px] w-full`}
            value={draft.draft_text}
            readOnly
            aria-label="AI draft text"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || draft.status === 'approved'} onClick={() => approveMutation.mutate()}>
              Approve draft
            </Button>
            <Button size="sm" variant="secondary" disabled={busy || draft.status === 'rejected'} onClick={() => rejectMutation.mutate()}>
              Reject
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
