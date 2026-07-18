import { describe, expect, it } from 'vitest'
import { buildMeetingParticipantOptions, filterMeetingParticipantOptions, toggleMeetingParticipantId, validateMeetingDuration } from './Meetings.helpers'

describe('Meetings helpers', () => {
  it('shows only junior participant names for a manager', () => {
    const options = buildMeetingParticipantOptions([
      { id: 'admin-1', role: 'admin', first_name: 'Ada' },
      { id: 'manager-2', role: 'manager', first_name: 'Maya' },
      { id: 'lead-1', role: 'lead', first_name: 'Leena', last_name: 'Rao' },
      { id: 'employee-1', role: 'employee', first_name: 'Asha' },
    ], { id: 'manager-1', role: 'manager' })

    expect(options.map((option) => option.label)).toEqual(['Leena Rao', 'Asha'])
    expect(options.map((option) => option.roleLabel)).toEqual(['Lead', 'Employee'])
  })

  it('shows only employee participant names for a lead', () => {
    const options = buildMeetingParticipantOptions([
      { id: 'lead-2', role: 'lead', first_name: 'Nia' },
      { id: 'employee-1', role: 'employee', first_name: 'Asha' },
    ], { id: 'lead-1', role: 'lead' })

    expect(options.map((option) => option.id)).toEqual(['employee-1'])
  })

  it('toggles selected participant ids', () => {
    expect(toggleMeetingParticipantId(['one'], 'two')).toEqual(['one', 'two'])
    expect(toggleMeetingParticipantId(['one', 'two'], 'one')).toEqual(['two'])
  })

  it('filters participant options by visible name, role, or email', () => {
    const options = [
      { id: 'one', label: 'Asha Patel', roleLabel: 'Employee', email: 'asha@example.com' },
      { id: 'two', label: 'Leena Rao', roleLabel: 'Lead', email: 'leena@example.com' },
    ]

    expect(filterMeetingParticipantOptions(options, 'asha').map((option) => option.id)).toEqual(['one'])
    expect(filterMeetingParticipantOptions(options, 'lead').map((option) => option.id)).toEqual(['two'])
    expect(filterMeetingParticipantOptions(options, 'example').map((option) => option.id)).toEqual(['one', 'two'])
  })

  it('validates duration boundaries', () => {
    expect(validateMeetingDuration(0)).toBe('Duration must be at least 1 minute')
    expect(validateMeetingDuration(60)).toBe('')
    expect(validateMeetingDuration(61)).toBe('Duration must be 60 minutes or less')
  })
})
