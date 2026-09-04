// Role-aware "move to next stage" options for a task row in a List view.
//
// Mirrors the authoritative workflow in backend/app/services/task_workflow.py:
// which semantic action each actor may eventually perform on this task, whether
// that action is allowed from the task's CURRENT status right now, and — when it
// is not allowed yet — a human reason so the UI can render the option disabled
// with an explanatory tooltip (e.g. an admin/reviewer cannot approve a task that
// the assignee has not yet submitted for review).
//
// The UI never bypasses the backend: clicking an enabled option calls the same
// semantic endpoints the backend validates (start, submit-review, approve,
// request-revision, complete, reopen, and task update for assignment), so these
// rules only decide what a row offers and how it is presented.

import { STATUS_LABELS } from './tasksLifecycle'

// Canonical display order for options shown to one actor.
const STAGE_ORDER = ['assign', 'start_work', 'submit_review', 'approve', 'request_revision', 'complete', 'reopen']

const BLOCKED_REASON = 'Task is blocked by an incomplete dependency.'
const CHECKLIST_REASON = 'Complete all required checklist items before submitting for review.'
const APPROVE_WAIT_REASON = 'The assignee must submit the task for review before it can be approved.'
const REVISION_WAIT_REASON = 'The assignee must submit the task for review before a revision can be requested.'
const REVISION_RESUBMIT_REASON = 'Waiting for the assignee to finish revisions and resubmit.'

// A checklist item that is marked required but not yet completed.
export const requiredChecklistIncomplete = (task = {}) =>
  (Array.isArray(task.checklist) ? task.checklist : []).some((item) => item && item.required && !item.completed)

const statusLabel = (status) => STATUS_LABELS[status] || String(status || '').replace(/_/g, ' ')

/**
 * Compute the stage options the given actor may see for one task.
 *
 * @param {object} params
 * @param {object} params.task            serialized task (list payload)
 * @param {object|null} params.user       current user record
 * @param {boolean} params.canManage      true when the actor holds task-manage
 *                                        power on this task/project (mirrors the
 *                                        backend's can_manage_workflow shortcut:
 *                                        company admins, project task managers,
 *                                        and the task creator)
 * @returns {Array<object>} each option: { action, label, toStatus,
 *          toStatusLabel, enabled, disabledReason, requirement, description }
 */
