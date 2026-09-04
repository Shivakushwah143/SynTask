import { describe, expect, test } from 'vitest'
import {
  computeTaskStageOptions,
  requiredChecklistIncomplete,
  stageSuccessMessage,
  summarizeStageOptions,
} from './taskStageOptions'

// Compact factory so each scenario reads like the backend transition rules.
const makeTask = (overrides = {}) => ({
  id: 'task-1',
  title: 'Build landing page',
  status: 'assigned',
  assigned_to: 'emp-1',
  assigned_to_name: 'Emma Employee',
  reviewer_id: 'rev-1',
  review_required: true,
  is_blocked: false,
  checklist: [],
  created_by: 'rev-1',
  ...overrides,
})

const user = (id, role = 'employee') => ({ id, role })

describe('requiredChecklistIncomplete', () => {
  test('flags required items that are not completed', () => {
    expect(requiredChecklistIncomplete({ checklist: [{ text: 'Wire API', required: true, completed: false }] })).toBe(true)
  })

  test('allows completed required items and optional items', () => {
    expect(requiredChecklistIncomplete({ checklist: [{ text: 'A', required: true, completed: true }, { text: 'B', required: false, completed: false }] })).toBe(false)
  })

  test('empty or missing checklist is never incomplete', () => {
    expect(requiredChecklistIncomplete({})).toBe(false)
    expect(requiredChecklistIncomplete({ checklist: [] })).toBe(false)
  })
})

describe('assignee (employee) next stages', () => {
  test('assigned task offers Start work as the only option', () => {
    const options = computeTaskStageOptions({ task: makeTask(), user: user('emp-1'), canManage: false })
    expect(summarizeStageOptions(options)).toEqual({
      options,
      enabled: [expect.objectContaining({ action: 'start_work', enabled: true })],
      disabled: [],
      total: 1,
    })
  })

  test('in_progress review-required task offers Submit for review', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'in_progress' }),
      user: user('emp-1'),
      canManage: false,
    })
    expect(options).toEqual([expect.objectContaining({ action: 'submit_review', label: 'Submit for review', toStatus: 'in_review', enabled: true })])
  })

  test('in_progress submit is disabled (with reason) while blocked', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'in_progress', is_blocked: true }),
      user: user('emp-1'),
      canManage: false,
    })
    expect(options).toEqual([expect.objectContaining({ action: 'submit_review', enabled: false, disabledReason: 'Task is blocked by an incomplete dependency.' })])
  })

  test('in_progress submit is disabled (with reason) until required checklist items are done', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'in_progress', checklist: [{ text: 'Tests', required: true, completed: false }] }),
      user: user('emp-1'),
      canManage: false,
    })
    expect(options).toEqual([expect.objectContaining({ action: 'submit_review', enabled: false, disabledReason: 'Complete all required checklist items before submitting for review.' })])
  })

  test('in_progress non-review task offers Mark complete directly', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'in_progress', review_required: false }),
      user: user('emp-1'),
      canManage: false,
    })
    expect(options).toEqual([expect.objectContaining({ action: 'complete', toStatus: 'completed', enabled: true })])
  })

  test('revision_required task offers Move to In Progress (resume)', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'revision_required' }),
      user: user('emp-1'),
      canManage: false,
    })
    expect(options).toEqual([expect.objectContaining({ action: 'start_work', label: 'Move to In Progress', enabled: true })])
  })

  test('employee who is not involved sees no options', () => {
    const options = computeTaskStageOptions({ task: makeTask({ status: 'in_review' }), user: user('other-emp'), canManage: false })
    expect(options).toEqual([])
  })
})

