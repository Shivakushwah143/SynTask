import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_SIZE, formatFileSize, getUploadErrorMessage } from './files'

describe('file upload helpers', () => {
  it('formats file sizes in human-readable units', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2 * 1024)).toBe('2 KB')
    expect(formatFileSize(3.5 * 1024 * 1024)).toBe('3.5 MB')
    expect(formatFileSize(1.25 * 1024 * 1024 * 1024)).toBe('1.25 GB')
    expect(formatFileSize(null)).toBe('')
  })

  it('exposes a 200 MB cap matching the backend general upload limit', () => {
    expect(MAX_UPLOAD_SIZE).toBe(200 * 1024 * 1024)
  })

  it('prefers the backend detail message', () => {
    const message = getUploadErrorMessage({
      response: { status: 400, data: { detail: 'File type not allowed' } },
    })
    expect(message).toBe('File type not allowed')
  })

  it('shows a clear message for 413 responses without a detail', () => {
    const message = getUploadErrorMessage({ response: { status: 413 } })
    expect(message).toContain('200 MB')
    expect(message).toContain('too large')
  })

  it('falls back to a generic message', () => {
    expect(getUploadErrorMessage({})).toBe('Failed to upload file. Please try again.')
  })
})
