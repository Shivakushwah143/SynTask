import { describe, expect, it } from 'vitest'
import { buildTaskAssignmentOptions, canEditTaskDetails, getAttachmentKind, getProjectLeadName, getTaskStatusTone, getUserDisplayName, getUserId } from './TaskDetail.helpers'

describe('TaskDetail assignment helpers', () => {
  it('splits assignable users into lead and employee options', () => {
    const options = buildTaskAssignmentOptions([
      { id: 'lead-1', role: 'lead', first_name: 'Leena' },
      { id: 'employee-1', role: 'employee', first_name: 'Asha' },
      { id: 'manager-1', role: 'manager', first_name: 'Maya' },
    ])

    expect(options.leads.map(getUserId)).toEqual(['lead-1'])
    expect(options.employees.map(getUserId)).toEqual(['employee-1'])
  })

  it('adds current lead when lead endpoint only returns employees', () => {
    const options = buildTaskAssignmentOptions(
      [{ id: 'employee-1', role: 'employee', first_name: 'Asha' }],
      { id: 'lead-1', role: 'lead', first_name: 'Leena' },
    )

    expect(options.leads.map(getUserId)).toEqual(['lead-1'])
    expect(options.employees.map(getUserId)).toEqual(['employee-1'])
  })

  it('formats names with email fallback', () => {
    expect(getUserDisplayName({ first_name: 'Asha', last_name: 'Rao' })).toBe('Asha Rao')
    expect(getUserDisplayName({ email: 'team@example.com' })).toBe('team@example.com')
  })

  it('resolves project leader name from assigned users', () => {
    expect(getProjectLeadName({
      assigned_users: [{ id: 'lead-1', name: 'Leena Rao', role: 'lead' }],
    })).toBe('Leena Rao')
  })

  it('resolves project leader from lead id and current user', () => {
    expect(getProjectLeadName(
      { lead_id: 'lead-1' },
      [],
      { id: 'lead-1', role: 'lead', first_name: 'Leena', last_name: 'Rao' },
    )).toBe('Leena Rao')
  })

  it('handles missing project while task loads', () => {
    expect(getProjectLeadName(null, [], null)).toBe('No leader assigned')
  })

  it('prevents employees from editing task details', () => {
    expect(canEditTaskDetails({ role: 'employee', id: 'employee-1' }, { assigned_to: 'employee-1' })).toBe(false)
  })

  it('allows managers to edit only same-department task details', () => {
    expect(canEditTaskDetails({ role: 'manager', department_id: 'delivery' }, { department_id: 'delivery' })).toBe(true)
    expect(canEditTaskDetails({ role: 'manager', department_id: 'delivery' }, { department_id: 'sales' })).toBe(false)
  })

  it('provides color-coded status tone', () => {
    expect(getTaskStatusTone('in_progress')).toEqual(expect.objectContaining({
      label: 'In Progress',
      chipClass: expect.stringContaining('blue'),
      selectClass: expect.stringContaining('blue'),
    }))
    expect(getTaskStatusTone('blocked_custom').label).toBe('blocked custom')
  })
})

describe('getAttachmentKind', () => {
  it('classifies images by extension', () => {
    expect(getAttachmentKind('https://cdn.test/files/photo.png')).toBe('image')
    expect(getAttachmentKind('https://cdn.test/files/pic.JPG')).toBe('image')
  })

  it('classifies videos by extension (with query strings stripped)', () => {
    expect(getAttachmentKind('https://cdn.test/files/reel.mp4')).toBe('video')
    expect(getAttachmentKind('/api/v1/files/clip.webm?token=abc')).toBe('video')
  })

  it('classifies office/PDF documents', () => {
    expect(getAttachmentKind('https://cdn.test/files/report.pdf')).toBe('document')
    expect(getAttachmentKind('https://cdn.test/files/budget.xlsx')).toBe('document')
  })

  it('falls back to generic file for unknown extensions', () => {
    expect(getAttachmentKind('https://cdn.test/files/blob.xyz')).toBe('file')
    expect(getAttachmentKind('')).toBe('file')
  })
})
