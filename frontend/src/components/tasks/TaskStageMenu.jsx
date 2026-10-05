import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, ChevronDown, ClipboardCheck, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { tasksAPI } from '../../api/tasks'
import { Button, FormField, Modal, inputClassName } from '../ui'
import { computeTaskStageOptions, stageSuccessMessage, summarizeStageOptions } from '../../pages/taskStageOptions'

const PANEL_WIDTH = 320

const displayName = (userItem) => {
  if (!userItem) return ''
  return userItem.name || [userItem.first_name, userItem.last_name].filter(Boolean).join(' ') || userItem.email || ''
}

const pickLabel = (task) => String(task?.title || '').length > 40 ? `${String(task?.title || '').slice(0, 40)}…` : task?.title

/**
 * Per-row "move to next stage" control for Task List views.
 *
 * - Only renders when the current user has stage options on this task (assignee
 *   execution, reviewer decisions, or manager stage decisions).
 * - Options are derived by computeTaskStageOptions from the same rules the
 *   backend validates, so buttons never pretend an action is possible when the
 *   task has not reached the stage where the actor may act (e.g. an admin
 *   reviewer sees Approve/Request revision greyed out until the assignee
 *   submits the task for review).
 * - An exact single next step (and nothing pending) runs in one click. Any
 *   other combination opens the "Choose next stage" modal so every stage is
 *   visible — e.g. an in_review task always lists Approve next to Request
 *   revision, with Approve disabled and explained when the current user is not
 *   the assigned reviewer.
 * - Options that need input (assignee for Assign, reason for Request revision)
 *   open a requirement modal before the semantic endpoint is called.
 */
