// utils/download.js - shared helpers for Blob downloads and Blob error decoding.

export const DEFAULT_DOWNLOAD_FILENAME = 'download.pdf'

// Handles `filename="x.pdf"`, `filename=x.pdf` and `filename*=UTF-8''x.pdf`.
const FILENAME_RE = /filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i

const decodeMaybeEncoded = (name) => {
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

/**
 * Extract the download filename from a Content-Disposition header.
 * Falls back to `fallback` when the header is missing or unparseable.
 */
export function getDownloadFilename(contentDisposition, fallback = DEFAULT_DOWNLOAD_FILENAME) {
  if (contentDisposition && typeof contentDisposition === 'string') {
    const match = contentDisposition.match(FILENAME_RE)
    if (match && match[1]) {
      const name = match[1].trim().replace(/^["']|["']$/g, '')
      if (name && !/^(attachment|inline)$/i.test(name)) {
        return decodeMaybeEncoded(name)
      }
    }
  }
  return fallback
}

/**
 * Make a filename safe for `a[download]` (strip path separators and control
 * characters, collapse separators, cap the length).
 */
export function safeDownloadFilename(name, fallback = DEFAULT_DOWNLOAD_FILENAME) {
  const cleaned = String(name || '')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return cleaned || fallback
}

/** Trigger a browser download for a Blob with the given filename. */
export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/**
 * Pull a human-readable message out of an unknown error payload.
 * Understands { detail, message, msg, errors } shapes and arrays of them.
 */
export function extractErrorMessageFromPayload(payload) {
  if (!payload) return null
  if (typeof payload === 'string') {
    if (/<html[\s>]/i.test(payload)) return null
    return payload
  }
  if (Array.isArray(payload)) {
    const messages = payload.map(extractErrorMessageFromPayload).filter(Boolean)
    return messages.length ? messages.join(', ') : null
  }
  if (typeof payload === 'object') {
    return (
      extractErrorMessageFromPayload(payload.detail) ||
      extractErrorMessageFromPayload(payload.message) ||
      extractErrorMessageFromPayload(payload.msg) ||
      extractErrorMessageFromPayload(payload.errors) ||
      null
    )
  }
  return null
}

/**
 * Decode an Axios error whose response body is a Blob (responseType: 'blob').
 * FastAPI returns JSON like {"detail": "..."}; the Blob may also hold plain
 * text. Falls back to the caller-provided message when nothing is readable.
 */
export async function decodeBlobErrorMessage(error, fallback = 'Request failed') {
  const blob = error?.response?.data
  if (blob && typeof blob.text === 'function') {
    try {
      const text = await blob.text()
      if (text) {
        try {
          const message = extractErrorMessageFromPayload(JSON.parse(text))
          if (message) return message
        } catch {
          // Not JSON - fall through to plain text handling.
        }
        if (!/^\s*</.test(text)) {
          return text.trim()
        }
      }
    } catch {
      // Blob could not be read; use the fallback below.
    }
  }
  return error?.response?.data?.detail || error?.message || fallback
}