export function computeTaskStageOptions({ task = {}, user = null, canManage = false } = {}) {
  const status = String(task.status || '').trim().toLowerCase()
  const userId = String(user?.id || user?._id || '')
  const assigneeId = task.assigned_to ? String(task.assigned_to) : ''
  const reviewerId = task.reviewer_id ? String(task.reviewer_id) : ''
  const isAssignee = Boolean(assigneeId) && assigneeId === userId
  const isReviewer = Boolean(reviewerId) && reviewerId === userId && reviewerId !== assigneeId
  const reviewRequired = Boolean(task.review_required)
  const blocked = Boolean(task.is_blocked)

  // Unknown/terminal statuses offer nothing from a List row (cancelled is
  // terminal; completed only offers reopen below).
  if (status === 'cancelled' || !['todo', 'assigned', 'in_progress', 'in_review', 'revision_required', 'approved', 'completed'].includes(status)) {
    return []
  }

  const rows = []
  const push = (option) => rows.push(option)

  // Manager: assign an unassigned To Do task (assignee is a requirement).
  if (canManage && status === 'todo' && !assigneeId) {
    push({
      action: 'assign',
      label: 'Assign to team member',
      toStatus: 'assigned',
      toStatusLabel: 'Assigned',
      enabled: true,
      disabledReason: '',
      requirement: 'assignee',
      description: 'Pick an employee to own the task. It moves from To Do to Assigned.',
    })
  }

  // Assignee (the person who owns execution).
  if (isAssignee) {
    if (status === 'assigned' || status === 'revision_required') {
      push({
        action: 'start_work',
        label: status === 'revision_required' ? 'Move to In Progress' : 'Start work',
        toStatus: 'in_progress',
        toStatusLabel: 'In Progress',
        enabled: !blocked,
        disabledReason: blocked ? BLOCKED_REASON : '',
        requirement: '',
        description: status === 'revision_required'
          ? 'Resume work after the revision. The task moves back to In Progress.'
          : 'Begin working on the task. It moves from Assigned to In Progress.',
      })
    }
    if (status === 'in_progress' && reviewRequired) {
      const checklistMissing = requiredChecklistIncomplete(task)
      push({
        action: 'submit_review',
        label: 'Submit for review',
        toStatus: 'in_review',
        toStatusLabel: 'In Review',
        enabled: !blocked && !checklistMissing,
        disabledReason: blocked ? BLOCKED_REASON : checklistMissing ? CHECKLIST_REASON : '',
        requirement: '',
        description: 'Hand the finished work to the reviewer. The task moves to In Review.',
      })
    }
    if (status === 'in_progress' && !reviewRequired) {
      push({
        action: 'complete',
        label: 'Mark complete',
        toStatus: 'completed',
        toStatusLabel: 'Completed',
        enabled: !blocked,
        disabledReason: blocked ? BLOCKED_REASON : '',
        requirement: '',
        description: 'No review is required, so the task can finish directly from In Progress.',
      })
    }
  }

  // Reviewer: decide on work that has been (or is about to be) submitted.
  if (isReviewer && reviewRequired) {
    if (status === 'in_review') {
      push({
        action: 'approve',
        label: 'Approve',
        toStatus: 'approved',
        toStatusLabel: 'Approved',
        enabled: true,
        disabledReason: '',
        requirement: '',
        description: 'Accept the submitted work. The task moves to Approved.',
      })
      push({
        action: 'request_revision',
        label: 'Request revision',
        toStatus: 'revision_required',
        toStatusLabel: 'Revision Required',
        enabled: true,
        disabledReason: '',
        requirement: 'reason',
        description: 'Send the work back with a required reason. The task moves to Revision Required.',
      })
    } else if (status === 'in_progress') {
      // The assignee must submit first — reviewer sees these blocked and why.
      push({
        action: 'approve',
        label: 'Approve',
        toStatus: 'approved',
        toStatusLabel: 'Approved',
        enabled: false,
        disabledReason: APPROVE_WAIT_REASON,
        requirement: '',
        description: '',
      })
      push({
        action: 'request_revision',
        label: 'Request revision',
        toStatus: 'revision_required',
        toStatusLabel: 'Revision Required',
        enabled: false,
        disabledReason: REVISION_WAIT_REASON,
        requirement: '',
        description: '',
      })
    } else if (status === 'revision_required') {
      push({
        action: 'approve',
        label: 'Approve',
        toStatus: 'approved',
        toStatusLabel: 'Approved',
        enabled: false,
        disabledReason: REVISION_RESUBMIT_REASON,
        requirement: '',
        description: '',
      })
    }
  }

  // Manager (task-management power) for the remaining stage decisions. For an
  // in_review task any workflow manager (company admin, project task manager,
  // or creator) can approve or request revision — the assignee is the only
  // actor excluded from approving their own work. Rows added by the reviewer
  // persona above carry identical values and are deduplicated below.
  if (canManage) {
    if (reviewRequired && status === 'in_review' && !isAssignee) {
      push({
        action: 'approve',
        label: 'Approve',
        toStatus: 'approved',
        toStatusLabel: 'Approved',
        enabled: true,
        disabledReason: '',
        requirement: '',
        description: 'Accept the submitted work. The task moves to Approved.',
      })
      push({
        action: 'request_revision',
        label: 'Request revision',
        toStatus: 'revision_required',
        toStatusLabel: 'Revision Required',
        enabled: true,
        disabledReason: '',
        requirement: 'reason',
        description: 'Send the work back with a required reason. The task moves to Revision Required.',
      })
    }
    if (reviewRequired && status === 'approved') {
      push({
        action: 'complete',
        label: 'Complete task',
        toStatus: 'completed',
        toStatusLabel: 'Completed',
        enabled: !blocked,
        disabledReason: blocked ? BLOCKED_REASON : '',
        requirement: '',
        description: 'Close the approved task. It moves from Approved to Completed.',
      })
    }
    if (status === 'completed') {
      push({
        action: 'reopen',
        label: 'Reopen',
        toStatus: 'assigned',
        toStatusLabel: 'Assigned',
        enabled: true,
        disabledReason: '',
        requirement: '',
        description: 'Send the completed task back to Assigned so work can continue.',
      })
    }
  }

  // Deduplicate (an actor can be assignee + reviewer/manager) and order options
  // by the canonical stage path, so the "next" action reads first.
  const byAction = new Map()
  rows.forEach((row) => {
    if (!byAction.has(row.action)) byAction.set(row.action, row)
  })
  return [...byAction.values()]
    .map((row) => ({ ...row, toStatusLabel: row.toStatusLabel || statusLabel(row.toStatus) }))
    .sort((left, right) => STAGE_ORDER.indexOf(left.action) - STAGE_ORDER.indexOf(right.action))
}

/**
 * Split options into available-now and not-yet-available buckets.
 */
export function summarizeStageOptions(options = []) {
  const enabled = options.filter((option) => option.enabled)
  const disabled = options.filter((option) => !option.enabled)
  return { options, enabled, disabled, total: options.length }
}

/**
 * Small canned success phrases for toasts after a stage runs.
 */
export const stageSuccessMessage = (action, fallbackTitle = 'Task') => {
  const phrases = {
    assign: 'Task assigned',
    start_work: 'Task started',
    submit_review: 'Task submitted for review',
    approve: 'Task approved',
    request_revision: 'Revision requested',
    complete: 'Task completed',
    reopen: 'Task reopened',
  }
  return phrases[action] || `${String(fallbackTitle).slice(0, 60)} updated`
}