export default function TaskStageMenu({ task, user, canManage = false, assignableUsers = [], updating = false, onUpdated }) {
  const options = useMemo(() => computeTaskStageOptions({ task, user, canManage }), [task, user, canManage])
  const summary = useMemo(() => summarizeStageOptions(options), [options])
  const { enabled, disabled } = summary
  const hasOptions = summary.total > 0

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [requirement, setRequirement] = useState(null)
  const [formError, setFormError] = useState('')
  const [busyAction, setBusyAction] = useState(null)

  const wrapperRef = useRef(null)
  const busy = Boolean(busyAction) || updating

  const closeMenus = () => {
    setMenuOpen(false)
    setPickerOpen(false)
  }

  useEffect(() => {
    if (!menuOpen) return undefined
    const onPointerDown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setMenuOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    const closeOnViewportChange = () => setMenuOpen(false)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', closeOnViewportChange)
    window.addEventListener('scroll', closeOnViewportChange, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', closeOnViewportChange)
      window.removeEventListener('scroll', closeOnViewportChange, true)
    }
  }, [menuOpen])

  const openMenu = () => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 300))
    const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH + 12, window.innerWidth - PANEL_WIDTH - 8))
    setMenuPosition({ top, left })
    setMenuOpen(true)
  }

  const runOption = async (option, payload = {}) => {
    if (busy) return
    setBusyAction(option.action)
    try {
      switch (option.action) {
        case 'assign':
          await tasksAPI.updateTask(task.id, { assigned_to: payload.assignee_id })
          break
        case 'start_work':
          await tasksAPI.startTask(task.id)
          break
        case 'submit_review':
          {
            const result = await tasksAPI.submitForReview(task.id, payload.reviewer_id || null, payload.proof || null)
            if (result.proof_error) toast.error(result.proof_error)
          }
          break
        case 'request_revision':
          await tasksAPI.requestRevision(task.id, payload.reason)
          break
        case 'approve':
          await tasksAPI.approveTask(task.id)
          break
        case 'complete':
          await tasksAPI.completeTask(task.id)
          break
        case 'reopen':
          await tasksAPI.reopenTask(task.id)
          break
        default:
          throw new Error('Unsupported stage action')
      }
      toast.success(stageSuccessMessage(option.action))
      await onUpdated?.()
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || 'Failed to update task stage')
    } finally {
      setBusyAction(null)
      setRequirement(null)
      closeMenus()
    }
  }

  const chooseOption = (option) => {
    if (option.action === 'submit_review') {
      setRequirement({ action: option.action, proof_name: '', proof_value: '', option })
      closeMenus()
      setFormError('')
      return
    }
    if (option.requirement) {
      setRequirement({ action: option.action, assignee_id: '', reason: '', option })
      closeMenus()
      setFormError('')
      return
    }
    runOption(option)
  }

  const handlePrimaryClick = () => {
    if (busy) return
    if (enabled.length === 0) {
      // Valid-but-not-yet-available stages: open the explanatory list.
      openMenu()
      return
    }
    if (enabled.length === 1 && disabled.length === 0) {
      chooseOption(enabled[0])
      return
    }
    // Several next stages, or one available action next to pending ones (e.g.
    // Approve for the assigned reviewer): show every stage in the modal.
    closeMenus()
    setPickerOpen(true)
  }

  const submitRequirement = (event) => {
    event.preventDefault()
    if (!requirement || busy) return
    if (requirement.action === 'assign' && !requirement.assignee_id) {
      setFormError('Select an employee to assign the task to.')
      return
    }
    if (requirement.action === 'request_revision' && !requirement.reason.trim()) {
      setFormError('A revision reason is required.')
      return
    }
    if (requirement.action === 'submit_review' && Boolean(requirement.proof_name?.trim()) !== Boolean(requirement.proof_value?.trim())) {
      setFormError('Enter both proof name and value, or use Skip.')
      return
    }
    runOption(requirement.option, {
      assignee_id: requirement.assignee_id,
      reason: requirement.reason,
      proof: requirement.action === 'submit_review' && requirement.proof_name.trim() && requirement.proof_value.trim()
        ? { name: requirement.proof_name.trim(), value: requirement.proof_value.trim() }
        : null,
    })
  }

  if (!hasOptions || !task) return null

  const fastAction = enabled.length === 1 && disabled.length === 0 ? enabled[0] : null
  const onlyDisabled = enabled.length === 0 && disabled.length > 0
  const singleLabel = fastAction ? fastAction.label : 'Next stage'

  const primaryButton = (onClick, extra = '') => (
    <Button
      variant={onlyDisabled ? 'secondary' : 'ghost'}
      size="sm"
      className={`whitespace-nowrap text-xs font-semibold ${onlyDisabled ? 'text-gray-400 dark:text-gray-500' : ''} ${extra}`}
      disabled={busy}
      onClick={onClick}
      title={onlyDisabled ? disabled.map((item) => item.disabledReason).filter(Boolean).join(' ') : undefined}
    >
      {onlyDisabled ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
      {singleLabel}
      {fastAction ? <ArrowRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
    </Button>
  )

  return (
    <div ref={wrapperRef} className="relative inline-flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {primaryButton(handlePrimaryClick)}

      {menuOpen && menuPosition ? (
        <div
          role="menu"
          aria-label="Stage options"
          className="fixed z-[70] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          style={{ top: menuPosition.top, left: menuPosition.left, width: PANEL_WIDTH, maxHeight: 'min(320px, calc(100dvh - 24px))' }}
          onClick={(event) => event.stopPropagation()}
        >
          {enabled.length > 0 ? (
            <div>
              <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Available now</p>
              {enabled.map((option) => (
                <button
                  key={option.action}
                  type="button"
                  onClick={() => { setMenuOpen(false); chooseOption(option) }}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-gray-800 transition-colors hover:bg-indigo-50 dark:text-gray-100 dark:hover:bg-indigo-950/40"
                >
                  <span className="flex items-center gap-2">
                    {option.requirement ? <UserPlus className="h-3.5 w-3.5 shrink-0 text-indigo-500" /> : <ArrowRight className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                    {option.label}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{option.toStatusLabel}</span>
                </button>
              ))}
            </div>
          ) : null}

          {disabled.length > 0 ? (
            <div className={enabled.length > 0 ? 'mt-1 border-t border-gray-100 pt-1 dark:border-gray-800' : ''}>
              <p className="flex items-center gap-1 px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                Not available yet
              </p>
              {disabled.map((option) => (
                <button
                  key={`${option.action}-disabled`}
                  type="button"
                  disabled
                  title={option.disabledReason || 'Not available yet'}
                  className="flex w-full cursor-not-allowed items-start gap-2 rounded-xl px-2.5 py-2 text-left opacity-60"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-600 dark:text-gray-300">{option.label}</span>
                    <span className="block text-xs leading-5 text-gray-400 dark:text-gray-500">{option.disabledReason || 'Not available yet'}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {enabled.length === 0 && disabled.length === 0 ? (
            <p className="px-2 py-2 text-xs text-gray-400 dark:text-gray-500">No stage options for you on this task.</p>
          ) : null}
        </div>
      ) : null}

      {/* Choose among the available/pending next stages */}
      <Modal
        isOpen={pickerOpen}
        onClose={() => { setPickerOpen(false); setFormError('') }}
        title="Choose next stage"
        description={pickLabel(task)}
      >
        <div className="space-y-1.5">
          {enabled.map((option) => (
            <button
              key={option.action}
              type="button"
              onClick={() => { setPickerOpen(false); chooseOption(option) }}
              disabled={busy}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50/60 px-4 py-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <ArrowRight className="h-4 w-4 text-indigo-500" />
                  {option.label}
                  {option.requirement ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      <ClipboardCheck className="h-3 w-3" />
                      {option.requirement === 'assignee' ? 'Assignee needed' : 'Reason required'}
                    </span>
                  ) : null}
                </span>
                {option.description ? <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{option.description}</span> : null}
              </span>
              <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">{option.toStatusLabel}</span>
            </button>
          ))}
        </div>

        {disabled.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/60 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-950/25">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Not available yet
            </p>
            <ul className="mt-2 space-y-1.5">
              {disabled.map((option) => (
                <li key={`${option.action}-picker-disabled`} className="text-xs leading-5 text-gray-600 dark:text-gray-400">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{option.label}</span>
                  {' — '}
                  {option.disabledReason || 'Not available yet'}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setPickerOpen(false)}>Cancel</Button>
        </div>
      </Modal>

      {/* Option that needs input before it can run */}
      <Modal
        isOpen={Boolean(requirement)}
        onClose={() => { if (!busy) { setRequirement(null); setFormError('') } }}
        title={requirement?.action === 'assign' ? 'Assign task' : requirement?.action === 'submit_review' ? 'Send for Review' : 'Request revision'}
        description={pickLabel(task)}
      >
        <form onSubmit={submitRequirement} className="space-y-4">
          <div className="flex items-start gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-sm leading-6 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {requirement?.action === 'assign'
                ? 'Requirement: choose the employee who will own this task. Assigning moves the task from To Do to Assigned.'
                : requirement?.action === 'submit_review' ? 'Add work proof (Optional). You can skip this step and still send the task for review.' : 'Requirement: a revision reason is required and will be shown to the assignee with the task.'}
            </span>
          </div>

          {requirement?.action === 'assign' ? (
            <FormField label="Assign to" required>
              <select
                className={inputClassName}
                value={requirement.assignee_id}
                onChange={(event) => { setRequirement((current) => ({ ...current, assignee_id: event.target.value })); setFormError('') }}
              >
                <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" value="">Select an employee…</option>
                {assignableUsers.map((userItem) => (
                  <option className="bg-white text-gray-900 dark:bg-gray-700 dark:text-white" key={userItem.id || userItem._id} value={userItem.id || userItem._id}>
                    {displayName(userItem)}
                  </option>
                ))}
              </select>
            </FormField>
          ) : requirement?.action === 'submit_review' ? (
            <div className="space-y-3"><FormField label="Proof Name"><input className={inputClassName} value={requirement.proof_name || ''} onChange={(event) => setRequirement((current) => ({ ...current, proof_name: event.target.value }))} /></FormField><FormField label="Link / Value"><input className={inputClassName} value={requirement.proof_value || ''} onChange={(event) => setRequirement((current) => ({ ...current, proof_value: event.target.value }))} /></FormField></div>
          ) : (
            <FormField label="Revision reason" required>
              <textarea
                rows={4}
                className={inputClassName}
                value={requirement?.reason || ''}
                onChange={(event) => { setRequirement((current) => ({ ...current, reason: event.target.value })); setFormError('') }}
                placeholder="Explain what needs to change before this task can be approved."
              />
            </FormField>
          )}

          {formError ? <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{formError}</p> : null}

          <div className="flex justify-end gap-2">
            {requirement?.action === 'submit_review' ? <Button variant="secondary" type="button" disabled={busy} onClick={() => runOption(requirement.option)}>Skip</Button> : <Button variant="secondary" type="button" disabled={busy} onClick={() => setRequirement(null)}>Cancel</Button>}
            <Button type="submit" loading={Boolean(busyAction)} loadingText={requirement?.action === 'assign' ? 'Assigning' : 'Requesting'} disabled={busy && !busyAction}>
              {requirement?.action === 'assign' ? 'Assign task' : requirement?.action === 'submit_review' ? 'Save & Review' : 'Send for revision'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
