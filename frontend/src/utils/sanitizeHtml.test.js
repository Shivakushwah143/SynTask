import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from './sanitizeHtml'

describe('sanitizeHtml', () => {
  it('removes scripts and inline event handlers from rendered HTML', () => {
    const dirty = '<p onclick="alert(1)">Hello</p><img src="x" onerror="alert(2)"><script>alert(3)</script>'

    const clean = sanitizeHtml(dirty)

    expect(clean).toContain('<p>Hello</p>')
    expect(clean).toContain('<img src="x">')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('<script')
  })

  it('returns an empty string for non-string values', () => {
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
    expect(sanitizeHtml({ html: '<p>Nope</p>' })).toBe('')
  })
})
