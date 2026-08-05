import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Save, XCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { inputClassName } from '../ui'
import { getStageStatusOptions } from '../../pages/crm/pipeline/utils'
import { parsePhonePaste } from '../ui/phoneUtils'
import {
  TRANSITION_FIELD_REGISTRY,
  buildStatusWarningMessage,
  formatAllowedValues,
  statusRequirementFieldLabel,
} from '../../utils/salesTransition'

const COUNTRY_CODES = Object.freeze([
  { value: '+91', label: 'India (+91)' },
  { value: '+1', label: 'US/Canada (+1)' },
  { value: '+44', label: 'UK (+44)' },
  { value: '+61', label: 'Australia (+61)' },
  { value: '+65', label: 'Singapore (+65)' },
  { value: '+971', label: 'UAE (+971)' },
  { value: '+81', label: 'Japan (+81)' },
  { value: '+86', label: 'China (+86)' },
])

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
  const [validationError, setValidationError] = useState('')

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
    setValidationError('')
  }, [open, fields, lead])

  if (!open) return null

  const effectiveSaving = saving || localSaving
  const canSave = fields.length > 0
  const canMove = canSave

  const handleFieldChange = (field, value) => {
    setValues((state) => ({ ...state, [field]: value }))
    if (validationError) setValidationError('')
  }

  // A phone number is the one required-details field that cannot be saved
  // empty: the Acquire -> Qualify gate only opens this popup because the lead
  // has no contactable number, so saving without one would produce a misleading
  // "Details saved" toast while the lead stays blocked.
  const validatePhone = () => {
    if (!fields.some((field) => field.field === 'phone')) return ''
    const phone = String(values.phone || '').replace(/\D/g, '')
    if (!phone) return 'Enter a mobile number before saving.'
    // The canonical rule is a 10-digit local number; non-+91 codes accept a
    // slightly wider range so valid international numbers are not blocked.
    const code = values.country_code || lead.country_code || '+91'
    const min = code === '+91' ? 10 : 7
    const max = code === '+91' ? 10 : 12
    if (phone.length < min || phone.length > max) {
      return code === '+91'
        ? `Mobile number must be exactly 10 digits (${phone.length} entered).`
        : `Mobile number must be ${min}-${max} digits (${phone.length} entered).`
    }
    return ''
  }

  const handlePhonePaste = (event) => {
    event.preventDefault()
    const pasted = event.clipboardData?.getData('text') || ''
    const { countryCode: detected, phoneNumber: clean } = parsePhonePaste(pasted, COUNTRY_CODES.map((c) => c.value))
    if (detected && COUNTRY_CODES.some((c) => c.value === detected)) handleFieldChange('country_code', detected)
    // The input itself is clamped to 10 digits (project rule); validation later
    // widens the accepted range for non-+91 codes so this stays safe.
    handleFieldChange('phone', String(clean || '').replace(/\D/g, '').slice(0, 10))
  }

  // When the popup saves a phone, always send the effective country code too
  // (defaulting to +91) so a lead without one still stores a dialable number.
  const buildPayload = () => {
    const payload = { ...values }
    if (fields.some((field) => field.field === 'phone')) {
      const code = values.country_code || lead.country_code || '+91'
      if (!payload.country_code) payload.country_code = code
    }
    return payload
  }

  const handleSave = async () => {
    if (!canSave || effectiveSaving) return
    const error = validatePhone()
    if (error) {
      setValidationError(error)
      return
    }
    setLocalSaving(true)
    try {
      await onSaveFields?.(buildPayload())
    } finally {
      setLocalSaving(false)
    }
  }

  const handleSaveAndMove = async () => {
    if (!canMove || effectiveSaving || moving) return
    const error = validatePhone()
    if (error) {
      setValidationError(error)
      return
    }
    setLocalSaving(true)
    try {
      await onSaveAndMove?.(buildPayload())
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
    if (field.type === 'phone') {
      const selectedCode = values.country_code || lead.country_code || '+91'
      const codes = COUNTRY_CODES.some((c) => c.value === selectedCode)
        ? COUNTRY_CODES
        : [...COUNTRY_CODES, { value: selectedCode, label: selectedCode }]
      return (
        <div className="mt-1.5 space-y-2">
          <div className="flex items-stretch gap-2">
            <select
              className={`${inputClassName} w-28 shrink-0`}
              value={selectedCode}
              onChange={(event) => handleFieldChange('country_code', event.target.value)}
              aria-label="Country code"
            >
              {codes.map((code) => (
                <option key={code.value} value={code.value}>{code.label}</option>
              ))}
            </select>
            <input
              id={fieldId}
              className={`${inputClassName} min-w-0 flex-1`}
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={values.phone ?? ''}
              onChange={(event) => handleFieldChange('phone', event.target.value.replace(/\D/g, '').slice(0, 10))}
              onPaste={handlePhonePaste}
              placeholder={selectedCode === '+91' ? 'Enter 10-digit mobile number' : 'Enter mobile number'}
              aria-label="Mobile number"
            />
          </div>
          {validationError ? (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{validationError}</p>
          ) : null}
        </div>
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
