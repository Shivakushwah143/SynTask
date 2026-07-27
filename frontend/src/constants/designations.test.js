import { describe, expect, it } from 'vitest'
import { getDesignationOptions } from './designations'

describe('designation options', () => {
  it('adds custom and current designations without duplicates', () => {
    const options = getDesignationOptions(['Developer Advocate'], 'Software Developer')

    expect(options).toContain('Developer Advocate')
    expect(options.filter((item) => item === 'Software Developer')).toHaveLength(1)
  })

  it('keeps a current designation that is not in defaults', () => {
    expect(getDesignationOptions([], 'AI Workflow Specialist')).toContain('AI Workflow Specialist')
  })
})