describe('reviewer (e.g. admin) next stages', () => {
  test('in_progress task: Approve and Request revision appear disabled with waiting-for-submission reasons', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'in_progress', assigned_to: 'emp-1', reviewer_id: 'rev-1' }),
      user: user('rev-1', 'admin'),
      canManage: true,
    })
    expect(options).toEqual([
      expect.objectContaining({ action: 'approve', enabled: false, disabledReason: 'The assignee must submit the task for review before it can be approved.' }),
      expect.objectContaining({ action: 'request_revision', enabled: false, disabledReason: 'The assignee must submit the task for review before a revision can be requested.' }),
    ])
  })

  test('in_review task: Approve and Request revision are both enabled', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'in_review', reviewer_id: 'rev-1' }),
      user: user('rev-1', 'admin'),
      canManage: true,
    })
    const summary = summarizeStageOptions(options)
    expect(summary.enabled.map((item) => item.action)).toEqual(['approve', 'request_revision'])
    expect(summary.disabled).toEqual([])
    expect(options[0]).toMatchObject({ action: 'approve', requirement: '' })
    expect(options[1]).toMatchObject({ action: 'request_revision', requirement: 'reason' })
  })

  test('revision_required task: reviewer can only wait for the resubmission', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'revision_required', reviewer_id: 'rev-1' }),
      user: user('rev-1', 'admin'),
      canManage: true,
    })
    expect(options).toEqual([expect.objectContaining({ action: 'approve', enabled: false, disabledReason: 'Waiting for the assignee to finish revisions and resubmit.' })])
  })

  test('reviewer who is also the assignee cannot approve their own work', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'in_review', assigned_to: 'rev-1', reviewer_id: 'rev-1' }),
      user: user('rev-1', 'admin'),
      canManage: true,
    })
    expect(options.some((item) => item.action === 'approve')).toBe(false)
  })
})

describe('manager-only stage decisions', () => {
  test('unassigned To Do task offers Assign (assignee requirement) to managers', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'todo', assigned_to: null }),
      user: user('mgr-1', 'manager'),
      canManage: true,
    })
    expect(options).toEqual([expect.objectContaining({ action: 'assign', requirement: 'assignee', enabled: true })])
  })

  test('in_review: an admin who is not the assigned reviewer can still approve', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'in_review', reviewer_id: 'rev-1' }),
      user: user('mgr-1', 'manager'),
      canManage: true,
    })
    const actions = options.map((item) => item.action)
    expect(actions).toEqual(['approve', 'request_revision'])
    expect(options.find((item) => item.action === 'approve')).toMatchObject({ enabled: true, disabledReason: '' })
    expect(options.find((item) => item.action === 'request_revision')).toMatchObject({ enabled: true, requirement: 'reason' })
  })

  test('in_review: an assignee (even a workflow manager) never gets the option to approve their own task', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'in_review', assigned_to: 'mgr-1', reviewer_id: 'rev-1' }),
      user: user('mgr-1', 'manager'),
      canManage: true,
    })
    expect(options.some((item) => item.action === 'approve')).toBe(false)
    // The assignee simply waits for the reviewer here.
    expect(options.length).toBe(0)
  })

  test('approved task offers Complete to managers', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'approved', reviewer_id: 'rev-1' }),
      user: user('mgr-1', 'manager'),
      canManage: true,
    })
    expect(options).toEqual([expect.objectContaining({ action: 'complete', label: 'Complete task', enabled: true })])
  })

  test('completed task offers Reopen to managers', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'completed' }),
      user: user('mgr-1', 'manager'),
      canManage: true,
    })
    expect(options).toEqual([expect.objectContaining({ action: 'reopen', enabled: true })])
  })
})

describe('task creation / terminal edge cases', () => {
  test('cancelled tasks offer no stage options to anyone', () => {
    const options = computeTaskStageOptions({
      task: makeTask({ status: 'cancelled' }),
      user: user('mgr-1', 'manager'),
      canManage: true,
    })
    expect(options).toEqual([])
  })

  test('completed assignee has nothing to advance', () => {
    const options = computeTaskStageOptions({ task: makeTask({ status: 'completed' }), user: user('emp-1'), canManage: false })
    expect(options).toEqual([])
  })

  test('unknown statuses produce no options', () => {
    const options = computeTaskStageOptions({ task: makeTask({ status: 'done' }), user: user('emp-1'), canManage: false })
    expect(options).toEqual([])
  })
})

describe('summarizeStageOptions', () => {
  test('buckets enabled and disabled options', () => {
    const summary = summarizeStageOptions([{ action: 'a', enabled: true }, { action: 'b', enabled: false }])
    expect(summary.total).toBe(2)
    expect(summary.enabled.map((item) => item.action)).toEqual(['a'])
    expect(summary.disabled.map((item) => item.action)).toEqual(['b'])
  })

  test('empty options produce empty buckets', () => {
    const summary = summarizeStageOptions([])
    expect(summary).toEqual({ options: [], enabled: [], disabled: [], total: 0 })
  })
})

describe('stageSuccessMessage', () => {
  test('maps every supported action to a canned phrase', () => {
    expect(stageSuccessMessage('start_work')).toBe('Task started')
    expect(stageSuccessMessage('submit_review')).toBe('Task submitted for review')
    expect(stageSuccessMessage('request_revision')).toBe('Revision requested')
    expect(stageSuccessMessage('assign')).toBe('Task assigned')
  })
})
