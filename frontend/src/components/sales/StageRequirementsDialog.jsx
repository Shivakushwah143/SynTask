import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Save, XCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { inputClassName } from '../ui'
import { getStageStatusOptions } from '../../pages/crm/pipeline/utils'
import {
  TRANSITION_FIELD_REGISTRY,
  buildStatusWarningMessage,
  formatAllowedValues,
  statusRequirementFieldLabel,
} from '../../utils/salesTransition'

// Shared required-details popup for blocked Sales stage transitions.
//
// Behavior:
// - Renders ONLY the editable fields the backend reported as missing.
// - Shows an amber warning banner for status/action requirements that must also
//   be satisfied (mixed validation case). The status is never auto-changed.
// - Save Details: persists the fields through the real lead-update API.
// - Save and Move Forward: persists, then re-runs the transition; the lead moves
//   only when every backend rule passes.
// - Unknown fields are rendered as a safe warning list (never uncontrolled
//   forms); a link opens the full lead edit instead.
export function StageRequirementsDialog({
  open,
  blocker,
  lead = {},
  users = [],
  onClose,
  onSaveFields,
  onSaveAndMove,
  saving = false,
  moving = false,
  onOpenLeadEditor,
  contextActions = [],
}) {
  const [values, setValues] = useState({})
  const [localSaving, setLocalSaving] = useState(false)

  const fields = useMemo(() => {
    if (!open) return []
    const missing = blocker?.missingFields || []
    const registry = TRANSITION_FIELD_REGISTRY
    return missing
      .map((item) => {
        const meta = registry[item?.field]
        if (!meta) return null
        return { ...meta, label: item?.label || meta.label }
      })
      .filter(Boolean)
  }, [open, blocker])

  const unknownFields = useMemo(() => {
    if (!open) return []
    const missing = blocker?.missingFields || []
    return missing.filter((item) => item?.field && !TRANSITION_FIELD_REGISTRY[item.field])
  }, [open, blocker])

  const statusRequirement = blocker?.statusRequirement || null
  const actionRequirement = blocker?.actionRequirement || null
  const showWarning = Boolean(statusRequirement || actionRequirement)

  useEffect(() => {
    if (!open) return
    const next = {}
    fields.forEach((field) => {
      const current = lead[field.field]
      if (current !== undefined && current !== null && current !== '') next[field.field] = current
    })
    setValues(next)
  }, [open, fields, lead])

  if (!open) return null

  const effectiveSaving = saving || localSaving
  const canSave = fields.length > 0
  const canMove = canSave

  const handleFieldChange = (field, value) => {
    setValues((state) => ({ ...state, [field]: value }))
  }

  const handleSave = async () => {
    if (!canSave || effectiveSaving) return
    setLocalSaving(true)
    try {
      await onSaveFields?.(values)
    } finally {
      setLocalSaving(false)
    }
  }

  const handleSaveAndMove = async () => {
    if (!canMove || effectiveSaving || moving) return
    setLocalSaving(true)
    try {
      await onSaveAndMove?.(values)
    } finally {
      setLocalSaving(false)
    }
  }

  const renderFieldInput = (field) => {
    const fieldId = `stage-requirement-${field.field}`
    if (field.type === 'select') {
      const options = getStageStatusOptions(field.optionsKey)
      return (
        <select
          id={fieldId}
          className={`${inputClassName} mt-1.5`}
          value={values[field.field] || ''}
          onChange={(event) => handleFieldChange(field.field, event.target.value)}
        >
          <option value="">Select {field.label.toLowerCase()}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )
    }
    if (field.type === 'user') {
      return (
        <select
          id={fieldId}
          className={`${inputClassName} mt-1.5`}
          value={values[field.field] || ''}
          onChange={(event) => handleFieldChange(field.field, event.target.value)}
        >
          <option value="">Select {field.label.toLowerCase()}</option>
          {(users || []).map((user) => {
            const id = String(user?.id || user?._id || user?.user_id || '')
            const label = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || user?.name || id
            return <option key={id} value={id}>{label}</option>
          })}
        </select>
      )
    }
    if (field.type === 'currency') {
      return (
        <input
          id={fieldId}
          className={`${inputClassName} mt-1.5`}
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={values[field.field] ?? ''}
          onChange={(event) => handleFieldChange(field.field, event.target.value)}
          placeholder="0"
        />
      )
    }
    if (field.type === 'textarea') {
      return (
        <textarea
          id={fieldId}
          className={`${inputClassName} mt-1.5 min-h-20`}
          value={values[field.field] || ''}
          onChange={(event) => handleFieldChange(field.field, event.target.value)}
        />
      )
    }
    return (
      <input
        id={fieldId}
        className={`${inputClassName} mt-1.5`}
        type="text"
        value={values[field.field] || ''}
        onChange={(event) => handleFieldChange(field.field, event.target.value)}
      />
    )
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      size="md"
      title="Complete the required details"
      description={blocker?.targetStage ? `This lead must be ready for ${blocker.targetStage} before it can move forward.` : 'Complete the missing information before moving this lead forward.'}
      zIndexClass="z-[80]"
      footer={(
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={effectiveSaving || moving}>
            Cancel
          </Button>
          {canSave ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSave}
                disabled={effectiveSaving || moving}
                loading={effectiveSaving && !moving}
                loadingText="Saving"
              >
                <Save className="h-4 w-4" />
                Save Details
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSaveAndMove}
                disabled={effectiveSaving || moving}
                loading={effectiveSaving || moving}
                loadingText={moving ? 'Moving' : 'Saving'}
              >
                <ArrowRight className="h-4 w-4" />
                Save and Move Forward
              </Button>
            </>
          ) : null}
        </div>
      )}
    >
      <div className="space-y-4">
        {blocker?.message ? (
          <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{blocker.message}</p>
        ) : null}

        {/* Warning banner for status/action requirements (never auto-changed) */}
        {showWarning ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {statusRequirement ? `${statusRequirementFieldLabel(statusRequirement)} required` : (actionRequirement?.label || 'Action required')}
              </p>
              <p className="mt-1 text-sm leading-6 text-amber-700 dark:text-amber-300/90">
                {buildStatusWarningMessage(blocker)}
              </p>
              {statusRequirement?.allowed_values?.length ? (
                <p className="mt-1 text-xs font-medium text-amber-700/90 dark:text-amber-300/80">
                  Required: {formatAllowedValues(statusRequirement.allowed_values)}
                </p>
              ) : null}
              {statusRequirement?.current_value ? (
                <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-300/70">
                  Current: {String(statusRequirement.current_value).replace(/_/g, ' ')}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Only the missing editable fields */}
        {fields.length ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
              Missing details
            </p>
            {fields.map((field) => (
              <label key={field.field} className="block rounded-xl border border-surface-border/80 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                  {field.label}
                </span>
                {renderFieldInput(field)}
              </label>
            ))}
          </div>
        ) : null}

        {/* One-click completion actions (e.g. Create Client / Create Invoice
            behind the Won -> Clients transfer blocker). Each action is provided
            by the caller and keeps the popup open until the blocker clears. */}
        {contextActions.length ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
              Complete in one click
            </p>
            {contextActions.map((action) => (
              <Button
                key={action.key}
                type="button"
                variant="secondary"
                size="sm"
                className="w-full justify-center"
                loading={action.loading}
                disabled={effectiveSaving || moving}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}

        {/* Unknown fields: safe warning list, never uncontrolled forms */}
        {unknownFields.length ? (
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Additional information is required
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-700 dark:text-amber-300/90">
              {unknownFields.map((item) => (
                <li key={item.field}>{item.label || String(item.field).replace(/_/g, ' ')}</li>
              ))}
            </ul>
            {onOpenLeadEditor ? (
              <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={onOpenLeadEditor}>
                Open full lead editor
              </Button>
            ) : null}
          </div>
        ) : null}

        {!fields.length && !unknownFields.length && !showWarning ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              All required details are complete. The lead can move forward.
            </p>
          </div>
        ) : null}

        {(effectiveSaving || moving) ? (
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {moving ? 'Moving the lead forward...' : 'Saving details...'}
          </div>
        ) : null}

        <p className="flex items-start gap-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          The lead stays on its current stage until the transition is accepted by the backend.
        </p>
      </div>
    </Modal>
  )
}
