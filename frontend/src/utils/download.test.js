import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  decodeBlobErrorMessage,
  downloadBlob,
  extractErrorMessageFromPayload,
  getDownloadFilename,
  safeDownloadFilename,
} from './download'

describe('getDownloadFilename', () => {
  test('extracts quoted filename from Content-Disposition', () => {
    expect(getDownloadFilename('attachment; filename="INV-2026-0001.pdf"', 'fallback.pdf')).toBe('INV-2026-0001.pdf')
  })

  test('extracts unquoted filename', () => {
    expect(getDownloadFilename('attachment; filename=INV-2026-0001.pdf', 'fallback.pdf')).toBe('INV-2026-0001.pdf')
  })

  test('extracts RFC 5987 filename*', () => {
    expect(getDownloadFilename("attachment; filename*=UTF-8''INV%202026.pdf", 'fallback.pdf')).toBe('INV 2026.pdf')
  })

  test('falls back when the header is missing', () => {
    expect(getDownloadFilename(undefined, 'fallback.pdf')).toBe('fallback.pdf')
    expect(getDownloadFilename('', 'fallback.pdf')).toBe('fallback.pdf')
  })

  test('ignores bare attachment/inline tokens without a filename', () => {
    expect(getDownloadFilename('attachment', 'fallback.pdf')).toBe('fallback.pdf')
  })
})

describe('safeDownloadFilename', () => {
  test('strips path separators and unsafe characters', () => {
    expect(safeDownloadFilename('INV/2026/0001.pdf')).toBe('INV-2026-0001.pdf')
    expect(safeDownloadFilename('a\\b.pdf')).toBe('a-b.pdf')
    expect(safeDownloadFilename('..\\..\\evil.pdf')).toBe('evil.pdf')
  })

  test('falls back when nothing usable remains', () => {
    expect(safeDownloadFilename('', 'invoice.pdf')).toBe('invoice.pdf')
    expect(safeDownloadFilename(null, 'invoice.pdf')).toBe('invoice.pdf')
  })
})

describe('extractErrorMessageFromPayload', () => {
  test('extracts detail/message/msg/errors shapes', () => {
    expect(extractErrorMessageFromPayload({ detail: 'Invoice PDF could not be generated' })).toBe('Invoice PDF could not be generated')
    expect(extractErrorMessageFromPayload({ message: 'boom' })).toBe('boom')
    expect(extractErrorMessageFromPayload({ msg: 'nope' })).toBe('nope')
    expect(extractErrorMessageFromPayload([{ msg: 'a' }, { msg: 'b' }])).toBe('a, b')
  })

  test('ignores HTML responses', () => {
    expect(extractErrorMessageFromPayload('<html><body>Server Error</body></html>')).toBeNull()
  })
})

describe('decodeBlobErrorMessage', () => {
  const makeError = (data) => ({ response: { data } })

  test('decodes JSON detail inside a Blob', async () => {
    const blob = new Blob([JSON.stringify({ detail: 'Invoice PDF could not be generated' })], { type: 'application/json' })
    expect(await decodeBlobErrorMessage(makeError(blob), 'fallback')).toBe('Invoice PDF could not be generated')
  })

  test('decodes JSON message inside a Blob', async () => {
    const blob = new Blob([JSON.stringify({ message: 'Payment failed' })], { type: 'application/json' })
    expect(await decodeBlobErrorMessage(makeError(blob), 'fallback')).toBe('Payment failed')
  })

  test('falls back to plain text Blob content', async () => {
    const blob = new Blob(['Plain backend message'], { type: 'text/plain' })
    expect(await decodeBlobErrorMessage(makeError(blob), 'fallback')).toBe('Plain backend message')
  })

  test('ignores HTML Blob content and uses fallback', async () => {
    const blob = new Blob(['<html><body>oops</body></html>'], { type: 'text/html' })
    expect(await decodeBlobErrorMessage(makeError(blob), 'fallback')).toBe('fallback')
  })

  test('handles non-Blob errors with detail', async () => {
    expect(await decodeBlobErrorMessage({ response: { data: { detail: 'Not found' } } }, 'fallback')).toBe('Not found')
  })

  test('uses the fallback when nothing is readable', async () => {
    expect(await decodeBlobErrorMessage({ response: { data: {} } }, 'fallback')).toBe('fallback')
    expect(await decodeBlobErrorMessage(null, 'fallback')).toBe('fallback')
  })
})

describe('downloadBlob', () => {
  let clickSpy

  beforeEach(() => {
    window.URL.createObjectURL = vi.fn(() => 'blob:mock')
    window.URL.revokeObjectURL = vi.fn()
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('triggers a browser download with the given filename', () => {
    const blob = new Blob(['%PDF-'], { type: 'application/pdf' })
    downloadBlob(blob, 'INV-2026-0001.pdf')

    expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})
