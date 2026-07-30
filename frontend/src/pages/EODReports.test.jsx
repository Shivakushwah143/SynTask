import { describe, expect, test } from 'vitest'
import { canSubmitOwnEODReport, canReviewEODReports } from './EODReports'

describe('EODReports role gates', () => {
  test('company admins review reports without submitting their own EOD', () => {
    expect(canSubmitOwnEODReport('admin')).toBe(false)
    expect(canSubmitOwnEODReport('sub_admin')).toBe(false)
    expect(canSubmitOwnEODReport('super_admin')).toBe(false)
    expect(canReviewEODReports('admin')).toBe(true)
    expect(canReviewEODReports('sub_admin')).toBe(true)
    expect(canReviewEODReports('super_admin')).toBe(true)
  })

  test('non-admin staff can submit their own EOD', () => {
    expect(canSubmitOwnEODReport('manager')).toBe(true)
    expect(canSubmitOwnEODReport('lead')).toBe(true)
    expect(canSubmitOwnEODReport('employee')).toBe(true)
  })
})
